// quorly-book-call: the public "Book a 15-minute call" form on quorly.ca.
// Mirror of kolis-book-call, pointed at boards and associations.
//
// The outreach email has always promised a call and linked to ?book=1 — which
// nothing handled, so the most interested reader we get landed on a marketing page.
// This is the other end of that link. No auth (public form); deploy --no-verify-jwt.
// A hidden honeypot field blocks bots.
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <hello@quorly.ca>";
const REPLY_TO_US = Deno.env.get("QUORLY_REPLY_EMAIL") || "shaloderick@gmail.com";
const TO = [REPLY_TO_US];
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

async function rest(path: string, init: RequestInit) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const b = await req.json().catch(() => ({} as Record<string, string>));
    if (b.website) return json({ ok: true });                  // honeypot filled → silently drop

    const name = (b.name || "").trim();
    const email = (b.email || "").trim();
    const phone = (b.phone || "").trim();
    // Name and phone are both required: this books a CALL, and an address alone
    // leaves us mailing someone who asked to be spoken to. Email stays optional —
    // it is what ties a booking back to the prospect we cold-emailed.
    if (!name || !phone) return json({ error: "name_and_phone_required" }, 400);

    const organization = (b.organization || "").trim();
    const role = (b.role || "").trim();
    const preferred = (b.preferred || "").trim();
    const note = (b.note || "").trim();
    const lang = b.lang === "fr" ? "fr" : "en";

    // If they came from a cold email, tie the booking back to that prospect and take
    // them out of the cadence — someone asking for a call must not keep being nudged.
    let prospect_id: string | null = null;
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      try {
        const pr = await rest(`quorly_outreach?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id,status`, { method: "GET" });
        const rows = await pr.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.id) {
          prospect_id = rows[0].id;
          await rest(`quorly_outreach?id=eq.${prospect_id}`, {
            method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "engaged", stage: "booked", next_due_at: null }),
          }).catch(() => {});
        }
      } catch { /* the booking matters more than the attribution */ }
    }

    // Persist first, so a request is never lost when the email provider is down.
    let rowId: string | null = null;
    try {
      const r = await rest("quorly_call_requests", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name, organization: organization || null, role: role || null, phone: phone || null, email: email || null, preferred: preferred || null, note: note || null, lang, prospect_id }),
      });
      const rows = await r.json().catch(() => []);
      rowId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
    } catch { /* fall through to the email */ }

    if (!RESEND) return json({ ok: true, saved: !!rowId, sent: false, error: "email provider not configured" });

    const rows: [string, string][] = [
      ["Name / Nom", name],
      ["Organization / Organisation", organization || "—"],
      ["Role / Fonction", role || "—"],
      ["Email", email || "—"],
      ["Phone / Téléphone", phone || "—"],
      ["Preferred time / Moment préféré", preferred || "—"],
      ["Note", note || "—"],
      ["Language / Langue", lang.toUpperCase()],
      ["From a cold email? / Suite à un courriel ?", prospect_id ? "yes — prospect marked engaged" : "no"],
    ];
    const trs = rows.map(([k, v]) =>
      `<tr><td style="padding:8px 12px;color:#6B6675;font-weight:700;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:8px 12px;color:#14131A">${esc(v)}</td></tr>`).join("");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
      <div style="background:#2F3AA3;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800;font-size:16px">📞 New call request — Quorly</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #ECE9E2;border-top:none;border-radius:0 0 12px 12px">${trs}</table>
      <p style="color:#9b97a6;font-size:12px;margin-top:14px">Submitted from the quorly.ca “Book a 15-minute call” form.</p>
    </div>`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nFrom the quorly.ca book-a-call form.";

    const payload: Record<string, unknown> = {
      from: FROM, to: TO,
      subject: `📞 Call request — ${name}${organization ? " · " + organization : ""}`,
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
      rest(`quorly_call_requests?id=eq.${rowId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ email_id: emailId }),
      }).catch(() => {});
    }
    return json({ ok: true, saved: !!rowId, sent: true, id: emailId, prospect: !!prospect_id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
