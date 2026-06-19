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

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const authz = req.headers.get("Authorization") || "";
  // Verify the caller is staff using their own JWT.
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authz } } });
  const { data: staff } = await asUser.rpc("kolis_is_staff");
  if (!staff) return json({ error: "forbidden" }, 403);

  if (!ANTHROPIC) return json({ error: "not_configured", message: "AI advisor is not configured — add the ANTHROPIC_API_KEY secret." }, 200);

  const { id } = await req.json().catch(() => ({}));
  if (!id) return json({ error: "missing id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: rows } = await admin.rpc("kolis_prospect_get", { p_id: id });
  const p = Array.isArray(rows) ? rows[0] : rows;
  if (!p) return json({ error: "not found" }, 404);
  const { data: events } = await admin.rpc("kolis_prospect_events", { p_id: id });

  const ctx = {
    business: p.business_name, category: p.category, tier: p.tier, summary: p.summary, turnover: p.turnover,
    stage: p.stage, has_email: !!p.email, opens: p.opens, clicks: p.clicks,
    contacted_at: p.contacted_at, followup_sent_at: p.followup_sent_at,
    recent_engagement: (events || []).slice(0, 8),
  };

  const prompt = `You are a sharp B2B sales strategist for **Kolis**, a same-day local courier on the Ottawa–Gatineau–Montréal corridor (operated by Concord Express Co Inc.). Kolis pitches businesses on same-day pickup/delivery of their goods (lab specimens, environmental samples, auto parts), billed monthly on account at 20% of the delivery price — positioned as STAT / overflow / after-hours backup, not a full route replacement.

Here is a prospect and how they've engaged with our outreach so far:
${JSON.stringify(ctx, null, 2)}

Give the 3 most effective, specific NEXT STEPS to move this prospect toward a signed contract. For each: what to do, who to target (e.g. regional lab ops vs the front desk), what to say or send, ideal timing, and the main objection to pre-empt. Tailor to their category, tier, and engagement signals (e.g. opened-but-didn't-click vs clicked vs no email on file). Be concise and tactical — short bullet points, no preamble.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
  });
  const out = await r.json().catch(() => ({}));
  if (r.status >= 300) return json({ error: "ai_error", detail: out }, 200);
  const text = (out.content?.[0]?.text) || "No suggestion returned.";
  return json({ suggestions: text });
});
