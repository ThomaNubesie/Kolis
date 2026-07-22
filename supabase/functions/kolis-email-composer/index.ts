// kolis-email-composer: AI-drafts a promotional email (subject + HTML body) for
// an org's clients, based on a promotion + its products. DRAFT ONLY — it never
// sends. Caller must be owner/admin/shipper of the org. Mirrors the Claude call
// in kolis-prospect-advisor. Needs ANTHROPIC_API_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") || "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authz = req.headers.get("Authorization") || "";
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authz } } });
    const { org_id, promotion_id, product_ids, tone, audience } = await req.json().catch(() => ({}));
    if (!org_id) return json({ error: "org_id required" }, 400);

    const { data: role } = await asUser.rpc("kolis_org_role", { p_org: org_id });
    if (!["owner", "admin", "shipper"].includes(String(role || ""))) return json({ error: "forbidden" }, 403);
    if (!ANTHROPIC) return json({ error: "not_configured", message: "Add the ANTHROPIC_API_KEY secret to enable AI drafting." }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: orgRow } = await admin.from("kolis_orgs").select("name").eq("id", org_id).single();
    let promo: any = null;
    if (promotion_id) {
      const { data } = await admin.from("kolis_org_promotions").select("*").eq("id", promotion_id).eq("org_id", org_id).single();
      promo = data;
    }
    const ids: string[] = promo?.product_ids?.length ? promo.product_ids : (Array.isArray(product_ids) ? product_ids : []);
    let products: any[] = [];
    if (ids.length) {
      const { data } = await admin.from("kolis_org_products").select("name, price_cents, description").in("id", ids).eq("org_id", org_id);
      products = data || [];
    }

    const productLines = products.map((p) => `- ${p.name} ($${(p.price_cents / 100).toFixed(2)}${p.description ? ` — ${p.description}` : ""})`).join("\n") || "(no specific products)";
    const promoLine = promo ? `Promotion "${promo.name}"${promo.discount_pct ? `, ${promo.discount_pct}% off` : ""}${promo.ends_at ? `, ends ${promo.ends_at}` : ""}.` : "A general promotion.";
    const aud = audience === "past_customers" ? "past customers who have ordered before" : "all opted-in clients";

    const prompt = `You are writing a short promotional email for "${orgRow?.name || "a business"}" (a shipper on the Kolis delivery platform) to send to its ${aud}.
${promoLine}
Featured products:
${productLines}

Tone: ${tone || "warm, friendly, concise"}.
Write ONE promotional email. Requirements:
- Return ONLY a JSON object: {"subject": "...", "html": "..."}
- Keep it short (2-4 short paragraphs). One clear call to action.
- html is the INNER body only (no <html>/<head>/<body>, no logo, no footer — those are added automatically). Use light inline styles and a simple CTA button.
- Mention the discount if any. Do not invent prices; use the ones given.
- Use {{first_name}} as a placeholder for the client's first name.
Return the JSON now.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1400, messages: [{ role: "user", content: prompt }] }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "ai_failed", detail: out }, 502);
    const text = (out.content?.[0]?.text) || "";

    // Parse the JSON Claude returned (tolerate code fences / surrounding prose).
    let subject = "", html = "";
    try {
      const m = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : text);
      subject = String(parsed.subject || "").trim();
      html = String(parsed.html || "").trim();
    } catch (_) { /* fall through */ }
    if (!subject || !html) { subject = promo?.name || "A little something for you"; html = `<p>${text.replace(/\n/g, "<br>")}</p>`; }

    return json({ ok: true, subject, html });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
