// Quorly outreach mailer + recurring follow-up runner. Mirror of Kolis concord-outreach,
// pointed at organizations (boards, associations, non-profits, condo councils).
// Auth: master QUORLY_OUTREACH_KEY, or restricted QUORLY_INBOUND_TOKEN (inbound action only).
// Actions (deploy --no-verify-jwt; auth enforced here):
//   GET  ?action=domains                         → list Resend domains + status
//   POST {action:"add_domain", name}             → register a sending domain
//   POST {action:"domain_records", id|name}      → return a domain's DNS records (to paste at the registrar)
//   POST {action:"update_tracking", id}          → enable open + click tracking on a domain
//   POST {action:"create_webhook", endpoint}     → register the Resend webhook (returns signing secret)
//   POST {action:"send", to, subject?, name?}    → send an intro now (and seed the campaign)
//   POST {action:"followup"}                      → send due intros/follow-ups (pg_cron target)
//   POST {action:"suggest", items:[{org_name,email,category,region,fit,contact_name}]} → bulk-add finder suggestions (status 'new')
//   POST {action:"inbound", from}                 → auto-stop a prospect who replied
//   POST {action:"stop"|"resume"|"preview", id}   → cadence controls / self-preview
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND = Deno.env.get("RESEND_API_KEY")!;
const KEY = Deno.env.get("QUORLY_OUTREACH_KEY")!;
const INBOUND_TOKEN = Deno.env.get("QUORLY_INBOUND_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <hello@quorly.ca>";
const REPLY = Deno.env.get("QUORLY_REPLY_EMAIL") || "shaloderick@gmail.com";
const SITE = "https://quorly.ca";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function resend(path: string, init?: RequestInit) {
  const r = await fetch("https://api.resend.com" + path, {
    ...init, headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Quorly-branded bilingual email. touch 1 = intro; 2/3+ = gentle recurring nudges.
function emailHtml(name: string, touch: number) {
  const intro: Record<number, [string, string]> = {
    1: [`Je vous écris parce que Quorly aide les organisations comme ${name} à gérer le travail du conseil et des comités dans un seul espace partagé : formulaires remplis ensemble, votes et élections des membres, salle de documents sécurisée et suivi des reçus — sans tableurs ni fils de courriels perdus.`,
        `I'm reaching out because Quorly helps organizations like ${name} run their board & committee work in one shared space — forms filled in together, member voting & elections, a secure document room, and receipt tracking — no spreadsheets, no lost email threads.`],
    2: [`Petit rappel : Quorly réunit vos formulaires partagés, vos élections/votes, vos documents et vos reçus au même endroit — chaque membre voit la même chose, en couleur.`,
        `A quick reminder: Quorly brings your shared forms, elections/votes, documents and receipts into one place — every member sees the same thing, colour-coded.`],
    3: [`Je reste disponible si Quorly peut aider votre organisation — un court appel de 15 minutes suffit pour vous montrer comment votre conseil l'utiliserait.`,
        `I'm still here whenever Quorly could help your organization — a quick 15-minute call is all it takes to show how your board would use it.`],
  };
  const [fr, en] = intro[touch] || intro[3];
  return `<!doctype html><html><body style="margin:0;background:#F1EEE7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#14131A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE9E2">
  <tr><td style="background:#2F3AA3;padding:18px 26px;font-size:19px;font-weight:800;color:#fff">◑ Quorly</td></tr>
  <tr><td style="padding:28px 30px 6px"><p style="margin:0 0 10px;font-size:15px"><b>Bonjour ${name},</b></p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3a3744">${fr}</p>
    <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:#6B6675;font-style:italic">${en}</p></td></tr>
  <tr><td style="padding:0 30px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:6px 0;font-size:13.5px;color:#3a3744">✔ Formulaires partagés & colorés / Shared colour-coded forms</td></tr>
      <tr><td style="padding:6px 0;font-size:13.5px;color:#3a3744">✔ Élections & votes des membres / Member elections & voting</td></tr>
      <tr><td style="padding:6px 0;font-size:13.5px;color:#3a3744">✔ Salle de documents sécurisée / Secure document room</td></tr>
      <tr><td style="padding:6px 0;font-size:13.5px;color:#3a3744">✔ Suivi des reçus & dépenses / Receipt & expense tracking</td></tr>
    </table></td></tr>
  <tr><td align="center" style="padding:18px 30px 6px">
    <a href="${SITE}/?ref=email" style="display:inline-block;background:#2F3AA3;color:#fff;font-weight:700;font-size:15px;padding:13px 24px;border-radius:11px;text-decoration:none;margin:0 4px 8px">Voir Quorly / See Quorly</a>
    <a href="${SITE}/?book=1" style="display:inline-block;background:#fff;color:#2F3AA3;border:1.5px solid #2F3AA3;font-weight:700;font-size:15px;padding:11px 24px;border-radius:11px;text-decoration:none;margin:0 4px 8px">Réserver 15 min / Book a call</a></td></tr>
  <tr><td style="padding:16px 30px 0"><hr style="border:none;border-top:1px solid #ECE9E2;margin:0 0 12px">
    <p style="margin:0;font-size:13px;color:#3a3744"><b>Thomas Derick Shalo</b> · Quorly<br>${REPLY}</p></td></tr>
  <tr><td style="padding:18px 30px 24px"><p style="margin:0;font-size:11px;color:#9b97a6;line-height:1.6">Pour ne plus recevoir ces messages, répondez « STOP ». / Reply “STOP” to opt out.</p></td></tr>
  </table></td></tr></table></body></html>`;
}

async function send(p: { to: string; subject: string; html: string; from?: string }) {
  const payload: Record<string, unknown> = {
    from: p.from || FROM, to: [p.to], subject: p.subject, html: p.html, reply_to: REPLY,
    headers: { "List-Unsubscribe": `<mailto:${REPLY}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
  return await resend("/emails", { method: "POST", body: JSON.stringify(payload) });
}

const SUBJECT = "Quorly — un seul espace pour votre conseil / one shared space for your board";

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
  if (isInboundOnly && b.action !== "inbound") return json({ error: "forbidden" }, 403);

  if (b.action === "add_domain") {
    const { status, body } = await resend("/domains", { method: "POST", body: JSON.stringify({ name: b.name }) });
    return json(body, status);
  }
  if (b.action === "domain_records") {
    let id = b.id;
    if (!id && b.name) { const { body } = await resend("/domains"); id = (body?.data || []).find((d: any) => d.name === b.name)?.id; }
    if (!id) return json({ error: "domain_not_found" }, 404);
    const { status, body } = await resend(`/domains/${id}`); return json(body, status);
  }
  if (b.action === "verify_domain") {
    let id = b.id;
    if (!id && b.name) { const { body } = await resend("/domains"); id = (body?.data || []).find((d: any) => d.name === b.name)?.id; }
    if (!id) return json({ error: "domain_not_found" }, 404);
    const { status, body } = await resend(`/domains/${id}/verify`, { method: "POST" }); return json(body, status);
  }
  if (b.action === "update_tracking") {
    const { status, body } = await resend(`/domains/${b.id}`, { method: "PATCH", body: JSON.stringify({ open_tracking: true, click_tracking: true }) });
    return json(body, status);
  }
  if (b.action === "create_webhook") {
    const { status, body } = await resend("/webhooks", { method: "POST", body: JSON.stringify({
      endpoint: b.endpoint, events: ["email.delivered", "email.opened", "email.clicked", "email.bounced", "email.complained"],
    }) });
    return json(body, status);
  }

  if (b.action === "send") {
    const r = await send({ to: b.to, subject: b.subject || SUBJECT, html: emailHtml(b.name || b.to, 1), from: b.from });
    if (r.status < 300 && b.name) await admin.rpc("quorly_outreach_add", { p_name: b.name, p_email: b.to });
    return json(r.body, r.status);
  }

  if (b.action === "suggest") {
    const items = Array.isArray(b.items) ? b.items : [];
    let added = 0;
    for (const it of items) {
      const email = String(it.email || "").trim().toLowerCase();
      if (!it.org_name) continue;
      const { error } = await admin.from("quorly_outreach").upsert({
        org_name: it.org_name, email: email || null, contact_name: it.contact_name || null,
        category: it.category || null, region: it.region || null, fit: it.fit || null,
        status: "new", stage: "new", suggested_at: new Date().toISOString(),
      }, { onConflict: "email", ignoreDuplicates: false });
      if (!error) added++;
    }
    return json({ ok: true, added, received: items.length });
  }

  // watch-list for the reply-detector routine: emailed prospects still awaiting a reply
  if (b.action === "watch") {
    const { data } = await admin.from("quorly_outreach").select("email, org_name")
      .eq("status", "active").not("email", "is", null).gt("touch_count", 0);
    return json({ ok: true, watch: data ?? [] });
  }

  if (b.action === "stop") { await admin.from("quorly_outreach").update({ status: "stopped", next_due_at: null }).eq("id", b.id); return json({ ok: true, stopped: b.id }); }
  if (b.action === "resume") { await admin.from("quorly_outreach").update({ status: "active", next_due_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq("id", b.id); return json({ ok: true, resumed: b.id }); }

  if (b.action === "preview") {
    const { data: pr } = await admin.from("quorly_outreach").select("*").eq("id", b.id).maybeSingle();
    if (!pr) return json({ error: "prospect_not_found" }, 404);
    const r = await send({ to: b.to, subject: "[Aperçu] " + SUBJECT, html: emailHtml(pr.org_name, 1), from: b.from });
    return json({ ok: r.status < 300, to: b.to, prospect: pr.org_name, resp: r.body }, r.status);
  }

  if (b.action === "inbound") {
    const from = String(b.from || b.sender || b.email || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+/)?.[0];
    if (!from) return json({ error: "no_sender" }, 400);
    const { data: pr } = await admin.from("quorly_outreach").select("id,org_name,status").ilike("email", from).maybeSingle();
    if (pr && pr.status === "active") {
      await admin.from("quorly_outreach").update({ status: "replied", replied_at: new Date().toISOString(), next_due_at: null }).eq("id", pr.id);
      await admin.from("quorly_outreach_events").insert({ email: from, type: "replied" });
    }
    return json({ ok: true, matched: pr?.org_name || null, stopped: !!(pr && pr.status === "active") });
  }

  if (b.action === "followup") {
    // auto-stop on engagement / bounce so they drop out of the cadence
    await admin.from("quorly_outreach").update({ status: "engaged", next_due_at: null }).eq("status", "active").not("clicked_at", "is", null);
    await admin.from("quorly_outreach").update({ status: "bounced", next_due_at: null }).eq("status", "active").not("bounced_at", "is", null);
    // recurring nudge every 7 days until reply / engage / stop / marked met
    const { data: due } = await admin.from("quorly_outreach").select("*")
      .eq("status", "active").neq("stage", "met").not("email", "is", null)
      .is("clicked_at", null).is("bounced_at", null)
      .lte("next_due_at", new Date().toISOString());
    const out: any[] = [];
    for (const rec of due ?? []) {
      const touch = rec.touch_count + 1;
      const r = await send({ to: rec.email, subject: SUBJECT, html: emailHtml(rec.org_name, touch) });
      if (r.status < 300) {
        await admin.from("quorly_outreach").update({
          touch_count: touch, last_sent_at: new Date().toISOString(),
          initial_sent_at: rec.initial_sent_at || new Date().toISOString(),
          next_due_at: new Date(Date.now() + 7 * 86400000).toISOString(), status: "active", stage: rec.stage === "new" ? "contacted" : rec.stage,
        }).eq("id", rec.id);
        await admin.from("quorly_outreach_events").insert({ email: rec.email, type: touch === 1 ? "intro" : "followup", meta: { touch } });
        out.push({ email: rec.email, touch, id: (r.body as any)?.id });
      } else out.push({ email: rec.email, error: r.body });
    }
    return json({ sent: out.length, results: out });
  }

  return json({ error: "unknown_action" }, 400);
});
