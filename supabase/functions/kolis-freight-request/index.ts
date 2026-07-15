// kolis-freight-request: concierge MVP for Kolis Freight (LTL pallets).
// A merchant submits pallet details; we save the request and email the Kolis team
// so they can pull a carrier rate manually and quote back. No aggregator yet.
// Public (deploy --no-verify-jwt); hidden honeypot blocks bots.
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis · Business <noreply@loadq.ca>";
const TO = ["marketing@concordexpress.ca", "shaloderick@gmail.com"];
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    if (b.website) return json({ ok: true });                       // honeypot
    const origin = String(b.origin || "").trim(), destination = String(b.destination || "").trim();
    if (!origin || !destination) return json({ error: "origin_dest_required" }, 400);
    const contact = String(b.contact || "").trim(), phone = String(b.phone || "").trim();
    if (!contact || !phone) return json({ error: "contact_phone_required" }, 400);

    const rec = {
      business: String(b.business || "").trim() || null,
      contact, email: String(b.email || "").trim() || null, phone,
      origin, destination,
      pallets: Number(b.pallets) || 1,
      weight: String(b.weight || "").trim() || null,
      dims: String(b.dims || "").trim() || null,
      accessorials: Array.isArray(b.accessorials) ? b.accessorials.map(String) : [],
      note: String(b.note || "").trim() || null,
      lang: b.lang === "fr" ? "fr" : "en",
    };

    // persist first (never lose a lead)
    let rowId: string | null = null;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/kolis_freight_requests`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(rec) });
      if (r.ok) { const rows = await r.json().catch(() => []); rowId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null; }
    } catch { /* ignore */ }

    if (!RESEND) return json({ ok: true, saved: !!rowId, sent: false });

    const rows: [string, string][] = [
      ["Business / Entreprise", rec.business || "—"],
      ["Contact", rec.contact],
      ["Phone / Téléphone", rec.phone],
      ["Email", rec.email || "—"],
      ["Origin / Origine", rec.origin],
      ["Destination", rec.destination],
      ["Pallets / Palettes", String(rec.pallets)],
      ["Weight / Poids", rec.weight || "—"],
      ["Dimensions", rec.dims || "—"],
      ["Accessorials", rec.accessorials.length ? rec.accessorials.join(", ") : "—"],
      ["Note", rec.note || "—"],
    ];
    const trs = rows.map(([k, v]) => `<tr><td style="padding:8px 12px;color:#6B6675;font-weight:700;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:8px 12px;color:#1a1722">${esc(v)}</td></tr>`).join("");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px">
      <div style="background:#E11D6B;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800;font-size:16px">🚛 New freight quote request — Kolis · Business</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #ECECF2;border-top:none">${trs}</table>
      <p style="color:#9b97a6;font-size:12px;margin-top:12px">Pull the LTL rate (Freightcom/ClickShip), add the Kolis margin, then quote the merchant back. Logged in admin → Fret.</p>
    </div>`;
    const payload: Record<string, unknown> = {
      from: FROM, to: TO,
      subject: `🚛 Freight quote — ${rec.origin} → ${rec.destination} · ${rec.pallets} pallet(s)${rec.business ? " · " + rec.business : ""}`,
      html, text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
    };
    if (rec.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) payload.reply_to = rec.email;

    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = await res.json().catch(() => ({}));
    const emailId = (out as { id?: string }).id;
    if (rowId && emailId) fetch(`${SB_URL}/rest/v1/kolis_freight_requests?id=eq.${rowId}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ email_id: emailId }) }).catch(() => {});
    return json({ ok: true, saved: !!rowId, sent: res.ok, id: emailId });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
