// cf-ai — Quorly writing assistant + translation + lost-document replacement guide (server-side LLM key).
// POST { action:'polish', text, tone? }  -> improved text (same language)
// POST { action:'translate', text, target_lang } -> translation only
// POST { action:'lost_guide', doc_type, locality, lang } -> replacement procedure + fees + official links
// Deploy with verify_jwt=FALSE; auth enforced INSIDE (getUser on Bearer). CORS lists x-client-info.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
async function llm(system: string, user: string, maxTokens = 1024): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) });
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

    // ---- Lost-document replacement guide (type + issuing locality) ----
    if (b.action === "lost_guide") {
      const docType = String(b.doc_type || "identity document").slice(0, 80);
      const locality = String(b.locality || "").slice(0, 140).trim();
      const lostLoc = String(b.lost_location || "").slice(0, 140).trim();
      if (!locality) return json({ error: "no_locality" }, 400);
      const lang = b.lang === "fr" ? "French" : "English";
      const sys = `You are an expert on official procedures for replacing lost or stolen identity and legal documents worldwide. Respond in ${lang}. FIRST identify the exact ISSUING AUTHORITY responsible for this document type in the given jurisdiction (e.g. a Québec driver's licence → SAAQ; a Canadian passport → Passport Canada / IRCC; an Ontario health card → ServiceOntario; a US passport → US Department of State; a Cameroon passport → Directorate of Immigration / DGSN). Center all guidance on that authority. Be accurate and SPECIFIC to the issuing jurisdiction. Return ONLY a raw JSON object — no markdown, no code fences, no prose before or after — with EXACTLY this shape:
{"title":"","authority":"","report":[""],"replace":[""],"documents_needed":[""],"fees":"","timeline":"","abroad":"","official_links":[{"label":"","url":""}],"disclaimer":""}
Rules: "authority" = the full name of the issuing/replacing authority (+ its acronym). "report" = concise steps to report it lost/stolen (police report if applicable, fraud/lost-document hotlines). "replace" = concise steps to obtain a replacement through that authority. "documents_needed" = what to bring. "fees" = state the currency and amounts; if unsure give a typical range and say fees change. "abroad" = IF the person's current location differs from the issuing country, concise guidance to contact the nearest EMBASSY/CONSULATE of the issuing country in their current location (and emergency travel document if they must travel); OTHERWISE empty string "". "official_links" = ONLY that authority's official government URLs (2-4). "disclaimer" = one sentence to confirm current details with the official source. Keep each step under 25 words.`;
      const user = `Lost document type: ${docType}\nIssued in (jurisdiction): ${locality}\nPerson's current location (where it was lost / where they are now): ${lostLoc || "not specified"}`;
      const raw = await llm(sys, user, 1700);
      // The model sometimes wraps JSON in ```json fences or adds prose — extract the object.
      let clean = raw.trim();
      const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
      if (s >= 0 && e > s) clean = clean.slice(s, e + 1);
      let guide: any; try { guide = JSON.parse(clean); } catch { guide = { title: docType, raw }; }
      return json({ ok: true, guide });
    }

    // ---- Read a receipt image → structured fields (vision) ----
    if (b.action === "read_receipt") {
      const img = String(b.image_b64 || "");
      const mime = String(b.mime || "image/jpeg");
      if (!img) return json({ error: "no_image" }, 400);
      const isPdf = mime === "application/pdf";
      if (!isPdf && !/^image\/(jpeg|png|gif|webp)$/.test(mime)) return json({ ok: true, fields: {}, unsupported: true });
      const sys = `You read receipts and invoices (image or PDF). Extract fields and return ONLY a raw JSON object (no markdown, no prose) with EXACTLY:
{"merchant":"","date":"YYYY-MM-DD","category":"","subtotal":0,"tax":0,"total":0,"currency":"CAD"}
Rules: "category" MUST be one of: Meals, Fuel, Office, Travel, Lodging, Supplies, Groceries, Utilities, Medical, Other. Amounts are plain numbers (no symbols). "total" is the grand total paid. "tax" is total sales tax (GST+QST/HST etc). "date" in ISO. If a value is unreadable use null for numbers and "" for text.`;
      const block = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: img } }
        : { type: "image", source: { type: "base64", media_type: mime, data: img } };
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, system: sys, messages: [{ role: "user", content: [block, { type: "text", text: "Extract the receipt fields as JSON." }] }] }) });
      const j = await r.json();
      if (j.error) return json({ error: j.error?.message || "vision_error" }, 500);
      let raw = (j.content?.[0]?.text ?? "").trim();
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
      let fields: any = {}; try { fields = JSON.parse(raw); } catch { fields = {}; }
      return json({ ok: true, fields });
    }

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
