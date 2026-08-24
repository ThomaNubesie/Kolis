// kolis-freight-rate: live LTL rating via Freightcom, with the Kolis margin applied.
// POST { origin:{postal,city,region,country}, destination:{...}, pallets:int,
//        weight_lb:number, l,w,h (in), freight_class?, ship_date?,
//        accessorials?:string[], residential_end?:'pickup'|'delivery'|'both' }
//   → { ok, tiers:[{name, price, transit_days, service_id, residential_surcharge?}], currency, accessorials_applied }
// Accessorials map to Freightcom booleans: residential → details.origin/destination.residential
// (per residential_end, default delivery); liftgate → destination.tailgate_required;
// appointment → packaging_properties.pallet_service_details.appointment_delivery.
// If the accessorial rate returns nothing we retry WITHOUT them so a price still shows.
// residential_surcharge is pulled from each rate's charge line-items when itemized.
// If FREIGHTCOM_API_KEY is unset or the call fails → { concierge:true }.
const KEY = Deno.env.get("FREIGHTCOM_API_KEY");
const BASE = Deno.env.get("FREIGHTCOM_BASE") || "https://external-api.freightcom.com";
const AUTH_HEADER = Deno.env.get("FREIGHTCOM_AUTH_HEADER") || "Authorization";
const AUTH_PREFIX = Deno.env.get("FREIGHTCOM_AUTH_PREFIX") ?? "";
const MARGIN_FLAT = Number(Deno.env.get("KOLIS_FREIGHT_MARGIN_FLAT") || 30);
const MARGIN_PCT = Number(Deno.env.get("KOLIS_FREIGHT_MARGIN_PCT") || 0.15);
const MAX_TIERS = Number(Deno.env.get("KOLIS_FREIGHT_MAX_TIERS") || 20);
const kolisPrice = (cost: number) => Math.round((cost + Math.max(MARGIN_FLAT, cost * MARGIN_PCT)) * 100) / 100;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const authHeaders = () => ({ [AUTH_HEADER]: `${AUTH_PREFIX}${KEY}`, "Content-Type": "application/json" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function money(m: any): number { const v = m?.value ?? m; const n = typeof v === "string" ? parseFloat(v) : Number(v); return isFinite(n) ? n / 100 : NaN; }

// Pull the residential surcharge out of a rate's charge line-items when the carrier itemizes it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function residentialSurcharge(r: any): number | undefined {
  const arrs = [r?.surcharges, r?.charges, r?.service_charges, r?.accessorial_charges, r?.detailed_charges, r?.valued_at_charges].filter(Array.isArray);
  let dollars = 0; let found = false;
  for (const arr of arrs) for (const c of arr) {
    const label = String(c?.name ?? c?.type ?? c?.description ?? c?.code ?? "").toLowerCase();
    if (/residential/.test(label)) { const a = money(c?.amount ?? c?.total ?? c?.value ?? c?.charge); if (isFinite(a) && a > 0) { dollars += a; found = true; } }
  }
  return found ? Math.round(dollars) : undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!KEY) return json({ concierge: true, reason: "not_configured" });

  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const o = (b.origin || {}) as Record<string, string>;
    const d = (b.destination || {}) as Record<string, string>;
    if (!o.postal || !d.postal) return json({ concierge: true, reason: "need_postal" });

    const pallets = Math.max(1, Number(b.pallets) || 1);
    const weight = Number(b.weight_lb) || 500;
    const cuboid = { unit: "in", l: Number(b.l) || 48, w: Number(b.w) || 40, h: Number(b.h) || 48 };
    const ship = (b.ship_date as string) || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const [yy, mm, dd] = ship.split("-").map(Number);

    const accs = new Set((Array.isArray(b.accessorials) ? b.accessorials : []).map((x) => String(x).toLowerCase()));
    const wantRes = accs.has("residential");
    const wantLift = accs.has("liftgate");
    const wantAppt = accs.has("appointment");
    const hasAcc = wantRes || wantLift || wantAppt;
    const resEnd = String(b.residential_end || "delivery").toLowerCase();
    const resAtPickup = wantRes && (resEnd === "pickup" || resEnd === "both");
    const resAtDelivery = wantRes && (resEnd === "delivery" || resEnd === "both");

    const addr = (a: Record<string, string>) => ({
      name: a.name || "Business",
      address: { address_line_1: a.line1 || a.city || "", city: a.city || "", region: a.region || "", country: a.country || "CA", postal_code: (a.postal || "").toUpperCase().replace(/\s/g, "") },
    });

    const buildBody = (withAcc: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origin = addr(o) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const destination = addr(d) as any;
      if (withAcc) {
        if (resAtPickup) origin.residential = true;
        if (resAtDelivery) destination.residential = true;
        if (wantLift) destination.tailgate_required = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const packaging_properties: any = {
        pallet_type: "ltl",
        has_stackable_pallets: false,
        pallets: Array.from({ length: pallets }, () => ({
          measurements: { weight: { unit: "lb", value: weight }, cuboid },
          description: (b.description as string) || "General freight",
          freight_class: String(b.freight_class || "70"),
        })),
      };
      if (withAcc && wantAppt) packaging_properties.pallet_service_details = { appointment_delivery: true };
      return {
        services: [] as string[],
        details: { origin, destination, expected_ship_date: { year: yy, month: mm, day: dd }, packaging_type: "pallet", packaging_properties },
      };
    };

    async function getRates(reqBody: unknown): Promise<{ rates: unknown[]; rateId?: string; err?: string; detail?: string }> {
      const started = await fetch(`${BASE}/rate`, { method: "POST", headers: authHeaders(), body: JSON.stringify(reqBody) });
      if (!started.ok) return { rates: [], err: `rate_${started.status}`, detail: (await started.text()).slice(0, 300) };
      const startedJson = await started.json().catch(() => ({}));
      const rateId = startedJson.request_id || startedJson.id || startedJson.rate_id;
      if (!rateId) return { rates: [], err: "no_rate_id" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rates: any[] = [];
      // Show results fast: stop as soon as all carriers are in (status.done) OR a solid
      // batch has arrived after a couple of polls. We still KEEP up to MAX_TIERS, but we
      // don't make the shipper wait for all 20 to trickle in.
      for (let i = 0; i < 12; i++) {
        await sleep(i === 0 ? 900 : 1500);
        const pr = await fetch(`${BASE}/rate/${rateId}`, { headers: authHeaders() });
        if (!pr.ok) continue;
        const pj = await pr.json().catch(() => ({}));
        if (Array.isArray(pj.rates)) rates = pj.rates;
        if (pj.status?.done) break;              // every carrier responded
        if (rates.length >= 8 && i >= 3) break;   // enough good options — don't stall the UI
      }
      return { rates, rateId };
    }

    let { rates, rateId, err, detail } = await getRates(buildBody(true));
    let accessorials_applied = hasAcc;
    if (!rates.length && hasAcc) {
      const retry = await getRates(buildBody(false));
      rates = retry.rates; rateId = retry.rateId; accessorials_applied = false;
      if (retry.err) { err = retry.err; detail = retry.detail; }
    }
    if (!rates.length) return json({ concierge: true, reason: err || "no_rates", detail });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const norm = rates.map((r: any) => ({ cost: money(r.total), transit: Number(r.transit_time_days) || 99, service_id: r.service_id, carrier: r.carrier_name || r.carrier || "Transporteur", res: accessorials_applied ? residentialSurcharge(r) : undefined }))
      .filter((r) => isFinite(r.cost) && r.cost > 0);
    if (!norm.length) return json({ concierge: true, reason: "parse" });

    const cap = (s: string) => String(s || "").split(" ").map((w) => (w && w === w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
    const sorted = [...norm].sort((a, b2) => a.cost - b2.cost);
    const seen = new Set<string>();
    const tiers: { name: string; price: number; transit_days: number; service_id: string; residential_surcharge?: number }[] = [];
    for (const r of sorted) {
      const name = cap(r.carrier);
      if (seen.has(name)) continue;
      seen.add(name);
      tiers.push({ name, price: kolisPrice(r.cost), transit_days: r.transit, service_id: r.service_id, ...(r.res ? { residential_surcharge: r.res } : {}) });
      if (tiers.length >= MAX_TIERS) break;
    }
    return json({ ok: true, tiers, currency: "CAD", rate_id: rateId, accessorials_applied });
  } catch (e) {
    return json({ concierge: true, reason: "error", detail: String((e as Error)?.message ?? e).slice(0, 200) });
  }
});
