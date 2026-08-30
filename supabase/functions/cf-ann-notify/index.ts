// cf-ann-notify — when an announcement is posted, notify ALL active members of that
// form by EMAIL (everyone) and TEXT (those with a phone). Recipients are computed LIVE
// from the current member list, so new members are automatically included going forward.
// POST { announcement_id, base_url? }. verify_jwt=FALSE; poster JWT enforced inside, OR
// x-kolis-secret for operator. Email FROM the Resend-verified loadq.ca sender.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = "Quorly <noreply@loadq.ca>";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const MMS_MEDIA = "https://quorly.ca/mms-logo"; // branded PNG banner shown on the text (MMS)
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (iso: string, lang: string) => { try { return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric" }); } catch { return iso; } };
async function sms(phone: string, body: string) {
  if (!(TW_SID && TW_TOKEN && TW_FROM)) return { ok: false, error: "twilio_not_configured" };
  let to = String(phone).replace(/[^\d+]/g, ""); if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
  const p = new URLSearchParams({ To: to, Body: body }); TW_FROM.startsWith("MG") ? p.set("MessagingServiceSid", TW_FROM) : p.set("From", TW_FROM);
  if (MMS_MEDIA) p.set("MediaUrl", MMS_MEDIA); // send as MMS with the Quorly banner (auto-falls back to SMS+link if unsupported)
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
  return r.ok ? { ok: true } : { ok: false, error: `twilio_${r.status}` };
}
async function email(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to: [to], subject, html }) });
  return r.ok ? { ok: true } : { ok: false, error: `resend_${r.status}` };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secretOk = req.headers.get("x-kolis-secret") === CF_SECRET;
    let uid: string | null = null;
    if (!secretOk) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      uid = u.user.id;
    }
    const { announcement_id, base_url } = await req.json().catch(() => ({} as any));
    if (!announcement_id) return json({ ok: false, error: "missing_args" }, 400);
    const base = String(base_url || "https://quorly.ca").replace(/\/$/, "");
    const { data: a } = await admin.from("cf_announcements").select("id, form_id, author_id, body, deadline, created_at").eq("id", announcement_id).maybeSingle();
    if (!a) return json({ ok: false, error: "not_found" }, 404);
    // Authorize: operator, the author, or an admin of the form.
    if (!secretOk && a.author_id !== uid) {
      const { data: adminRow } = await admin.from("cf_members").select("id").eq("form_id", a.form_id).eq("user_id", uid).eq("role", "admin").eq("status", "active").maybeSingle();
      const { data: form0 } = await admin.from("cf_forms").select("admin_id").eq("id", a.form_id).maybeSingle();
      if (!adminRow && form0?.admin_id !== uid) return json({ ok: false, error: "not_allowed" }, 403);
    }
    const { data: form } = await admin.from("cf_forms").select("name").eq("id", a.form_id).maybeSingle();
    const formName = form?.name || "Quorly";
    const { data: members } = await admin.from("cf_members").select("user_id, email, phone, lang, name").eq("form_id", a.form_id).eq("status", "active");
    const recips = (members ?? []).filter((m: any) => !a.author_id || m.user_id !== a.author_id);
    const link = `${base}/forms`;
    let emailed = 0, texted = 0, skipped = 0; const failed: any[] = [];
    const seenEmail = new Set<string>(), seenPhone = new Set<string>();
    for (const m of recips) {
      const lang = (m.lang === "fr" ? "fr" : m.lang === "en" ? "en" : "fr");
      const dline = a.deadline ? (lang === "fr" ? `Échéance : ${fmtDate(a.deadline, lang)}` : `Deadline: ${fmtDate(a.deadline, lang)}`) : "";
      // Email
      const e = String(m.email || "").trim().toLowerCase();
      if (RESEND && isEmail(e) && !seenEmail.has(e)) {
        seenEmail.add(e);
        const subject = lang === "fr" ? `📣 ${formName} : nouvelle annonce` : `📣 ${formName}: new announcement`;
        const intro = lang === "fr" ? "Une nouvelle annonce a été publiée :" : "A new announcement was posted:";
        const cta = lang === "fr" ? "Ouvrir dans Quorly" : "Open in Quorly";
        const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto"><div style="background:#2F3AA3;color:#fff;font-weight:800;font-size:14px;padding:12px 16px;border-radius:10px 10px 0 0">${esc(formName)}</div><div style="border:1px solid #EAE4DA;border-top:0;border-radius:0 0 12px 12px;padding:18px 16px;color:#1C1B19"><p style="font-size:13px;color:#6b6862;margin:0 0 10px">${intro}</p><div style="font-size:15px;line-height:1.5;white-space:pre-wrap;border-left:3px solid #2F3AA3;padding:2px 0 2px 12px">${esc(a.body)}</div>${dline ? `<p style="font-size:13px;font-weight:700;color:#A86A12;margin:12px 0 0">⏰ ${esc(dline)}</p>` : ""}<p style="margin:18px 0 0"><a href="${link}" style="background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:13px;padding:10px 16px;border-radius:9px;display:inline-block">${cta}</a></p><p style="color:#98A0AE;font-size:11px;margin-top:16px">Quorly</p></div></div>`;
        const r = await email(e, subject, html); if (r.ok) emailed++; else failed.push({ ch: "email", error: r.error });
      }
      // SMS
      const ph = String(m.phone || "").replace(/[^0-9+]/g, "");
      if (ph && !seenPhone.has(ph)) {
        seenPhone.add(ph);
        const trimmed = a.body.length > 240 ? a.body.slice(0, 237) + "…" : a.body;
        const body = `${formName} — ${trimmed}${dline ? "\n" + dline : ""}\n${link}`;
        const r = await sms(ph, body); if (r.ok) texted++; else failed.push({ ch: "sms", error: r.error });
      }
      if (!isEmail(e) && !ph) skipped++;
    }
    return json({ ok: true, recipients: recips.length, emailed, texted, skipped, failed });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
