// kolis-book-call: public "Book a quick call" form on business.kolis.ca.
// Emails the call request to the Concord sales inboxes. No auth (public form) —
// deploy with --no-verify-jwt. A hidden honeypot field blocks bots.
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis · Business <noreply@loadq.ca>";
const TO = ["marketing@concordexpress.ca", "shaloderick@gmail.com"];
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Best-effort insert into kolis_call_requests (service role). Returns the row id.
async function logRequest(rec: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/kolis_call_requests`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(rec),
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  } catch { return null; }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const b = await req.json().catch(() => ({} as Record<string, string>));
    if (b.website) return json({ ok: true });                 // honeypot filled → silently drop
    const name = (b.name || "").trim();
    const phone = (b.phone || "").trim();
    if (!name || !phone) return json({ error: "name_phone_required" }, 400);
    const business = (b.business || "").trim();
    const email = (b.email || "").trim();
    const preferred = (b.preferred || "").trim();
    const note = (b.note || "").trim();
    const lang = b.lang === "fr" ? "fr" : "en";

    // Persist first so a request is never lost even if the email provider fails.
    const rowId = await logRequest({ name, business: business || null, phone, email: email || null, preferred: preferred || null, note: note || null, lang });

    if (!RESEND) return json({ ok: true, saved: !!rowId, sent: false, error: "email provider not configured" });

    const rows: [string, string][] = [
      ["Name / Nom", name],
      ["Business / Entreprise", business || "—"],
      ["Phone / Téléphone", phone],
      ["Email", email || "—"],
      ["Preferred time / Moment préféré", preferred || "—"],
      ["Note", note || "—"],
      ["Language / Langue", lang.toUpperCase()],
    ];
    const trs = rows.map(([k, v]) =>
      `<tr><td style="padding:8px 12px;color:#6B6675;font-weight:700;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:8px 12px;color:#1a1722">${esc(v)}</td></tr>`).join("");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
      <div style="background:#E11D6B;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800;font-size:16px">📞 New call request — Kolis · Business</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #ECECF2;border-top:none;border-radius:0 0 12px 12px">${trs}</table>
      <p style="color:#9b97a6;font-size:12px;margin-top:14px">Submitted from the business.kolis.ca “Book a quick call” form.</p>
    </div>`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nFrom business.kolis.ca Book-a-call form.";

    const payload: Record<string, unknown> = {
      from: FROM, to: TO,
      subject: `📞 Call request — ${name}${business ? " · " + business : ""} (${phone})`,
      html, text,
    };
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.reply_to = email;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return json({ ok: true, saved: !!rowId, sent: false, error: `${res.status} ${await res.text()}` }, 200);
    const out = await res.json().catch(() => ({}));
    const emailId = (out as { id?: string }).id;
    if (rowId && emailId) {
      fetch(`${SUPABASE_URL}/rest/v1/kolis_call_requests?id=eq.${rowId}`, {
        method: "PATCH",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ email_id: emailId }),
      }).catch(() => {});
    }
    return json({ ok: true, saved: !!rowId, sent: true, id: emailId });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
