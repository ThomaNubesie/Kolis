// Concord Express outreach mailer + 3-touch follow-up runner (Kolis · Business).
// Uses the existing RESEND_API_KEY. Admin-only: bearer == OUTREACH_KEY secret.
// Actions (deploy with --no-verify-jwt; auth enforced here):
//   GET  ?action=domains                       → list Resend domains + status
//   POST {action:"add_domain", name}           → register a sending domain (DNS records)
//   POST {action:"update_tracking", id}        → enable open + click tracking on a domain
//   POST {action:"create_webhook", endpoint}   → register the Resend webhook, returns signing secret
//   POST {action:"send", from,to,cc,reply_to,subject,html, name?}  → send (and, with name, seed the campaign)
//   POST {action:"followup"}                    → send any due +4/+10/+18 follow-ups (cron target)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND = Deno.env.get("RESEND_API_KEY")!;
const KEY = Deno.env.get("OUTREACH_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GIF = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/kolis-features.gif";
const FROM = "Concord Express Co Inc. <marketing@concordexpress.ca>";
const CC = "shaloderick@concordexpress.ca";
const REPLY = "marketing@concordexpress.ca";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function resend(path: string, init?: RequestInit) {
  const r = await fetch("https://api.resend.com" + path, {
    ...init, headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Compact bilingual follow-up email. touch = 1 | 2 | 3.
function followupHtml(name: string, touch: number) {
  const intro: Record<number, [string, string]> = {
    1: ["Je voulais simplement m'assurer que ma proposition de partenariat vous est bien parvenue.",
        "I just wanted to make sure my partnership proposal reached you."],
    2: ["Un petit rappel : Kolis · Business peut déjà livrer vos commandes le jour même sur le corridor Ottawa–Gatineau, sans flotte à gérer.",
        "A quick reminder: Kolis · Business can already deliver your orders same-day across the Ottawa–Gatineau corridor, with no fleet to manage."],
    3: ["Dernier message de ma part — la porte reste grande ouverte si vous souhaitez en discuter, même 15 minutes.",
        "Last note from me — the door stays wide open if you'd like to chat, even 15 minutes."],
  };
  const [fr, en] = intro[touch] || intro[1];
  return `<!doctype html><html><body style="margin:0;background:#F1F0F4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1722">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#E11D6B;padding:18px 26px;font-size:19px;font-weight:800;color:#fff">Ko&nbsp; Kolis · Business</td></tr>
  <tr><td style="padding:28px 30px 6px"><p style="margin:0 0 10px;font-size:15px"><b>Bonjour ${name},</b></p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3a3744">${fr}</p>
    <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:#6B6675;font-style:italic">${en}</p></td></tr>
  <tr><td align="center" style="padding:0 30px 6px"><img src="${GIF}" width="540" alt="Kolis · Business" style="width:100%;max-width:540px;border-radius:12px;border:1px solid #ECECF2"></td></tr>
  <tr><td align="center" style="padding:18px 30px 6px">
    <a href="https://business.kolis.ca" style="display:inline-block;background:#E11D6B;color:#fff;font-weight:700;font-size:15px;padding:13px 28px;border-radius:11px;text-decoration:none">Voir Kolis · Business →</a>
    <div style="margin-top:11px;font-size:13px;color:#6B6675">20 min au téléphone : <b>(613) 862-2639</b></div></td></tr>
  <tr><td style="padding:16px 30px 0"><hr style="border:none;border-top:1px solid #ECECF2;margin:0 0 12px">
    <p style="margin:0;font-size:13px;color:#3a3744"><b>Thomas Derick Shalo</b> · Concord Express Co Inc.<br>(613) 862-2639 · marketing@concordexpress.ca</p></td></tr>
  <tr><td style="padding:18px 30px 24px"><p style="margin:0;font-size:11px;color:#9b97a6;line-height:1.6">Kolis · Business est exploité par Concord Express Co Inc. · Pour ne plus recevoir ces messages, répondez « STOP ». / Reply “STOP” to opt out.</p></td></tr>
  </table></td></tr></table></body></html>`;
}

async function send(p: { from?: string; to: string; cc?: string; reply_to?: string; subject: string; html: string }) {
  const payload: Record<string, unknown> = { from: p.from || FROM, to: [p.to], subject: p.subject, html: p.html };
  if (p.cc ?? CC) payload.cc = [p.cc ?? CC];
  payload.reply_to = p.reply_to || REPLY;
  return await resend("/emails", { method: "POST", body: JSON.stringify(payload) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if ((req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim()) !== KEY) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE);
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("action") === "domains") {
    const { status, body } = await resend("/domains"); return json(body, status);
  }

  const b = await req.json().catch(() => ({}));

  if (b.action === "add_domain") {
    const { status, body } = await resend("/domains", { method: "POST", body: JSON.stringify({ name: b.name }) });
    return json(body, status);
  }

  if (b.action === "update_tracking") {
    const { status, body } = await resend(`/domains/${b.id}`, { method: "PATCH", body: JSON.stringify({ open_tracking: true, click_tracking: true }) });
    return json(body, status);
  }

  if (b.action === "create_webhook") {
    const { status, body } = await resend("/webhooks", { method: "POST", body: JSON.stringify({
      endpoint: b.endpoint,
      events: ["email.delivered", "email.opened", "email.clicked", "email.bounced", "email.complained"],
    }) });
    return json(body, status); // includes the signing secret to store as RESEND_WEBHOOK_SECRET
  }

  if (b.action === "send") {
    const r = await send(b);
    if (r.status < 300 && b.name) await admin.rpc("concord_outreach_add", { p_name: b.name, p_email: b.to });
    return json(r.body, r.status);
  }

  if (b.action === "followup") {
    const { data: due } = await admin.from("concord_outreach").select("*")
      .eq("status", "active").lt("touch_count", 3).lte("next_due_at", new Date().toISOString());
    const out: any[] = [];
    for (const rec of due ?? []) {
      const touch = rec.touch_count + 1;
      const r = await send({ to: rec.email, subject: "Kolis · Business — suivi / follow-up", html: followupHtml(rec.business_name, touch) });
      if (r.status < 300) {
        const initial = rec.initial_sent_at;
        const nextDue = touch >= 3 ? null : new Date(new Date(initial).getTime() + (touch === 1 ? 10 : 18) * 86400000).toISOString();
        await admin.from("concord_outreach").update({
          touch_count: touch, last_sent_at: new Date().toISOString(),
          next_due_at: nextDue, status: touch >= 3 ? "done" : "active",
        }).eq("id", rec.id);
        out.push({ email: rec.email, touch, id: (r.body as any)?.id });
      } else out.push({ email: rec.email, error: r.body });
    }
    return json({ sent: out.length, results: out });
  }

  return json({ error: "unknown_action" }, 400);
});
