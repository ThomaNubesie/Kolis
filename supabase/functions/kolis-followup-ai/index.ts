// Click -> AI draft -> your approval -> send. When a prospect clicks an outreach
// email, the webhook calls {action:'draft'}: Claude writes the next steps + a
// Kolis-branded follow-up email, stored on the prospect, and a branded approval
// email is sent to the admin with a one-click 'Approve & send' link. That link
// (GET ?action=approve&id=&token=) sends the drafted email to the prospect.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY")!;
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const FROM = "Kolis · Business <marketing@concordexpress.ca>";
const REPLY = "marketing@concordexpress.ca";
const ADMIN = "shaloderick@concordexpress.ca";
const FN = SUPABASE_URL + "/functions/v1/kolis-followup-ai";
const CITIES = "Ottawa, Gatineau, Montréal, Québec City, Toronto, Kingston, Chicoutimi and Sudbury";

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const html = (h: string, s = 200) => new Response(h, { status: s, headers: { "content-type": "text/html; charset=utf-8" } });
const esc = (t: string) => (t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const paras = (t: string) => (t || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

async function resendSend(p: { to: string; cc?: string | null; subject: string; html: string }) {
  const payload: Record<string, unknown> = { from: FROM, to: [p.to], subject: p.subject, html: p.html, reply_to: REPLY };
  if (p.cc) payload.cc = [p.cc];
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) };
}

function kolisEmail(name: string, bodyParas: string[]) {
  const body = bodyParas.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3a3744">${esc(p)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#F1F0F4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1722">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#E11D6B;padding:18px 26px;font-size:19px;font-weight:800;color:#fff">Ko&nbsp; Kolis · Business</td></tr>
  <tr><td style="padding:26px 30px 4px"><p style="margin:0 0 12px;font-size:15px"><b>Bonjour ${esc(name)},</b></p>${body}</td></tr>
  <tr><td align="center" style="padding:8px 30px 6px"><a href="https://business.kolis.ca/?ref=email" style="display:inline-block;background:#E11D6B;color:#fff;font-weight:700;font-size:15px;padding:13px 26px;border-radius:11px;text-decoration:none">Voir Kolis · Business →</a>
    <div style="margin-top:10px;font-size:13px;color:#6B6675">20 min au téléphone : <b>(613) 862-2639</b></div></td></tr>
  <tr><td style="padding:16px 30px 0"><hr style="border:none;border-top:1px solid #ECECF2;margin:0 0 12px">
    <p style="margin:0;font-size:13px;color:#3a3744"><b>Thomas Derick Shalo</b> · Concord Express Co Inc.<br>(613) 862-2639 · marketing@concordexpress.ca</p></td></tr>
  <tr><td style="padding:16px 30px 24px"><p style="margin:0;font-size:11px;color:#9b97a6;line-height:1.6">Kolis · Business est exploité par Concord Express Co Inc. · Répondez « STOP » pour vous désabonner. / Reply “STOP” to opt out.</p></td></tr>
  </table></td></tr></table></body></html>`;
}

function approvalEmail(p: any, subject: string, bodyParas: string[], nextSteps: string, approveUrl: string, boardUrl: string) {
  const draft = bodyParas.map((x) => `<p style="margin:0 0 9px;font-size:14px;line-height:1.55;color:#3a3744">${esc(x)}</p>`).join("");
  const steps = esc(nextSteps).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#F1F0F4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1722">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:620px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#E11D6B;padding:16px 26px;font-size:17px;font-weight:800;color:#fff">Ko&nbsp; Kolis · Business — draft for your approval</td></tr>
  <tr><td style="padding:22px 30px 4px">
    <p style="margin:0 0 4px;font-size:15px"><b>${esc(p.business_name)}</b> just clicked your outreach email.</p>
    <p style="margin:0 0 16px;font-size:12.5px;color:#6B6675">${esc(p.category || "")}${p.city ? " · " + esc(p.city) : ""}${p.tier ? " · Tier " + p.tier : ""} · ${esc(p.email)}</p>
    <div style="background:#FBF3F7;border:1px solid #F3D6E4;border-radius:12px;padding:14px 16px;margin:0 0 16px">
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#E11D6B;margin-bottom:7px">AI next steps</div>
      <div style="font-size:13.5px;line-height:1.6;color:#3a3744">${steps}</div>
    </div>
    <div style="border:1px solid #ECECF2;border-radius:12px;padding:14px 16px;margin:0 0 18px">
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6B6675;margin-bottom:7px">Draft follow-up email</div>
      <p style="margin:0 0 10px;font-size:13px;color:#6B6675"><b>Subject:</b> ${esc(subject)}</p>
      <p style="margin:0 0 9px;font-size:14px;color:#3a3744">Bonjour ${esc(p.contact_name || p.business_name)},</p>
      ${draft}
      <p style="margin:8px 0 0;font-size:12.5px;color:#9b97a6">— Thomas Derick Shalo · Kolis · Business (signature + branding added automatically)</p>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px"><a href="${approveUrl}" style="display:inline-block;background:#16A34A;color:#fff;font-weight:800;font-size:14px;padding:12px 22px;border-radius:10px;text-decoration:none">✓ Approve &amp; send</a></td>
      <td><a href="${boardUrl}" style="display:inline-block;background:#fff;color:#E11D6B;border:1.5px solid #E11D6B;font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px;text-decoration:none">Edit on board</a></td>
    </tr></table>
    <p style="margin:14px 0 0;font-size:12px;color:#9b97a6">Nothing has been sent to the prospect yet — clicking “Approve &amp; send” delivers the email above (Kolis-branded) to ${esc(p.email)}.</p>
  </td></tr>
  <tr><td style="padding:14px 30px 24px"></td></tr>
  </table></td></tr></table></body></html>`;
}

