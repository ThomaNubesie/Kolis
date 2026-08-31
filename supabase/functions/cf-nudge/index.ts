// cf-nudge — a persuasive follow-up to members who were invited and never responded.
//
// cf-invite-send already reaches the same people, but its copy is the neutral "you've
// been invited" notice; someone who ignored that once will ignore it again. This sends
// a DIFFERENT message: why being organised is worth their time, in both languages,
// carrying each member's own join link and member code.
//
// Targets status='invited' ONLY — people who have already joined never get nudged.
//
// POST {
//   form_id,                       // required
//   test_to_email?, test_to_phone? // send ONE message to these instead of any member
//   dry_run?: true,                // list who WOULD be contacted; sends nothing
//   channel?: "email" | "sms",     // default: both, where the contact exists
//   base_url?
// }
// Auth: x-kolis-secret (operator) or the form admin's JWT. Deploy verify_jwt=FALSE.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
// loadq.ca is the Resend-VERIFIED domain. quorly.ca is not verified yet, and sending
// from it returns 403 — do not "upgrade" this line until Resend says the domain is live.
const FROM = "Quorly <noreply@loadq.ca>";
const MMS_MEDIA = "https://quorly.ca/mms-logo";      // branded banner on the text
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, init);
    if (r.ok || (r.status !== 429 && r.status < 500)) return r;
    last = r; await sleep(600 * (i + 1));
  }
  return last as Response;
}

const SUBJECT = (org: string) => `${org} — votre voix manque au vote · your voice is missing`;

