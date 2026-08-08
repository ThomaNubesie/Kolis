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
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const RESEND = Deno.env.get("RESEND_API_KEY")!;
const KEY = Deno.env.get("OUTREACH_KEY")!;
const INBOUND_TOKEN = Deno.env.get("CONCORD_INBOUND_TOKEN") || "";  // restricted: only the 'inbound' (auto-stop) action
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
    2: ["Un petit rappel : Kolis · Business — propulsé par l'IA — livre le jour même sur notre réseau en expansion (Ottawa, Montréal, Québec, Toronto, Halifax et plus), sans flotte à gérer.",
        "A quick reminder: Kolis · Business — AI-powered — delivers same-day across our growing network (Ottawa, Montréal, Québec City, Toronto, Halifax and more), with no fleet to manage."],
    3: ["Je reste disponible si Kolis · Business peut vous être utile — un court appel, même 15 minutes, suffit.",
        "I'm still here whenever Kolis · Business could help — a quick call, even 15 minutes, is all it takes."],
  };
  // touch 1 & 2 use their specific notes; every touch after that reuses the gentle recurring note (no "last message" wording).
  const [fr, en] = intro[touch] || intro[3];
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

async function send(p: { from?: string; to: string; cc?: string | string[]; reply_to?: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const payload: Record<string, unknown> = { from: p.from || FROM, to: [p.to], subject: p.subject, html: p.html };
  const cc = p.cc ?? CC;
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  payload.reply_to = p.reply_to || REPLY;
  // Optional PDF/file attachments (Resend expects base64 content per file).
  if (Array.isArray(p.attachments) && p.attachments.length) payload.attachments = p.attachments;
  // One-click unsubscribe — strong inbox-placement signal for Gmail/Outlook.
  payload.headers = {
    "List-Unsubscribe": "<mailto:marketing@concordexpress.ca?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return await resend("/emails", { method: "POST", body: JSON.stringify(payload) });
}

// Fetch a prospect's personalized letter (public storage URL) as a base64 Resend attachment.
async function letterAttachment(letter_url?: string | null, dateY?: number | null): Promise<{ filename: string; content: string }[]> {
  if (!letter_url) return [];
  try {
    const r = await fetch(letter_url);
    if (!r.ok) return [];
    let out = new Uint8Array(await r.arrayBuffer());
    // Stamp today's date (America/Toronto) at the letter's stored signature-block position (last page).
    try {
      const pdf = await PDFDocument.load(out);
      const pages = pdf.getPages();
      const pg = pages[pages.length - 1];
      const { height } = pg.getSize();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const dateFr = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Toronto" }).format(new Date());
      const txt = "Date : " + dateFr, size = 9;
      const w = font.widthOfTextAtSize(txt, size);
      const yTop = (typeof dateY === "number" && dateY > 0) ? dateY : 149;
      pg.drawText(txt, { x: 577 - w, y: height - yTop, size, font, color: rgb(0.35, 0.35, 0.4) });
      out = await pdf.save();
    } catch (_e) { /* if stamping fails, attach the letter as-is */ }
    let bin = ""; const chunk = 0x8000;
    for (let i = 0; i < out.length; i += chunk) bin += String.fromCharCode(...out.subarray(i, i + chunk));
    let name = decodeURIComponent((letter_url.split("/").pop() || "Kolis.pdf").split("?")[0]);
    if (!name.toLowerCase().endsWith(".pdf")) name = "Kolis-Concord-Express.pdf";
    return [{ filename: name, content: btoa(bin) }];
  } catch { return []; }
}

function subjectFor(cat: string | null): string {
  if (cat === "medical-lab") return "Kolis · Business — transport de spécimens le jour même / same-day specimen transport";
  if (cat === "environmental-lab") return "Kolis · Business — ramassage d'échantillons le jour même / same-day sample pickup";
  return "Kolis · Business — suivi / follow-up";
}

// Category-specific follow-up (sent ~2 business days after a prospect is marked
// "Met"). Two tracked buttons (See / Book) so the profile shows which option
// the prospect clicked.
function categoryFollowupHtml(name: string, cat: string | null): string {
  const body: Record<string, [string, string]> = {
    "medical-lab": [
      "Suite à notre proposition : Kolis peut transporter vos spécimens entre vos centres de prélèvement et votre laboratoire central — le jour même, plusieurs fois par jour, en appoint STAT / après-heures de votre service actuel. Suivi en temps réel, chaîne de possession et manipulation soignée, sensible à la température.",
      "Following our proposal: Kolis can move your specimens from collection sites to your central lab — same-day, several times daily, as STAT / after-hours overflow to your current service. Real-time tracking, chain-of-custody, and careful temperature-aware handling.",
    ],
    "environmental-lab": [
      "Suite à notre proposition : Kolis garantit le ramassage le jour même de vos échantillons (sol, eau, air, amiante) vers votre laboratoire — idéal pour les délais serrés des permis d'occupation et des certifications. Suivi en temps réel, du terrain au labo.",
      "Following our proposal: Kolis guarantees same-day pickup of your samples (soil, water, air, asbestos) to your lab — ideal for the tight deadlines of occupancy permits and clearances. Real-time tracking from field to lab.",
    ],
    "auto-parts": [
      "Un petit rappel : Kolis livre vos pièces le jour même sur le corridor Ottawa–Gatineau, sans flotte à gérer.",
      "A quick reminder: Kolis delivers your parts same-day across the Ottawa–Gatineau corridor, with no fleet to manage.",
    ],
  };
  const [fr, en] = body[cat ?? ""] || body["auto-parts"];
  return `<!doctype html><html><body style="margin:0;background:#F1F0F4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1722">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#E11D6B;padding:18px 26px;font-size:19px;font-weight:800;color:#fff">Ko&nbsp; Kolis · Business</td></tr>
  <tr><td style="padding:28px 30px 6px"><p style="margin:0 0 10px;font-size:15px"><b>Bonjour ${name},</b></p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3a3744">${fr}</p>
    <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:#6B6675;font-style:italic">${en}</p></td></tr>
  <tr><td align="center" style="padding:0 30px 6px"><img src="${GIF}" width="540" alt="Kolis · Business" style="width:100%;max-width:540px;border-radius:12px;border:1px solid #ECECF2"></td></tr>
  <tr><td align="center" style="padding:18px 30px 6px">
    <a href="https://business.kolis.ca/?ref=email" style="display:inline-block;background:#E11D6B;color:#fff;font-weight:700;font-size:15px;padding:13px 24px;border-radius:11px;text-decoration:none;margin:0 4px 8px">Voir Kolis · Business</a>
    <a href="https://business.kolis.ca/?book=1" style="display:inline-block;background:#fff;color:#E11D6B;border:1.5px solid #E11D6B;font-weight:700;font-size:15px;padding:11px 24px;border-radius:11px;text-decoration:none;margin:0 4px 8px">Réserver 20 min / Book a call</a>
    <div style="margin-top:8px;font-size:13px;color:#6B6675">(613) 862-2639 · marketing@concordexpress.ca</div></td></tr>
  <tr><td style="padding:16px 30px 0"><hr style="border:none;border-top:1px solid #ECECF2;margin:0 0 12px">
    <p style="margin:0;font-size:13px;color:#3a3744"><b>Thomas Derick Shalo</b> · Concord Express Co Inc.<br>(613) 862-2639 · marketing@concordexpress.ca</p></td></tr>
  <tr><td style="padding:18px 30px 24px"><p style="margin:0;font-size:11px;color:#9b97a6;line-height:1.6">Kolis · Business est exploité par Concord Express Co Inc. · Pour ne plus recevoir ces messages, répondez « STOP ». / Reply “STOP” to opt out.</p></td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const tok = url.searchParams.get("key") || req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const isMaster = tok === KEY;
  const isInboundOnly = !!INBOUND_TOKEN && tok === INBOUND_TOKEN;
  if (!isMaster && !isInboundOnly) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE);

  if (req.method === "GET" && url.searchParams.get("action") === "domains") {
    const { status, body } = await resend("/domains"); return json(body, status);
  }

  const b = await req.json().catch(() => ({}));
  // The restricted inbound token may ONLY run the auto-stop-on-reply action — nothing else.
  if (isInboundOnly && b.action !== "inbound") return json({ error: "forbidden" }, 403);

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
    // Attach the prospect's personalized letter (unless caller supplied attachments).
    let attachments = b.attachments;
    if (!attachments) {
      const { data: pr } = await admin.from("concord_outreach").select("letter_url,letter_date_y").eq("email", b.to).maybeSingle();
      attachments = await letterAttachment(pr?.letter_url, pr?.letter_date_y);
    }
    const r = await send({ ...b, attachments });
    if (r.status < 300 && b.name) await admin.rpc("concord_outreach_add", { p_name: b.name, p_email: b.to });
    return json(r.body, r.status);
  }

  if (b.action === "stop") {
    await admin.from("concord_outreach").update({ status: "stopped", next_due_at: null }).eq("id", b.id);
    return json({ ok: true, stopped: b.id });
  }
  if (b.action === "resume") {
    await admin.from("concord_outreach").update({ status: "active", next_due_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq("id", b.id);
    return json({ ok: true, resumed: b.id });
  }

  // Preview: send yourself (b.to) a prospect's email + its attached letter, no cc, nothing recorded.
  if (b.action === "preview") {
    const { data: pr } = await admin.from("concord_outreach").select("*").eq("id", b.id).maybeSingle();
    if (!pr) return json({ error: "prospect_not_found" }, 404);
    const att = await letterAttachment(pr.letter_url, pr.letter_date_y);
    const r = await send({ to: b.to, cc: null, subject: "[Aperçu] " + subjectFor(pr.category), html: followupHtml(pr.business_name, 1), attachments: att });
    return json({ ok: r.status < 300, to: b.to, prospect: pr.business_name, attached: att.length, resp: r.body }, r.status);
  }

  // Inbound reply → auto-stop that prospect + forward the reply to marketing@ so Thomas sees it.
  // Called by the inbound-email webhook: POST ?key=<OUTREACH_KEY> {from, subject, text|html}.
  if (b.action === "inbound") {
    const from = String(b.from || b.sender || b.email || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+/)?.[0];
    if (!from) return json({ error: "no_sender" }, 400);
    const { data: pr } = await admin.from("concord_outreach").select("id,business_name,status").ilike("email", from).maybeSingle();
    if (pr && pr.status === "active") {
      await admin.from("concord_outreach").update({ status: "replied", next_due_at: null, contacted_at: new Date().toISOString() }).eq("id", pr.id);
      await admin.from("concord_outreach_events").insert({ email: from, type: "replied" });
    }
    // No forward needed — the reply is already in the marketing@ Gmail inbox.
    return json({ ok: true, matched: pr?.business_name || null, stopped: !!(pr && pr.status === "active") });
  }

  if (b.action === "followup") {
    // Auto-stop (visibility): a click/booking → 'engaged'; a bounce → 'bounced'. These drop out of the cadence.
    await admin.from("concord_outreach").update({ status: "engaged", next_due_at: null }).eq("status", "active").not("clicked_at", "is", null);
    await admin.from("concord_outreach").update({ status: "bounced", next_due_at: null }).eq("status", "active").not("bounced_at", "is", null);
    // Ongoing follow-up: nudge every 7 days FOREVER until you Stop (status<>'active'), they engage, or you mark 'Met'.
    const { data: due } = await admin.from("concord_outreach").select("*")
      .eq("status", "active").neq("stage", "met").is("clicked_at", null).is("bounced_at", null)
      .lte("next_due_at", new Date().toISOString());
    const out: any[] = [];
    for (const rec of due ?? []) {
      const touch = rec.touch_count + 1;
      const att = await letterAttachment(rec.letter_url, rec.letter_date_y);
      const r = await send({ to: rec.email, subject: "Kolis · Business — suivi / follow-up", html: followupHtml(rec.business_name, touch), attachments: att });
      if (r.status < 300) {
        await admin.from("concord_outreach").update({
          touch_count: touch, last_sent_at: new Date().toISOString(),
          next_due_at: new Date(Date.now() + 7 * 86400000).toISOString(), status: "active",
        }).eq("id", rec.id);
        out.push({ email: rec.email, touch, id: (r.body as any)?.id });
      } else out.push({ email: rec.email, error: r.body });
    }
    // Prospect CRM: single follow-up ~2 business days after a prospect is marked "Met".
    const { data: metDue } = await admin.from("concord_outreach").select("*")
      .eq("stage", "met").not("email", "is", null).is("followup_sent_at", null)
      .lte("followup_due_at", new Date().toISOString());
    for (const rec of metDue ?? []) {
      const att = await letterAttachment(rec.letter_url, rec.letter_date_y);
      const r = await send({ to: rec.email, subject: subjectFor(rec.category), html: categoryFollowupHtml(rec.business_name, rec.category), attachments: att });
      if (r.status < 300) {
        await admin.from("concord_outreach").update({ followup_sent_at: new Date().toISOString() }).eq("id", rec.id);
        out.push({ email: rec.email, met_followup: true, id: (r.body as any)?.id });
      } else out.push({ email: rec.email, error: r.body });
    }
    return json({ sent: out.length, results: out });
  }

  return json({ error: "unknown_action" }, 400);
});
