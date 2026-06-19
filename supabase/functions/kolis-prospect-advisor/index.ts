// AI sales advisor for a Kolis prospect. Browser-invoked: the caller's Supabase
// JWT must belong to staff (verified via kolis_is_staff). Pulls the prospect +
// engagement events (service role), asks Claude for the best next steps to win
// the contract, returns the suggestions as text. Needs ANTHROPIC_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") || "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
  const authz = req.headers.get("Authorization") || "";
  // Verify the caller is staff using their own JWT.
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authz } } });
  const { data: staff } = await asUser.rpc("kolis_is_staff");
  if (!staff) return json({ error: "forbidden" }, 403);

  if (!ANTHROPIC) return json({ error: "not_configured", message: "AI advisor is not configured — add the ANTHROPIC_API_KEY secret." }, 200);

  const { id, task } = await req.json().catch(() => ({}));
  if (!id) return json({ error: "missing id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);
  // Read tables directly with the service role (RLS bypassed). The staff-gated
  // RPCs can't be used here because the service role has no auth.uid().
  const { data: p } = await admin.from("concord_outreach").select("*").eq("id", id).maybeSingle();
  if (!p) return json({ error: "not found" }, 404);
  const { data: events } = await admin.from("concord_outreach_events")
    .select("type, link, created_at").eq("email", p.email ?? "__none__")
    .order("created_at", { ascending: false }).limit(20);
  const ev = events || [];

  const ctx = {
    business: p.business_name, category: p.category, tier: p.tier, contact: p.contact_name,
    city: p.city, address: p.address, summary: p.summary, turnover: p.turnover,
    stage: p.stage, has_email: !!p.email,
    opens: ev.filter((e) => e.type === "opened").length,
    clicks: ev.filter((e) => e.type === "clicked").length,
    contacted_at: p.contacted_at, followup_sent_at: p.followup_sent_at,
    recent_engagement: ev.slice(0, 8),
  };

  const base = `You are a sharp B2B sales strategist + copywriter for **Kolis**, a same-day local courier on the Ottawa–Gatineau–Montréal corridor (operated by Concord Express Co Inc.). Kolis pitches businesses on same-day pickup/delivery of their goods (lab specimens, environmental samples, auto parts, grocery), billed monthly on account at **20% of the delivery price** (no subscription, no minimum), positioned as STAT / overflow / after-hours backup. INTERNAL ONLY — never disclose to the merchant: Kolis pays the courier out of that 20%. If the prospect is in Quebec/Gatineau, write **bilingual FR/EN**; otherwise English.

Prospect + engagement:
${JSON.stringify(ctx, null, 2)}`;

  // task: undefined/next_steps | micro_proposal | email | call_script
  let prompt: string, maxTok = 1500;
  if (task === "micro_proposal") {
    maxTok = 1800;
    prompt = `${base}\n\nWrite a **signed-ready, one-page micro-proposal** ${p.business_name} can sign on the spot. Include: a one-line offer tailored to their category; what's included (same-day pickup/delivery on the corridor, real-time tracking); the simple terms (20% of the delivery price, billed monthly on account, no subscription, no minimum, cancel anytime); a low-risk starter (e.g., first run free or no setup fee); and a signature block with name/title/date lines for BOTH Kolis (Thomas Derick Shalo, Founder & CEO, Concord Express Co Inc., (613) 862-2639, marketing@concordexpress.ca) and the merchant. Tight enough to fit one page. Output plain text ready to print — no preamble.`;
  } else if (task === "email") {
    maxTok = 1100;
    prompt = `${base}\n\nWrite a short, warm **follow-up email** to ${p.business_name}, tailored to their category and engagement (if they haven't opened prior emails, use a punchy subject and lead differently). Give it a clear single CTA (a 15-min call or a same-day trial run). Output: "Subject:" line then the body. No preamble.`;
  } else if (task === "call_script") {
    maxTok = 1100;
    prompt = `${base}\n\nWrite a concise **phone / walk-in script** for approaching ${p.business_name}: a one-breath opener, the value in plain language, the single most likely objection + a crisp rebuttal, and the ask. Natural and human, not robotic. No preamble.`;
  } else {
    prompt = `${base}\n\nGive the 3 most effective, specific NEXT STEPS to move this prospect toward a signed contract. For each: what to do, who to target, what to say, ideal timing, and the main objection to pre-empt. Tailor to category, tier, and engagement signals. Concise, tactical bullet points. End with a one-line "I can draft any of these for you — a micro-proposal, follow-up email, or call script — just ask."`;
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTok, messages: [{ role: "user", content: prompt }] }),
  });
  const out = await r.json().catch(() => ({}));
  if (r.status >= 300) return json({ error: "ai_error", detail: out }, 200);
  const text = (out.content?.[0]?.text) || "No output returned.";
  return json({ suggestions: text, task: task || "next_steps" });
  } catch (e) {
    return json({ error: "crash", detail: String((e as Error)?.message ?? e) }, 500);
  }
});
