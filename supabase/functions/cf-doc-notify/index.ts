// cf-doc-notify — a document was added, so tell the people it concerns.
//
//   POST {action:"notify",    file_id}   → email + MMS to the file's audience
//   POST {action:"followups"}            → cron drain: one chase for unacknowledged urgent docs
//
// WHO IS TOLD is not the same question as WHO MAY READ. cf_file_recipients() answers the
// first (audience rows with notify=true, or the whole space when no audience is set); the
// cf_files SELECT policy answers the second. This function only ever handles the first —
// it must never assume a recipient can open what it is telling them about, because a
// poster may legitimately notify someone who cannot.
//
// URGENT documents get a single follow-up six hours later to anyone who has not pressed
// acknowledge. Acknowledgement is an explicit act (cf_file_ack), not a view: the record
// should say a person confirmed receipt, not that a thumbnail loaded in a preview pane.
//
// Deploy with --no-verify-jwt: pg_cron calls the follow-up drain with the shared secret,
// and a JWT check would 401 it into silence — the failure mode that hid the outreach
// campaign sending nothing for five days.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { quorlyEmail, QUORLY_FROM, QUORLY_SITE, QUORLY_MMS_BANNER, esc } from "../_shared/quorly-email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || Deno.env.get("QUORLY_RESEND_API_KEY") || "";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"),
      TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"),
      TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const FOLLOWUP_HOURS = 6;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Recipient = { member_id: string; name: string | null; email: string | null; phone: string | null; lang: string };

async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.ok || (r.status < 500 && r.status !== 429)) return r;
      last = r;
    } catch { /* network flap — retry */ }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  return last ?? new Response("unreachable", { status: 599 });
}

const docLink = (fileId: string) => `${QUORLY_SITE}/organizations?doc=${fileId}`;

