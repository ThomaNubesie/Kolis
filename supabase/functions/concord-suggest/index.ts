// Insert AI-suggested prospects into concord_outreach as status='suggested' (pending admin approval).
// POST ?key=<OUTREACH_KEY> { prospects: [{business_name, email?, category?, address?, city?, why?}] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("OUTREACH_KEY")!;
const SUGGEST = Deno.env.get("CONCORD_SUGGEST_TOKEN") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const tok = url.searchParams.get("key") || req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (tok !== KEY && !(SUGGEST && tok === SUGGEST)) return json({ error: "unauthorized" }, 401);
  try {
    const b = await req.json().catch(() => ({}));
    const items: any[] = Array.isArray(b.prospects) ? b.prospects : (b.business_name ? [b] : []);
    let added = 0, skipped = 0; const out: string[] = [];
    for (const p of items) {
      const name = String(p.business_name || "").trim();
      if (!name) continue;
      const { data: ex } = await admin.from("concord_outreach").select("id").ilike("business_name", name).maybeSingle();
      if (ex) { skipped++; continue; }
      const { error } = await admin.from("concord_outreach").insert({
        business_name: name, email: p.email || null, category: p.category || null,
        address: p.address || null, city: p.city || null, notes: p.why || p.notes || null,
        status: "suggested", stage: "suggested", suggested_at: new Date().toISOString(),
      });
      if (!error) { added++; out.push(name); } else skipped++;
    }
    return json({ ok: true, added, skipped, names: out });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
