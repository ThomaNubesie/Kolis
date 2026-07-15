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
function money(m: any): number { const v = m?.value ?? m; const n = typeof v === "string" ? parseFloat(v) : Number(v); return isFinite(n) ? (n > 100000 ? n / 100 : n) : NaN; } // Freightcom Money often in cents

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
          pallets: Array.from({ length: pallets }, () => ({
            measurements: { weight: { unit: "lb", value: weight }, cuboid },
            description: (b.description as string) || "General freight",
            ...(b.freight_class ? { freight_class: String(b.freight_class) } : {}),
          })),
        },
      },
    };

    // 1) submit rate request
    const started = await fetch(`${BASE}/rate`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    if (!started.ok) return json({ concierge: true, reason: `rate_${started.status}`, detail: (await started.text()).slice(0, 300) });
    const startedJson = await started.json().catch(() => ({}));
    const rateId = startedJson.id || startedJson.rate_id;
    if (!rateId) return json({ concierge: true, reason: "no_rate_id" });

    // 2) poll for results (async API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rates: any[] = [];
    for (let i = 0; i < 8; i++) {
      await sleep(i === 0 ? 800 : 1400);
      const pr = await fetch(`${BASE}/rate/${rateId}`, { headers: authHeaders() });
      if (!pr.ok) continue;
      const pj = await pr.json().catch(() => ({}));
      rates = pj.rates || [];
      if (pj.status?.done || (rates.length && pj.status?.complete)) break;
    }
    if (!rates.length) return json({ concierge: true, reason: "no_rates" });

    // 3) normalize + apply margin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const norm = rates.map((r: any) => ({ cost: money(r.total), transit: Number(r.transit_time_days) || 99, service_id: r.service_id }))
      .filter((r) => isFinite(r.cost) && r.cost > 0);
    if (!norm.length) return json({ concierge: true, reason: "parse" });
    const cheapest = [...norm].sort((a, b2) => a.cost - b2.cost)[0];
    const fastest = [...norm].sort((a, b2) => a.transit - b2.transit || a.cost - b2.cost)[0];

    const tiers = [{ name: "Économique", price: kolisPrice(cheapest.cost), transit_days: cheapest.transit, service_id: cheapest.service_id }];
    if (fastest.service_id !== cheapest.service_id && fastest.transit < cheapest.transit)
      tiers.push({ name: "Express", price: kolisPrice(fastest.cost), transit_days: fastest.transit, service_id: fastest.service_id });

    return json({ ok: true, tiers, currency: "CAD", rate_id: rateId });
  } catch (e) {
    return json({ concierge: true, reason: "error", detail: String((e as Error)?.message ?? e).slice(0, 200) });
  }
});