// Table-based, inline-styled: flexbox and gradients do not survive Outlook.
function emailHtml(org: string, name: string, link: string, code: string) {
  const hi = name ? `${esc(name.split(" ")[0])}, ` : "";
  const dots = ["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"]
    .map((c) => `<td width="10" style="width:10px"><div style="width:9px;height:9px;border-radius:50%;background:${c};font-size:0;line-height:0">&nbsp;</div></td>`).join('<td width="5">&nbsp;</td>');
  const codeBox = code
    ? `<p style="margin:16px 0 4px;font-size:13px;color:#1C1B19">Ou entrez votre code membre · Or enter your member code:</p>
       <div style="font-family:ui-monospace,Menlo,monospace;font-size:23px;font-weight:900;letter-spacing:5px;background:#F7F4EE;border:1px solid #EAE4DA;border-radius:8px;padding:11px 14px;text-align:center">${
         [...code].map((c, i) => `<span style="color:${["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"][i % 4]}">${esc(c)}</span>`).join("")}</div>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:22px 12px">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <tr><td bgcolor="#2F3AA3" style="background:#2F3AA3;padding:18px 26px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#ffffff;font-size:19px;font-weight:900;letter-spacing:-.3px">Quorly</td>
      <td align="right"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${dots}</tr></table></td>
    </tr></table>
  </td></tr>
  <tr><td style="font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td bgcolor="#E0574A" height="4"></td><td bgcolor="#2F8F6B" height="4"></td><td bgcolor="#6B4FA3" height="4"></td><td bgcolor="#E0A83B" height="4"></td>
  </tr></table></td></tr>

  <tr><td style="padding:26px 30px 6px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">${esc(org)}</p>
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:#14131A">On gagne plus quand on est structuré.</h1>

    <p style="margin:0 0 12px;font-size:14.5px;line-height:1.62;color:#1C1B19">${hi}quand chacun roule de son côté, on subit. Quand on s'organise, on décide.</p>
    <p style="margin:0 0 12px;font-size:14.5px;line-height:1.62;color:#1C1B19">On gagne mieux sa vie — et on a la paix d'esprit — quand on travaille dans une structure. C'est exactement ce que nous bâtissons : <b>notre</b> structure, avec des règles que <b>nous votons ensemble</b>. Pas des règles imposées d'en haut. Les nôtres.</p>
    <p style="margin:0 0 10px;font-size:14.5px;line-height:1.62;color:#1C1B19">Il ne manque qu'une chose : <b>vous</b>.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      <tr><td width="4" bgcolor="#2F3AA3" style="background:#2F3AA3"></td><td style="padding:2px 0 2px 13px">
        <p style="margin:0 0 7px;font-size:14px;line-height:1.55;color:#1C1B19"><b>Votre voix est nécessaire.</b> Chaque règle se vote — une voix de moins, c'est une décision prise sans vous.</p>
        <p style="margin:0 0 7px;font-size:14px;line-height:1.55;color:#1C1B19"><b>Vos idées sont les bienvenues.</b> Vous pouvez proposer, commenter et amender, pas seulement approuver.</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#1C1B19"><b>Votre contribution ne sera jamais oubliée.</b> Chaque entrée est horodatée, numérotée et signée à votre nom.</p>
      </td></tr>
    </table>

    <p style="margin:0 0 20px"><a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2F3AA3;color:#ffffff;text-decoration:none;font-weight:800;font-size:14.5px;padding:13px 22px;border-radius:10px">Rejoindre mes collègues →</a></p>
    ${codeBox}
  </td></tr>

  <tr><td style="padding:6px 30px 0"><div style="border-top:1px solid #EAE4DA"></div></td></tr>
  <tr><td style="padding:16px 30px 26px">
    <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">In English</p>
    <p style="margin:0 0 11px;font-size:13.5px;line-height:1.6;color:#4a4750">We earn more — and we sleep better — when we work inside a structure. That is what we are building: <b>our own</b> structure, with rules <b>we vote on together</b>, not rules handed down to us.</p>
    <p style="margin:0 0 11px;font-size:13.5px;line-height:1.6;color:#4a4750">Only one thing is missing: <b>you</b>. Your voice is needed — every rule is voted on. Your ideas are welcome — you can propose and amend, not just approve. And your contribution will never be forgotten: every entry is timestamped, numbered and signed in your name.</p>
    <p style="margin:0 0 4px"><a href="${link}" target="_blank" rel="noopener noreferrer" style="color:#2F3AA3;font-weight:800;font-size:13.5px;text-decoration:none">Join your colleagues →</a></p>
  </td></tr>

  <tr><td bgcolor="#FBF8F2" style="background:#FBF8F2;padding:14px 30px">
    <p style="margin:0;color:#98A0AE;font-size:11px;line-height:1.6">Ou copiez ce lien · Or paste this link:<br>${esc(link)}</p>
    <p style="margin:8px 0 0;color:#98A0AE;font-size:11px;line-height:1.6">Quorly — ${esc(org)}. Vous recevez ceci parce que vous avez été invité(e) à rejoindre le groupe.<br>You are receiving this because you were invited to join this group.</p>
  </td></tr>
</table>
</td></tr></table>`;
}

function smsBody(org: string, link: string) {
  return `${org}\n\nOn gagne plus — et on a la paix d'esprit — quand on travaille dans une structure. Les règles, nous les votons ENSEMBLE. Votre voix est nécessaire, vos idées sont les bienvenues, et votre contribution ne sera jamais oubliée.\n\nRejoignez-nous : ${link}\n\nEN: We earn more when we're organised. We vote the rules together. Your voice is needed.`;
}

