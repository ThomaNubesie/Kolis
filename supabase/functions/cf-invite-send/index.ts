// cf-invite-send — send Quorly invite(s): join link + short member code. Email via Resend / SMS via Twilio.
// POST { token?, form_id?, contact?, base_url }. Deploy with verify_jwt=FALSE; auth enforced INSIDE
// (getUser on Bearer + admin-ownership). Retries transient provider failures (429 / 5xx).
// CORS must list x-client-info (supabase-js sends it) or the browser silently drops the POST.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
// Sending identity — flip to "Quorly <noreply@quorly.ca>" once quorly.ca is verified in Resend.
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) { const r = await fetch(url, init); if (r.ok || (r.status !== 429 && r.status < 500)) return r; last = r; await sleep(600 * (i + 1)); }
  return last as Response;
}
async function sendEmail(to: string, formName: string, link: string, code: string) {
  if (!RESEND) return { ok: false, error: "resend_key_missing" };
  const r = await fetchRetry("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: `You're invited to “${formName}” on Quorly`, text: `You've been invited to "${formName}" on Quorly — a shared, colour-coded form your group fills in together.\n\nJoin: ${link}${code ? "\n\nMember code: " + code : ""}\n\nNot expecting this? You can safely ignore this email.\nQuorly · loadq.ca`, html:
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto"><div style="background:#2F3AA3;color:#fff;font-weight:800;font-size:14px;padding:12px 16px;border-radius:10px 10px 0 0">Quorly</div><div style="border:1px solid #EAE4DA;border-top:0;border-radius:0 0 12px 12px;padding:18px 16px;color:#1C1B19"><p style="font-size:14px;line-height:1.5">You've been invited to <b>${formName}</b>.</p><a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:11px 18px;border-radius:10px;margin-top:8px">Join &amp; verify →</a>${code ? `<div style="margin-top:14px;font-size:13px;color:#1C1B19">Or enter your member code:</div><div style="font-family:ui-monospace,Menlo,monospace;font-size:24px;font-weight:900;letter-spacing:5px;background:#F7F4EE;border:1px solid #EAE4DA;border-radius:8px;padding:11px 14px;text-align:center;margin-top:6px">${[...code].map((c, i) => `<span style="color:${["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"][i % 4]}">${c}</span>`).join("")}</div>` : ""}<p style="color:#98A0AE;font-size:11px;margin-top:14px">Or paste this link: ${link}</p><p style="color:#98A0AE;font-size:11px;margin-top:12px;border-top:1px solid #EAE4DA;padding-top:10px">Quorly — collaborative, colour-coded forms your group fills in together. If you weren't expecting this invite, you can safely ignore this email.</p></div></div>` }) });
  if (r.ok) return { ok: true };
  return { ok: false, error: `resend_${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}` };
}
async function sendSms(phone: string, formName: string, link: string, code: string) {
  if (!(TW_SID && TW_TOKEN && TW_FROM)) return { ok: false, error: "twilio_not_configured" };
  let to = String(phone).replace(/[^\d+]/g, ""); if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
  const line = `You've been invited to “${formName}” on Quorly.${code ? ` Member code: ${code}.` : ""} Join here: ${link}`;
  const b = new URLSearchParams({ To: to, Body: line }); TW_FROM.startsWith("MG") ? b.set("MessagingServiceSid", TW_FROM) : b.set("From", TW_FROM);
  const r = await fetchRetry(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: b.toString() });
  if (r.ok) return { ok: true };
  return { ok: false, error: `twilio_${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}` };
}
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({} as any));
    const secretOk = req.headers.get("x-kolis-secret") === CF_SECRET;
    // Secret-gated test send (deliverability testing) — no form/JWT needed.
    if (secretOk && body.test_to) {
      const r = await sendEmail(String(body.test_to), body.form_name || "Your test form", body.link || "https://quorly-app.netlify.app/join?token=TEST", body.code || "AB12CD");
      return json({ ok: r.ok, test: true, error: r.error });
    }
    // Normal flow needs the form admin's JWT; the server secret bypasses it (operator resend).
    let uid: string | null = null;
    if (!secretOk) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      uid = u.user.id;
    }
    const { token, form_id, contact, base_url, channel } = body;
    let formId = form_id as string | undefined;
    if (!formId && token) { const { data: m0 } = await admin.from("cf_members").select("form_id").eq("invite_token", token).maybeSingle(); formId = m0?.form_id; }
    if (!formId) return json({ error: "no_form" }, 400);
    const { data: form } = await admin.from("cf_forms").select("name, admin_id").eq("id", formId).maybeSingle();
    if (!form) return json({ error: "form_not_found" }, 404);
    if (!secretOk && form.admin_id !== uid) return json({ error: "not_admin" }, 403);
    const formName = form.name ?? "a Quorly form";
    const base = (base_url || "https://quorly.ca").replace(/\/$/, "");
    let q = admin.from("cf_members").select("email, phone, invite_token, invite_code").eq("form_id", formId).eq("status", "invited").not("invite_token", "is", null);
    if (token) q = q.eq("invite_token", token);
    if (contact) { const c = String(contact).trim(); q = q.or(`email.eq.${c},phone.eq.${c}`); }
    const { data: rows } = await q;
    const pending = rows ?? [];
    if (pending.length === 0) return json({ ok: true, results: [], note: "no_pending_invites" });
    const results: any[] = [];
    for (const m of pending) {
      const link = `${base}/join?token=${encodeURIComponent(m.invite_token as string)}`;
      const code = (m.invite_code as string) || "";
      const label = m.email || m.phone || "?";
      let res: { ok: boolean; error?: string };
      if (channel === "sms") res = m.phone ? await sendSms(m.phone as string, formName, link, code) : { ok: false, error: "no_phone" };
      else if (channel === "email") res = m.email ? await sendEmail(m.email as string, formName, link, code) : { ok: false, error: "no_email" };
      else if (m.email) res = await sendEmail(m.email as string, formName, link, code);
      else if (m.phone) res = await sendSms(m.phone as string, formName, link, code);
      else res = { ok: false, error: "no_contact" };
      if (!res.ok) console.error(`cf-invite-send failed for ${label}: ${res.error}`);
      results.push({ contact: label, channel: m.email ? "email" : "sms", ok: res.ok, error: res.error });
      await sleep(120);
    }
    const failed = results.filter((r) => !r.ok);
    return json({ ok: failed.length === 0, sent: results.length - failed.length, failed, results });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
