// kolis-freight-rate: live LTL rating via Freightcom, with the Kolis margin applied.
// POST { origin:{postal,city,region,country}, destination:{...}, pallets:int,
//        weight_lb:number, l,w,h (in), freight_class?, ship_date? }
//   → { ok, tiers:[{name, price, transit_days, service_id}], currency }
// If FREIGHTCOM_API_KEY is unset or the call fails → { concierge:true } so the
// front-end falls back to the manual quote-request flow (never blocks the lead).
//
// Freightcom API (external-api.freightcom.com): POST /rate returns 202 + {id};
// poll GET /rate/{id} until status.done. Auth header name/format is confirmed
// per account — override with FREIGHTCOM_AUTH_HEADER / FREIGHTCOM_AUTH_PREFIX.
const KEY = Deno.env.get("FREIGHTCOM_API_KEY");
const BASE = Deno.env.get("FREIGHTCOM_BASE") || "https://external-api.freightcom.com";
const AUTH_HEADER = Deno.env.get("FREIGHTCOM_AUTH_HEADER") || "Authorization";
const AUTH_PREFIX = Deno.env.get("FREIGHTCOM_AUTH_PREFIX") ?? ""; // e.g. "Bearer "
// Kolis margin: greater of $30 or 15%.
const MARGIN_FLAT = Number(Deno.env.get("KOLIS_FREIGHT_MARGIN_FLAT") || 30);
const MARGIN_PCT = Number(Deno.env.get("KOLIS_FREIGHT_MARGIN_PCT") || 0.15);
const kolisPrice = (cost: number) => Math.round((cost + Math.max(MARGIN_FLAT, cost * MARGIN_PCT)) * 100) / 100;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const authHeaders = () => ({ [AUTH_HEADER]: `${AUTH_PREFIX}${KEY}`, "Content-Type": "application/json" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function money(m: any): number { const v = m?.value ?? m; const n = typeof v === "string" ? parseFloat(v) : Number(v); return isFinite(n) ? n / 100 : NaN; } // Freightcom Money is integer cents (string)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!KEY) return json({ concierge: true, reason: "not_configured" });

  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const o = (b.origin || {}) as Record<string, string>;
    const d = (b.destination || {}) as Record<string, string>;
    // Live rating needs postal codes at minimum — otherwise defer to concierge.
    if (!o.postal || !d.postal) return json({ concierge: true, reason: "need_postal" });

    const pallets = Math.max(1, Number(b.pallets) || 1);
    const weight = Number(b.weight_lb) || 500;
    const cuboid = { unit: "in", l: Number(b.l) || 48, w: Number(b.w) || 40, h: Number(b.h) || 48 };
    const ship = (b.ship_date as string) || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const [yy, mm, dd] = ship.split("-").map(Number);

    const addr = (a: Record<string, string>) => ({
      name: a.name || "Business",
      address: { address_line_1: a.line1 || a.city || "", city: a.city || "", region: a.region || "", country: a.country || "CA", postal_code: (a.postal || "").toUpperCase().replace(/\s/g, "") },
    });
    const body = {
      services: [] as string[],
      details: {
        origin: addr(o), destination: addr(d),
        expected_ship_date: { year: yy, month: mm, day: dd },
        packaging_type: "pallet",
        packaging_properties: {
          pallet_type: "ltl",
          has_stackable_pallets: false,
          pallets: Array.from({ length: pallets }, () => ({
            measurements: { weight: { unit: "lb", value: weight }, cuboid },
            description: (b.description as string) || "General freight",
            freight_class: String(b.freight_class || "70"),
          })),
        },
      },
    };

    // 1) submit rate request
    const started = await fetch(`${BASE}/rate`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    if (!started.ok) return json({ concierge: true, reason: `rate_${started.status}`, detail: (await started.text()).slice(0, 300) });
    const startedJson = await started.json().catch(() => ({}));
    const rateId = startedJson.request_id || startedJson.id || startedJson.rate_id;
    if (!rateId) return json({ concierge: true, reason: "no_rate_id" });

    // 2) poll for results (async API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rates: any[] = [];
    for (let i = 0; i < 16; i++) {
      await sleep(i === 0 ? 1000 : 2000);
      const pr = await fetch(`${BASE}/rate/${rateId}`, { headers: authHeaders() });
      if (!pr.ok) continue;
      const pj = await pr.json().catch(() => ({}));
      if (Array.isArray(pj.rates)) rates = pj.rates;
      if (pj.status?.done) break;                 // all carriers in
      if (rates.length >= 6 && i >= 7) break;      // enough options + a fair wait
    }
    if (!rates.length) return json({ concierge: true, reason: "no_rates" });

    // 3) normalize + apply margin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const norm = rates.map((r: any) => ({ cost: money(r.total), transit: Number(r.transit_time_days) || 99, service_id: r.service_id, carrier: r.carrier_name || r.carrier || "Transporteur", service: r.service_name || r.service || "" }))
      .filter((r) => isFinite(r.cost) && r.cost > 0);
    if (!norm.length) return json({ concierge: true, reason: "parse" });

    // Return up to 5 carrier options, cheapest first (one row per carrier — its cheapest service).
    const cap = (s: string) => String(s || "").split(" ").map((w) => (w && w === w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
    const sorted = [...norm].sort((a, b2) => a.cost - b2.cost);
    const seen = new Set<string>();
    const tiers: { name: string; price: number; transit_days: number; service_id: string }[] = [];
    for (const r of sorted) {
      const name = cap(r.carrier);
      if (seen.has(name)) continue;
      seen.add(name);
      tiers.push({ name, price: kolisPrice(r.cost), transit_days: r.transit, service_id: r.service_id });
      if (tiers.length >= 5) break;
    }
    return json({ ok: true, tiers, currency: "CAD", rate_id: rateId });
  } catch (e) {
    return json({ concierge: true, reason: "error", detail: String((e as Error)?.message ?? e).slice(0, 200) });
  }
});
