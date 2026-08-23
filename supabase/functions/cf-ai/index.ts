// cf-ai — Quorly writing assistant + translation (server-side LLM key).
// POST { action:'polish', text, tone? }  -> improved text (same language)
// POST { action:'translate', text, target_lang } -> translation only
// Deploy with verify_jwt=FALSE; auth enforced INSIDE (getUser on Bearer) so the
// gateway never 401s the browser. CORS must list x-client-info (supabase-js sends it).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
async function llm(system: string, user: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, system, messages: [{ role: "user", content: user }] }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.message || "llm_error");
  return (j.content?.[0]?.text ?? "").trim();
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    if (!KEY) return json({ error: "ai_unconfigured" }, 503);
    const b = await req.json().catch(() => ({} as any));
    const text = String(b.text || "").slice(0, 6000);
    if (!text) return json({ error: "no_text" }, 400);
    if (b.action === "translate") {
      const target = String(b.target_lang || "en");
      return json({ ok: true, text: await llm(`You are a professional translator. Translate the user's text into ${target}. Return ONLY the translation, no notes, preserve meaning, names and formatting.`, text) });
    }
    const tone = String(b.tone || "professional");
    return json({ ok: true, text: await llm(`You are an expert editor. Correct grammar and spelling and polish the wording in a ${tone} tone. Keep the SAME language as the input and DO NOT change the meaning or add content. Return ONLY the improved text.`, text) });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