function emailHtml(o: {
  org: string; title: string; poster: string; urgent: boolean; link: string; followup: boolean;
}) {
  const urg = o.urgent
    ? `<span style="background:#FBE9E7;color:#C0392B;font-weight:800;font-size:11px;padding:2px 8px;border-radius:10px">URGENT</span> `
    : "";
  return quorlyEmail({
    eyebrow: o.org,
    headline: o.followup
      ? `${urg}Rappel — document en attente de votre accusé de réception`
      : `${urg}Un document vous a été adressé`,
    bodyFr: o.followup
      ? `<p style="margin:0 0 11px">Ce document a été déposé il y a ${FOLLOWUP_HOURS} heures et attend toujours votre accusé de réception. Un seul rappel est envoyé — celui-ci.</p>`
      : `<p style="margin:0 0 11px"><b>${esc(o.poster)}</b> a déposé un document dans <b>${esc(o.org)}</b>.${
          o.urgent ? ` Il est marqué <b>urgent</b> : merci d'en accuser réception.` : ""
        }</p>`,
    highlight: { title: esc(o.title), sub: o.urgent ? "Marqué urgent · Marked urgent" : undefined },
    cta: { label: o.urgent ? "Ouvrir et accuser réception" : "Ouvrir le document", href: o.link },
    footnoteFr: o.urgent
      ? "Le bouton ouvre le document et enregistre votre accusé de réception."
      : "Le bouton ouvre le document dans Quorly.",
    english: o.followup
      ? `<p style="margin:0">Reminder: this document has been waiting ${FOLLOWUP_HOURS} hours for your acknowledgement. This is the only reminder.</p>`
      : `<p style="margin:0"><b>${esc(o.poster)}</b> posted a document in <b>${esc(o.org)}</b>.${
          o.urgent ? " It is marked <b>urgent</b> — please acknowledge receipt." : ""
        }</p>`,
    footer: `${esc(o.link)}<br>Vous recevez ceci parce que ce document vous a été adressé. / You are receiving this because this document was addressed to you.`,
  });
}

function smsBody(o: { org: string; title: string; urgent: boolean; link: string; followup: boolean }) {
  const head = o.followup
    ? `RAPPEL / REMINDER — ${o.org}`
    : (o.urgent ? `URGENT — ${o.org}` : o.org);
  const line = o.followup
    ? `En attente de votre accusé de réception depuis ${FOLLOWUP_HOURS} h.\nStill awaiting your acknowledgement.`
    : (o.urgent
        ? `Document urgent. Merci d'en accuser réception.\nUrgent document — please acknowledge.`
        : `Nouveau document.\nNew document.`);
  return `${head}\n\n${o.title}\n\n${line}\n\n${o.link}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND) return { ok: false, error: "resend_key_missing" };
  const r = await fetchRetry("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: QUORLY_FROM, to: [to], subject, html }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: `resend_${r.status}: ${(await r.text().catch(() => "")).slice(0, 180)}` };
}

async function sendSms(phone: string, body: string) {
  if (!(TW_SID && TW_TOKEN && TW_FROM)) return { ok: false, error: "twilio_not_configured" };
  let to = String(phone).replace(/[^\d+]/g, "");
  if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
  const p = new URLSearchParams({ To: to, Body: body });
  TW_FROM.startsWith("MG") ? p.set("MessagingServiceSid", TW_FROM) : p.set("From", TW_FROM);
  if (QUORLY_MMS_BANNER) p.set("MediaUrl", QUORLY_MMS_BANNER);   // MMS; degrades to SMS
  const r = await fetchRetry(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: p.toString(),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: `twilio_${r.status}: ${(await r.text().catch(() => "")).slice(0, 180)}` };
}

// One recipient, both channels. Returns what actually succeeded — never a bare "sent",
// so a half-delivery is visible in cf_file_notices instead of being averaged away.
async function deliver(
  admin: any, fileId: string, r: Recipient,
  ctx: { org: string; title: string; poster: string; urgent: boolean; formId: string },
  followup: boolean,
) {
  const link = docLink(fileId);
  const subject = (ctx.urgent ? "[Urgent] " : "") +
    (followup ? `Rappel · Reminder — ${ctx.title}` : `${ctx.title} — ${ctx.org}`);

  const [em, sm] = await Promise.all([
    r.email ? sendEmail(r.email, subject, emailHtml({ ...ctx, link, followup })) : Promise.resolve({ ok: false, error: "no_email" }),
    r.phone ? sendSms(r.phone, smsBody({ ...ctx, link, followup })) : Promise.resolve({ ok: false, error: "no_phone" }),
  ]);

  const now = new Date().toISOString();
  const errs = [em.ok ? null : `email:${(em as any).error}`, sm.ok ? null : `sms:${(sm as any).error}`]
    .filter(Boolean).join(" | ") || null;

  if (followup) {
    await admin.from("cf_file_notices").update({ followup_at: now, last_error: errs })
      .eq("file_id", fileId).eq("member_id", r.member_id);
  } else {
    await admin.from("cf_file_notices").upsert({
      file_id: fileId,
      member_id: r.member_id,
      urgent: ctx.urgent,
      email_at: em.ok ? now : null,
      sms_at: sm.ok ? now : null,
      // Only urgent documents are ever chased.
      followup_due_at: ctx.urgent ? new Date(Date.now() + FOLLOWUP_HOURS * 3600_000).toISOString() : null,
      last_error: errs,
    }, { onConflict: "file_id,member_id" });
  }

  if (sm.ok) await admin.rpc("cf_usage_add", { p_form: ctx.formId, p_n: 1 });
  return { email: em.ok, sms: sm.ok };
}

async function contextFor(admin: any, fileId: string) {
  const { data: f } = await admin.from("cf_files")
    .select("id, name, form_id, uploader, priority, deleted_at").eq("id", fileId).maybeSingle();
  if (!f || f.deleted_at) return null;
  const { data: form } = await admin.from("cf_forms").select("name").eq("id", f.form_id).maybeSingle();
  const { data: up } = await admin.from("cf_members")
    .select("name").eq("form_id", f.form_id).eq("user_id", f.uploader).maybeSingle();
  return {
    formId: f.form_id as string,
    org: (form?.name as string) || "Quorly",
    title: (f.name as string) || "Document",
    poster: (up?.name as string) || "Un membre",
    urgent: f.priority === "urgent",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({} as any));
    const action = String(b.action || "notify");

    // ---- cron drain: one chase, six hours on, urgent only --------------------
    if (action === "followups") {
      if (req.headers.get("x-kolis-secret") !== CF_SECRET) return json({ error: "unauthorized" }, 401);
      const { data: due } = await admin.from("cf_file_notices")
        .select("file_id, member_id")
        .is("acknowledged_at", null).is("followup_at", null)
        .eq("urgent", true).lte("followup_due_at", new Date().toISOString())
        .limit(200);
      if (!due?.length) return json({ ok: true, followups: 0 });

      // Group by file so each document's context is looked up once, not per member.
      const byFile = new Map<string, string[]>();
      for (const d of due) byFile.set(d.file_id, [...(byFile.get(d.file_id) ?? []), d.member_id]);

      let sent = 0, failed = 0;
      for (const [fileId, memberIds] of byFile) {
        const ctx = await contextFor(admin, fileId);
        if (!ctx) continue;                       // deleted since — nothing to chase
        const { data: recips } = await admin.rpc("cf_file_recipients", { p_file: fileId });
        for (const r of (recips ?? []) as Recipient[]) {
          if (!memberIds.includes(r.member_id)) continue;
          const out = await deliver(admin, fileId, r, ctx, true);
          out.email || out.sms ? sent++ : failed++;
        }
      }
      return json({ ok: true, followups: sent, failed });
    }

    // ---- a document was added ------------------------------------------------
    const fileId = String(b.file_id || "");
    if (!fileId) return json({ error: "file_id_required" }, 400);

    // Either the shared secret (server-to-server) or an active member of the space.
    if (req.headers.get("x-kolis-secret") !== CF_SECRET) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "unauthorized" }, 401);
      const { data: f } = await admin.from("cf_files").select("form_id").eq("id", fileId).maybeSingle();
      if (!f) return json({ error: "file_not_found" }, 404);
      const { data: m } = await admin.from("cf_members").select("id")
        .eq("form_id", f.form_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
      if (!m) return json({ error: "not_a_member" }, 403);
    }

    const ctx = await contextFor(admin, fileId);
    if (!ctx) return json({ error: "file_not_found" }, 404);

    const { data: recips, error: rerr } = await admin.rpc("cf_file_recipients", { p_file: fileId });
    if (rerr) return json({ error: rerr.message }, 500);

    let email = 0, sms = 0, none = 0;
    for (const r of (recips ?? []) as Recipient[]) {
      const out = await deliver(admin, fileId, r, ctx, false);
      out.email ? email++ : 0; out.sms ? sms++ : 0;
      if (!out.email && !out.sms) none++;
    }

    await admin.from("cf_file_activity").insert({
      form_id: ctx.formId, file_id: fileId, actor: null, action: "notified",
      meta: { recipients: recips?.length ?? 0, email, sms, failed: none, urgent: ctx.urgent },
    });

    // Counts are what was actually accepted by Resend and Twilio, not what was attempted.
    return json({ ok: true, recipients: recips?.length ?? 0, email, sms, failed: none, urgent: ctx.urgent });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