async function sendEmail(to: string, org: string, name: string, link: string, code: string) {
  if (!RESEND) return { ok: false, error: "resend_key_missing" };
  const r = await fetchRetry("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: SUBJECT(org), html: emailHtml(org, name, link, code) }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: `resend_${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
}

async function sendSms(phone: string, org: string, link: string) {
  if (!(TW_SID && TW_TOKEN && TW_FROM)) return { ok: false, error: "twilio_not_configured" };
  let to = String(phone).replace(/[^\d+]/g, "");
  if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
  const p = new URLSearchParams({ To: to, Body: smsBody(org, link) });
  TW_FROM.startsWith("MG") ? p.set("MessagingServiceSid", TW_FROM) : p.set("From", TW_FROM);
  if (MMS_MEDIA) p.set("MediaUrl", MMS_MEDIA);        // MMS with the banner; degrades to SMS
  const r = await fetchRetry(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: `twilio_${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({} as any));
    const secretOk = req.headers.get("x-kolis-secret") === CF_SECRET;

    const formId = body.form_id as string | undefined;
    if (!formId) return json({ error: "no_form" }, 400);

    const { data: form } = await admin.from("cf_forms").select("name, admin_id").eq("id", formId).maybeSingle();
    if (!form) return json({ error: "form_not_found" }, 404);

    if (!secretOk) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      if (form.admin_id !== u.user.id) return json({ error: "not_admin" }, 403);
    }

    const org = form.name ?? "Quorly";
    const base = String(body.base_url || "https://quorly.ca").replace(/\/$/, "");
    const channel = body.channel as "email" | "sms" | undefined;

    // A test send borrows a REAL pending invite's link so the reviewer sees exactly
    // what a member sees — but delivers only to the given address/number.
    if (body.test_to_email || body.test_to_phone) {
      const { data: sample } = await admin.from("cf_members")
        .select("name, invite_token, invite_code").eq("form_id", formId).eq("status", "invited")
        .not("invite_token", "is", null).limit(1).maybeSingle();
      const link = sample?.invite_token ? `${base}/join?token=${encodeURIComponent(sample.invite_token)}` : `${base}/join`;
      const out: any = { test: true, org, link_shown: link };
      if (body.test_to_email) out.email = await sendEmail(String(body.test_to_email), org, String(body.test_name || ""), link, String(sample?.invite_code || ""));
      if (body.test_to_phone) out.sms = await sendSms(String(body.test_to_phone), org, link);
      return json({ ok: true, ...out });
    }

    const { data: rows } = await admin.from("cf_members")
      .select("name, email, phone, invite_token, invite_code")
      .eq("form_id", formId).eq("status", "invited").not("invite_token", "is", null);
    const pending = rows ?? [];

    if (body.dry_run) {
      return json({
        ok: true, dry_run: true, org, recipients: pending.length,
        would_email: pending.filter((m: any) => isEmail(String(m.email || "").trim())).length,
        would_text: pending.filter((m: any) => String(m.phone || "").replace(/[^\d+]/g, "").length >= 10).length,
        no_contact: pending.filter((m: any) => !isEmail(String(m.email || "").trim()) && !String(m.phone || "").trim()).length,
      });
    }

    const results: any[] = [];
    const seenEmail = new Set<string>(), seenPhone = new Set<string>();
    for (const m of pending) {
      const link = `${base}/join?token=${encodeURIComponent(m.invite_token as string)}`;
      const code = String(m.invite_code || "");
      const e = String(m.email || "").trim().toLowerCase();
      const ph = String(m.phone || "").replace(/[^\d+]/g, "");
      const row: any = { name: m.name || null, email: e || null, phone: ph || null };

      if (channel !== "sms" && isEmail(e) && !seenEmail.has(e)) {
        seenEmail.add(e);
        const r = await sendEmail(e, org, String(m.name || ""), link, code);
        row.email_ok = r.ok; if (!r.ok) row.email_error = r.error;
      }
      if (channel !== "email" && ph.length >= 10 && !seenPhone.has(ph)) {
        seenPhone.add(ph);
        const r = await sendSms(ph, org, link);
        row.sms_ok = r.ok; if (!r.ok) row.sms_error = r.error;
      }
      results.push(row);
      await sleep(140);                                 // stay under provider rate limits
    }

    return json({
      ok: true, org, recipients: pending.length,
      emailed: results.filter((r) => r.email_ok).length,
      texted: results.filter((r) => r.sms_ok).length,
      failures: results.filter((r) => r.email_error || r.sms_error),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
