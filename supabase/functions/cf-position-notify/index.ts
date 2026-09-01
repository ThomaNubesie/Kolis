// cf-position-notify — tell someone they have been given a position.
//
// A title conferred in the console was silent: the person found out only if they
// happened to open the org page and notice a word next to their name. A position is
// a responsibility someone has to accept and act on, so it is announced — by email
// and by MMS, in both languages, the same two channels the assembly is reached on.
//
// POST { member_id }   — the cf_members row that just received the title.
// Auth: the caller's JWT must be an admin of that member's form, or x-kolis-secret.
// Deploy with verify_jwt=FALSE; auth is enforced here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
// loadq.ca is the Resend-VERIFIED domain; quorly.ca still 403s.
const FROM = "Quorly <noreply@loadq.ca>";
const MMS_MEDIA = "https://quorly.ca/mms-logo";
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const SITE = "https://quorly.ca";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function emailHtml(name: string, title: string, where: string) {
  const hi = name ? esc(name.split(" ")[0]) : "";
  const dots = ["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"]
    .map((c) => `<td width="10"><div style="width:9px;height:9px;border-radius:50%;background:${c};font-size:0;line-height:0">&nbsp;</div></td>`).join('<td width="5">&nbsp;</td>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:22px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <tr><td bgcolor="#2F3AA3" style="background:#2F3AA3;padding:18px 26px">
    <table role="presentation" width="100%"><tr>
      <td style="color:#fff;font-size:19px;font-weight:900">Quorly</td>
      <td align="right"><table role="presentation"><tr>${dots}</tr></table></td>
    </tr></table></td></tr>
  <tr><td style="font-size:0;line-height:0"><table role="presentation" width="100%"><tr>
    <td bgcolor="#E0574A" height="4"></td><td bgcolor="#2F8F6B" height="4"></td><td bgcolor="#6B4FA3" height="4"></td><td bgcolor="#E0A83B" height="4"></td>
  </tr></table></td></tr>
  <tr><td style="padding:26px 30px 8px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">${esc(where)}</p>
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:#14131A">Vous avez une fonction.</h1>
    <p style="margin:0 0 14px;font-size:14.5px;line-height:1.6;color:#1C1B19">${hi ? hi + ", v" : "V"}ous avez été nommé(e) :</p>
    <table role="presentation" width="100%" style="margin:0 0 16px"><tr>
      <td width="4" bgcolor="#2F3AA3"></td>
      <td style="padding:8px 0 8px 14px;font-size:19px;font-weight:900;color:#2F3AA3">${esc(title)}</td>
    </tr></table>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#1C1B19">Votre fonction apparaît désormais à côté de votre nom, et vos décisions sont enregistrées sous ce titre — horodatées, numérotées et signées.</p>
    <p style="margin:0 0 22px"><a href="${SITE}/forms" style="display:inline-block;background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:14.5px;padding:13px 22px;border-radius:10px">Ouvrir Quorly →</a></p>
  </td></tr>
  <tr><td style="padding:0 30px"><div style="border-top:1px solid #EAE4DA"></div></td></tr>
  <tr><td style="padding:16px 30px 26px">
    <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">In English</p>
    <p style="margin:0 0 11px;font-size:13.5px;line-height:1.6;color:#4a4750">You have been appointed <b>${esc(title)}</b> in ${esc(where)}. The title now appears beside your name, and decisions you record carry it — timestamped, numbered and signed.</p>
    <p style="margin:0"><a href="${SITE}/forms" style="color:#2F3AA3;font-weight:800;font-size:13.5px;text-decoration:none">Open Quorly →</a></p>
  </td></tr>
</table></td></tr></table>`;
}

async function sendEmail(to: string, title: string, where: string, name: string) {
  if (!RESEND) return { ok: false, error: "resend_key_missing" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [to],
      subject: `${where} — vous êtes ${title} · you are now ${title}`,
      html: emailHtml(name, title, where),
    }),
  });
  return r.ok ? { ok: true } : { ok: false, error: `resend_${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
}

async function sendSms(phone: string, title: string, where: string) {
  if (!(TW_SID && TW_TOKEN && TW_FROM)) return { ok: false, error: "twilio_not_configured" };
  let to = String(phone).replace(/[^\d+]/g, "");
  if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
  const body = `${where}\n\nVous avez été nommé(e) : ${title}.\nVos décisions sont enregistrées sous ce titre.\n\nEN: You have been appointed ${title}.\n\n${SITE}/forms`;
  const p = new URLSearchParams({ To: to, Body: body });
  TW_FROM.startsWith("MG") ? p.set("MessagingServiceSid", TW_FROM) : p.set("From", TW_FROM);
  if (MMS_MEDIA) p.set("MediaUrl", MMS_MEDIA);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  return r.ok ? { ok: true } : { ok: false, error: `twilio_${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { member_id } = await req.json().catch(() => ({} as any));
    if (!member_id) return json({ ok: false, error: "missing_member" }, 400);

    const { data: m } = await admin.from("cf_members")
      .select("id, form_id, user_id, name, email, phone, title").eq("id", member_id).maybeSingle();
    if (!m) return json({ ok: false, error: "not_found" }, 404);
    if (!m.title) return json({ ok: false, error: "no_title" }, 400);   // clearing a title is not an announcement

    // Authorise: the operator secret, or an admin of the form the title was given in.
    if (req.headers.get("x-kolis-secret") !== CF_SECRET) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: form } = await admin.from("cf_forms").select("admin_id, name").eq("id", m.form_id).maybeSingle();
      const { data: adminRow } = await admin.from("cf_members").select("id")
        .eq("form_id", m.form_id).eq("user_id", u.user.id).eq("role", "admin").eq("status", "active").maybeSingle();
      if (!adminRow && form?.admin_id !== u.user.id) return json({ ok: false, error: "not_allowed" }, 403);
    }

    const { data: form } = await admin.from("cf_forms").select("name").eq("id", m.form_id).maybeSingle();
    const where = form?.name || "Quorly";
    const out: any = { ok: true, title: m.title, where };

    const e = String(m.email || "").trim().toLowerCase();
    if (isEmail(e)) out.email = await sendEmail(e, m.title, where, String(m.name || ""));
    const ph = String(m.phone || "").replace(/[^\d+]/g, "");
    if (ph.length >= 10) out.sms = await sendSms(ph, m.title, where);
    if (!out.email && !out.sms) out.note = "no_contact_on_file";

    return json(out);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