async function aiDraft(p: any, ev: any[]): Promise<{ next_steps: string; subject: string; body: string } | null> {
  if (!ANTHROPIC) return null;
  const ctx = { business: p.business_name, category: p.category, tier: p.tier, contact: p.contact_name, city: p.city, summary: p.summary, turnover: p.turnover, stage: p.stage, opens: ev.filter((e) => e.type === "opened").length, clicks: ev.filter((e) => e.type === "clicked").length, recent: ev.slice(0, 6) };
  const quebec = /gatineau|québec|quebec|montréal|montreal|laval|longueuil|chicoutimi|qc/i.test(`${p.city || ""} ${p.address || ""}`);
  const prompt = `You are a B2B sales strategist + copywriter for **Kolis · Business**, a same-day courier operated by Concord Express Co Inc. that serves businesses across **Ontario and Québec** (cities include ${CITIES}, and more). Kolis pitches businesses on same-day pickup/delivery of their goods (lab specimens, environmental samples, auto parts, grocery). Pricing is simple: the business **pays per shipment (pay-as-you-go)** and the price depends on the package/size they choose — there is **no subscription, no monthly fee and no minimum** — positioned as STAT / overflow / after-hours backup.

HARD RULE: NEVER mention any percentage, commission, margin, markup, or how Kolis pays its couriers. Do NOT say "20%" or "X% of the delivery price". To the merchant it is simply a per-shipment price that depends on the package they select. Quote an exact dollar amount ONLY if you are certain of it; otherwise say pricing is per delivery based on the package and offer to confirm a quote.

This prospect JUST CLICKED a link in our outreach email — a strong buying signal. ${quebec ? "They are in a Quebec city — write the email body BILINGUAL (French first, then a short English echo)." : "Write in English."} Emphasise same-day service across Ontario and Québec; if you name a city, pick the one nearest the prospect.

Prospect + engagement:
${JSON.stringify(ctx, null, 2)}

Return STRICT JSON (no markdown fence) with exactly these keys:
{
  "next_steps": "3 short tactical bullet lines (use the bullet char and newlines) telling the rep what to do now to convert this click",
  "subject": "a warm, specific follow-up subject line",
  "body": "2-4 short paragraphs for the email body, separated by blank lines. NO greeting and NO sign-off (those are added automatically). Single clear CTA: a 15-min call or a same-day trial run."
}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1300, messages: [{ role: "user", content: prompt }] }) });
  const out = await r.json().catch(() => ({}));
  let text = out?.content?.[0]?.text || "";
  text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try { const d = JSON.parse(text); if (d.subject && d.body) return d; } catch { /* fall through */ }
  return null;
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE);
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("action") === "approve") {
    const id = url.searchParams.get("id") || "";
    const token = url.searchParams.get("token") || "";
    const { data: p } = await admin.from("concord_outreach").select("*").eq("id", id).maybeSingle();
    if (!p || !p.followup_approve_token || p.followup_approve_token !== token)
      return html(`<div style="font-family:sans-serif;max-width:520px;margin:60px auto;text-align:center;color:#6B6675"><h2 style="color:#E11D6B">Kolis · Business</h2><p>This approval link is invalid or was already used.</p></div>`, 200);
    const r = await resendSend({ to: p.email, cc: ADMIN, subject: p.followup_draft_subject || "Kolis · Business", html: kolisEmail(p.contact_name || p.business_name, paras(p.followup_draft_body || "")) });
    if (!r.ok) return html(`<div style="font-family:sans-serif;max-width:520px;margin:60px auto;text-align:center;color:#b91c1c"><h2>Send failed</h2><p>${esc(JSON.stringify(r.body))}</p></div>`, 200);
    await admin.from("concord_outreach").update({ followup_ai_sent_at: new Date().toISOString(), followup_approve_token: null, contacted_at: p.contacted_at || new Date().toISOString() }).eq("id", id);
    await admin.from("concord_outreach_events").insert({ email: p.email, type: "ai_followup_sent" });
    return html(`<div style="font-family:sans-serif;max-width:520px;margin:60px auto;text-align:center"><h2 style="color:#16A34A">Sent to ${esc(p.business_name)}</h2><p style="color:#6B6675">The Kolis · Business follow-up was delivered to ${esc(p.email)}.</p><p><a href="https://business.kolis.ca/admin/prospects/${esc(id)}" style="color:#E11D6B">Open on the board →</a></p></div>`, 200);
  }

  if (req.method === "POST") {
    if (req.headers.get("x-kolis-secret") !== SECRET) return j({ error: "forbidden" }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.action !== "draft" || !b.id) return j({ error: "bad_request" }, 400);
    const { data: p } = await admin.from("concord_outreach").select("*").eq("id", b.id).maybeSingle();
    if (!p) return j({ error: "not_found" }, 404);
    if (!p.email) return j({ skipped: "no_email" });
    if (p.followup_ai_sent_at) return j({ skipped: "already_sent" });
    if (p.followup_draft_at && (Date.now() - new Date(p.followup_draft_at).getTime()) < 3 * 86400000) return j({ skipped: "recent_draft" });

    const { data: events } = await admin.from("concord_outreach_events").select("type, link, created_at").eq("email", p.email).order("created_at", { ascending: false }).limit(20);
    const draft = await aiDraft(p, events || []);
    if (!draft) return j({ error: "ai_unavailable" }, 200);

    const token = crypto.randomUUID();
    await admin.from("concord_outreach").update({
      followup_draft_at: new Date().toISOString(),
      followup_draft_subject: draft.subject,
      followup_draft_body: draft.body,
      followup_next_steps: draft.next_steps,
      followup_approve_token: token,
    }).eq("id", b.id);

    const approveUrl = `${FN}?action=approve&id=${b.id}&token=${token}`;
    const boardUrl = `https://business.kolis.ca/admin/prospects/${b.id}`;
    const r = await resendSend({ to: ADMIN, subject: `${p.business_name} clicked — approve the AI follow-up`, html: approvalEmail(p, draft.subject, paras(draft.body), draft.next_steps, approveUrl, boardUrl) });
    return j({ ok: r.ok, drafted: true, notified: ADMIN });
  }

  return j({ error: "unknown" }, 400);
});
