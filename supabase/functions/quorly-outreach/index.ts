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
//   POST {action:"render", id|org_name, touch?}  → the exact email HTML, WITHOUT sending
//        (the only action a signed-in outreach operator may call; everything else is master-key)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND = Deno.env.get("RESEND_API_KEY")!;
const KEY = Deno.env.get("QUORLY_OUTREACH_KEY")!;
const INBOUND_TOKEN = Deno.env.get("QUORLY_INBOUND_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <hello@quorly.ca>";
// The address a prospect sees and replies to. A business domain, not a personal
// gmail: this is a cold email to a board, and the signature has to look like the
// company it comes from. Drives the signature, the footer, reply_to, and the
// List-Unsubscribe mailto — change it here and it changes everywhere at once.
const REPLY = Deno.env.get("QUORLY_REPLY_EMAIL") || "shaloderick@concordexpress.ca";
const SITE = "https://quorly.ca";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function resend(path: string, init?: RequestInit) {
  const r = await fetch("https://api.resend.com" + path, {
    ...init, headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// The letterhead. Table-based on purpose: flexbox and CSS gradients are unreliable
// in Outlook and parts of Gmail, so the masthead, the colour bar and the brand dots
// are all real table cells that degrade to squares rather than collapsing.
//
// Three styles exist. 'b' (banded, indigo masthead) is what we send; 'c' (colour
// spine) and 'd' (cream stationery) are kept live as backups so switching is a
// one-word change here and the console can preview all three side by side.
type Sheet = "b" | "c" | "d";
const DOTS = ["#2F3AA3", "#1F9D6B", "#E4632A", "#C99A1E"];

function dotsRow(size: number) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${DOTS.map((c) =>
    `<td width="${size}" height="${size}" bgcolor="${c}" style="width:${size}px;height:${size}px;background:${c};border-radius:50%;font-size:0;line-height:0">&nbsp;</td><td width="5" style="width:5px;font-size:0;line-height:0">&nbsp;</td>`).join("")}</tr></table>`;
}

const colourBar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${DOTS.map((c) =>
  `<td width="25%" height="4" bgcolor="${c}" style="height:4px;background:${c};font-size:0;line-height:0">&nbsp;</td>`).join("")}</tr></table>`;

// Quorly-branded bilingual email. touch 1 = intro; 2/3+ = gentle recurring nudges.
function emailHtml(name: string, touch: number, sheet: Sheet = "b") {
  const intro: Record<number, [string, string]> = {
    1: [`Je vous écris parce que Quorly aide les organisations comme ${name} à gérer le travail du conseil et des comités dans un seul espace partagé : formulaires remplis ensemble, votes et élections des membres, salle de documents sécurisée et suivi des reçus — sans tableurs ni fils de courriels perdus.`,
        `I'm reaching out because Quorly helps organizations like ${name} run their board & committee work in one shared space — forms filled in together, member voting & elections, a secure document room, and receipt tracking — no spreadsheets, no lost email threads.`],
    2: [`Petit rappel : Quorly réunit vos formulaires partagés, vos élections/votes, vos documents et vos reçus au même endroit — chaque membre voit la même chose, en couleur.`,
        `A quick reminder: Quorly brings your shared forms, elections/votes, documents and receipts into one place — every member sees the same thing, colour-coded.`],
    3: [`Je reste disponible si Quorly peut aider votre organisation — un court appel de 15 minutes suffit pour vous montrer comment votre conseil l'utiliserait.`,
        `I'm still here whenever Quorly could help your organization — a quick 15-minute call is all it takes to show how your board would use it.`],
  };
  const [fr, en] = intro[touch] || intro[3];
  const bullets: [string, string][] = [
    ["Formulaires partagés & colorés", "Shared colour-coded forms"],
    ["Élections & votes des membres", "Member elections & voting"],
    ["Salle de documents sécurisée", "Secure document room"],
    ["Suivi des reçus & dépenses", "Receipt & expense tracking"],
  ];
  const list = bullets.map(([f, e]) =>
    `<tr><td style="padding:9px 0;border-top:1px solid #ECE9E2;font-size:13.5px;color:#3a3744">${f}<span style="color:#6B6675"> / ${e}</span></td></tr>`).join("");

  const letter = `
    <p style="margin:0 0 12px;font-size:15px"><b>Bonjour,</b></p>
    <p style="margin:0 0 10px;font-size:14.5px;line-height:1.65;color:#3a3744">${fr}</p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.65;color:#6B6675;font-style:italic">${en}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">${list}</table>
    <div style="margin:0 0 4px">
      <a href="${SITE}/?ref=email" style="display:inline-block;background:#2F3AA3;color:#fff;font-weight:700;font-size:14.5px;padding:12px 22px;border-radius:10px;text-decoration:none;margin:0 6px 8px 0">Voir Quorly / See Quorly</a>
      <a href="${SITE}/?book=1" style="display:inline-block;background:#fff;color:#2F3AA3;border:1.5px solid #2F3AA3;font-weight:700;font-size:14.5px;padding:10px 22px;border-radius:10px;text-decoration:none;margin:0 0 8px">Réserver 15 min / Book a call</a>
    </div>
    <div style="border-top:1px solid #ECE9E2;padding-top:14px;margin-top:20px;font-size:13px;color:#3a3744;line-height:1.6">
      <b>Thomas Derick Shalo</b><br><span style="color:#6B6675">Quorly · ${REPLY}</span>
    </div>`;

  const optout = `<tr><td style="padding:16px 30px 24px"><p style="margin:0;font-size:11px;color:#9b97a6;line-height:1.6">Pour ne plus recevoir ces messages, répondez « STOP ». / Reply “STOP” to opt out.</p></td></tr>`;

  let inner: string;
  if (sheet === "c") {
    // Colour spine down the left edge; the body carries the page.
    inner = `<tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="7" bgcolor="#2F3AA3" style="width:7px;background:#2F3AA3;font-size:0;line-height:0">&nbsp;</td>
        <td style="padding:32px 32px 30px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:21px;font-weight:900;color:#2F3AA3;letter-spacing:-0.5px">Quorly</td>
            <td style="padding-left:10px;font-size:11px;color:#6B6675">quorly.ca</td>
          </tr></table>
          <div style="border-top:1px solid #ECE9E2;margin:14px 0 22px"></div>
          ${letter}
        </td></tr></table></td></tr>${optout}`;
  } else if (sheet === "d") {
    // Cream stationery: reads as correspondence rather than a campaign.
    inner = `<tr><td bgcolor="#FBF8F2" style="background:#FBF8F2;padding:38px 42px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="top"><div style="font-size:22px;font-weight:900;color:#2F3AA3;letter-spacing:-0.5px">Quorly</div>
          <div style="font-size:11px;color:#6B6675;margin-top:3px">Un seul espace pour votre conseil</div></td>
        <td valign="top" align="right" style="font-size:11px;color:#6B6675;line-height:1.7">Thomas Derick Shalo<br>${REPLY}<br>quorly.ca</td>
      </tr></table>
      <div style="border-top:1px solid #E3DCCB;margin:20px 0 24px"></div>
      ${letter}
    </td></tr>${optout}`;
  } else {
    // 'b' — banded masthead with the four brand dots and a colour bar under it.
    inner = `<tr><td bgcolor="#2F3AA3" style="background:#2F3AA3;padding:20px 30px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="color:#ffffff;font-size:20px;font-weight:900;letter-spacing:-0.5px">Quorly</td>
        <td align="right">${dotsRow(7)}</td>
      </tr></table></td></tr>
      <tr><td style="font-size:0;line-height:0">${colourBar}</td></tr>
      <tr><td style="padding:30px 34px 30px">${letter}</td></tr>${optout}`;
  }

  return `<!doctype html><html><body style="margin:0;background:#F1EEE7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#14131A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE9E2">
  ${inner}
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
  const admin = createClient(SUPABASE_URL, SERVICE);

  // A signed-in outreach operator may RENDER the email — read-only, sends nothing —
  // so the console can show what a prospect would receive before anyone approves it.
  // Everything that sends or mutates still demands the master key, which must never
  // reach a browser.
  let isOperator = false;
  if (!isMaster && !isInboundOnly && tok) {
    const { data: u } = await admin.auth.getUser(tok);
    if (u?.user) {
      const { data: op } = await admin.from("quorly_outreach_admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
      isOperator = !!op;
    }
  }
  if (!isMaster && !isInboundOnly && !isOperator) return json({ error: "unauthorized" }, 401);

  if (isMaster && req.method === "GET" && url.searchParams.get("action") === "domains") {
    const { status, body } = await resend("/domains"); return json(body, status);
  }

  const b = await req.json().catch(() => ({}));
  if (isInboundOnly && b.action !== "inbound") return json({ error: "forbidden" }, 403);
  if (isOperator && b.action !== "render") return json({ error: "forbidden" }, 403);

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

  // Show the exact message without sending it. The console calls this before an
  // operator approves a prospect: approving queues a real cold email to a real
  // organization, so "what does it say" must be answerable without sending one.
  if (b.action === "render") {
    const touch = Math.min(Math.max(Number(b.touch) || 1, 1), 3);
    const sheet: Sheet = b.sheet === "c" || b.sheet === "d" ? b.sheet : "b";
    const name = String(b.org_name || "").trim();
    if (name) return json({ ok: true, subject: SUBJECT, from: FROM, reply_to: REPLY, touch, sheet, html: emailHtml(name, touch, sheet) });
    const { data: pr } = await admin.from("quorly_outreach").select("org_name").eq("id", b.id).maybeSingle();
    if (!pr) return json({ error: "prospect_not_found" }, 404);
    return json({ ok: true, subject: SUBJECT, from: FROM, reply_to: REPLY, touch, sheet, html: emailHtml(pr.org_name, touch, sheet), org_name: pr.org_name });
  }

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
