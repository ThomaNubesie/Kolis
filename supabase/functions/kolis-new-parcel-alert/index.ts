// kolis-new-parcel-alert: texts + emails the dispatcher when a NEW package
// request comes in (unassigned), with a one-tap link to assign it on mobile.
// Fired by a DB trigger on kolis_parcels insert (pg_net). Bearer = KOLIS_ALERT_KEY.
const ALERT_KEY = Deno.env.get("KOLIS_ALERT_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis · Business <noreply@loadq.ca>";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID");
const TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
const TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM"); // MG… messaging service or a from-number
const ADMIN_PHONE = (Deno.env.get("KOLIS_ADMIN_ALERT_PHONE") || "+16138622639").split(",").map((s) => s.trim()).filter(Boolean);
const ADMIN_EMAIL = (Deno.env.get("KOLIS_ADMIN_ALERT_EMAIL") || "marketing@concordexpress.ca,shaloderick@gmail.com").split(",").map((s) => s.trim()).filter(Boolean);
const APP = Deno.env.get("KOLIS_BUSINESS_URL") || "https://business.kolis.ca";
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function sms(to: string, body: string) {
  if (!TW_SID || !TW_TOKEN || !TW_FROM) return;
  const p = new URLSearchParams({ To: to, Body: body });
  if (TW_FROM.startsWith("MG")) p.set("MessagingServiceSid", TW_FROM); else p.set("From", TW_FROM);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString(),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if ((req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim()) !== ALERT_KEY) return json({ error: "unauthorized" }, 401);
  try {
    const { parcel_id } = await req.json().catch(() => ({}));
    if (!parcel_id) return json({ error: "parcel_id required" }, 400);
    const rows = await (await fetch(`${SB_URL}/rest/v1/kolis_parcels?id=eq.${parcel_id}&select=id,code,from_city,to_city,size,price_cents,recipient_name,dropoff_type,status,driver_id`, { headers: H })).json();
    const p = Array.isArray(rows) ? rows[0] : null;
    if (!p) return json({ error: "not_found" }, 404);
    if (p.driver_id) return json({ ok: true, skipped: "already_assigned" });

    const price = `$${((p.price_cents || 0) / 100).toFixed(0)}`;
    const link = `${APP}/admin/parcels/${p.id}`;
    const body = `🚚 Kolis — nouvelle demande #${p.code} : ${p.from_city} → ${p.to_city} · ${p.size} · ${price}. Assigner un chauffeur : ${link}`;
    for (const to of ADMIN_PHONE) await sms(to, body);

    if (RESEND && ADMIN_EMAIL.length) {
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px">
        <div style="background:#E11D6B;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800">🚚 New package request · #${p.code}</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #ECECF2;border-top:none">
          <tr><td style="padding:8px 12px;color:#6B6675;font-weight:700">Route</td><td style="padding:8px 12px">${p.from_city} → ${p.to_city}</td></tr>
          <tr><td style="padding:8px 12px;color:#6B6675;font-weight:700">Size</td><td style="padding:8px 12px">${p.size}</td></tr>
          <tr><td style="padding:8px 12px;color:#6B6675;font-weight:700">Recipient</td><td style="padding:8px 12px">${p.recipient_name || "—"}</td></tr>
          <tr><td style="padding:8px 12px;color:#6B6675;font-weight:700">Price</td><td style="padding:8px 12px">${price}</td></tr>
        </table>
        <a href="${link}" style="display:inline-block;margin-top:14px;background:#E11D6B;color:#fff;font-weight:800;padding:12px 22px;border-radius:11px;text-decoration:none">Assign a driver →</a></div>`;
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: ADMIN_EMAIL, subject: `🚚 New request #${p.code} — ${p.from_city} → ${p.to_city}`, html }) }).catch(() => {});
    }
    return json({ ok: true, notified: ADMIN_PHONE.length });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
