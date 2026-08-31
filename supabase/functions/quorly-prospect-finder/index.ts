// quorly-prospect-finder — grounded prospect discovery for the outreach console.
//
// The outreach engine could only ever act on prospects a human typed in: the mailer
// accepts finder suggestions (action:"suggest"), but nothing produced them. This is
// that producer.
//
// GROUNDED means the model is not asked to recall organizations from memory — it
// searches the web and may only return an address it actually saw on a page, with
// the URL it saw it on. An invented address is worse than no prospect: cold mail to
// a fabricated inbox burns quorly.ca's sending reputation and, under CASL, we need a
// real basis for every address. Rows land as status 'new' and send NOTHING until a
// human approves them in the console.
//
// POST { regions?: string[], kinds?: string[], limit?: number }
// Auth: master QUORLY_OUTREACH_KEY, or the JWT of a quorly_outreach_admins member.
// Deploy with verify_jwt=FALSE; auth enforced here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OUTREACH_KEY = Deno.env.get("QUORLY_OUTREACH_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const DEFAULT_REGIONS = ["Ottawa, Ontario", "Montréal, Québec"];
const DEFAULT_KINDS = [
  "condominium boards and syndicates of co-owners",
  "non-profit associations and community organizations",
  "professional and trade associations",
  "cultural, sports and recreation clubs",
];

type Prospect = { org_name: string; email: string; contact_name?: string; category?: string; region?: string; fit?: string; source_url: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({} as any));

    // ---- auth: master key, or a signed-in outreach operator ----
    const auth = req.headers.get("Authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "");
    let allowed = OUTREACH_KEY !== "" && bearer === OUTREACH_KEY;
    if (!allowed && bearer) {
      const { data: u } = await admin.auth.getUser(bearer);
      if (u?.user) {
        const { data: op } = await admin.from("quorly_outreach_admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
        allowed = !!op;
      }
    }
    if (!allowed) return json({ error: "unauthorized" }, 401);
    if (!ANTHROPIC) return json({ error: "ai_unconfigured" }, 503);

    const regions: string[] = Array.isArray(b.regions) && b.regions.length ? b.regions.slice(0, 6).map(String) : DEFAULT_REGIONS;
    const kinds: string[] = Array.isArray(b.kinds) && b.kinds.length ? b.kinds.slice(0, 8).map(String) : DEFAULT_KINDS;
    const limit = Math.min(Math.max(Number(b.limit) || 12, 1), 25);

    // Everything already on the list, so the model doesn't spend searches re-finding it.
    const { data: existing } = await admin.from("quorly_outreach").select("org_name, email").limit(500);
    const known = (existing ?? []).map((r: any) => r.email || r.org_name).filter(Boolean);
    const knownEmails = new Set((existing ?? []).map((r: any) => String(r.email || "").toLowerCase()).filter(Boolean));

    const system = `You find real organizations that would benefit from Quorly — a bilingual (EN/FR) platform where a board, association or condo syndicate runs its meetings, minutes, motions, elections, documents and member roster in one place.

You have a web search tool. USE IT. Do not answer from memory.

ABSOLUTE RULE ON CONTACT ADDRESSES:
Only return an email address that you actually SAW in a search result or page during THIS session, and return the exact URL you saw it on as "source_url". If you cannot find a published address for an organization, OMIT that organization entirely. Never guess, never construct an address from a pattern (like info@<domain>), never infer one from a similar organization. A missing prospect costs nothing; an invented address is a serious error.

Prefer addresses an organization publishes for general or board contact. Skip personal addresses of private individuals, skip generic directory/aggregator inboxes, and skip organizations whose contact page says not to solicit them.

Return ONLY a raw JSON array — no markdown, no code fences, no prose before or after — of at most ${limit} objects, each EXACTLY:
{"org_name":"","email":"","contact_name":"","category":"","region":"","fit":"","source_url":""}
Rules: "region" is the city. "category" is the kind of organization. "fit" is ONE sentence, grounded in something you actually read about them, on why Quorly suits them. "contact_name" is "" when unknown. If you find nothing verifiable, return [].`;

    const user = `Find organizations in: ${regions.join("; ")}.
Kinds of organization: ${kinds.join("; ")}.
Search in both English and French — many of these publish only in French.
${known.length ? `\nAlready on our list — do NOT return these:\n${known.slice(0, 200).join(", ")}` : ""}`;

    const body: any = {
      model: "claude-opus-5",
      max_tokens: 8000,
      system,
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 18 }],
      messages: [{ role: "user", content: user }],
    };

    // A server-side tool loop can stop with pause_turn when it hits its iteration
    // limit; resume by echoing the assistant turn back, with no extra user message.
    let data: any = null;
    for (let i = 0; i < 4; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
      });
      data = await r.json();
      if (data.error) return json({ error: data.error?.message || "llm_error" }, 502);
      if (data.stop_reason !== "pause_turn") break;
      body.messages.push({ role: "assistant", content: data.content });
    }
    if (data?.stop_reason === "refusal") return json({ error: "refused" }, 502);

    const text = (data?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    let raw = text;
    const s0 = raw.indexOf("["), e0 = raw.lastIndexOf("]");
    if (s0 >= 0 && e0 > s0) raw = raw.slice(s0, e0 + 1);
    let found: any[] = [];
    try { found = JSON.parse(raw); } catch { return json({ error: "unparseable", sample: text.slice(0, 300) }, 502); }

    // The model's own rules are re-checked here: a row without a real-looking address
    // and a source URL never reaches the console, whatever the model claimed.
    const seen = new Set<string>();
    const items: Prospect[] = [];
    const dropped: { org: string; why: string }[] = [];
    for (const f of Array.isArray(found) ? found : []) {
      const org_name = String(f?.org_name || "").trim();
      const email = String(f?.email || "").trim().toLowerCase();
      const source_url = String(f?.source_url || "").trim();
      if (!org_name) continue;
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) { dropped.push({ org: org_name, why: "no usable email" }); continue; }
      if (!/^https?:\/\//i.test(source_url)) { dropped.push({ org: org_name, why: "no source url" }); continue; }
      if (knownEmails.has(email)) { dropped.push({ org: org_name, why: "already on the list" }); continue; }
      if (seen.has(email)) { dropped.push({ org: org_name, why: "duplicate in this batch" }); continue; }
      seen.add(email);
      items.push({
        org_name, email, source_url,
        contact_name: String(f?.contact_name || "").trim() || undefined,
        category: String(f?.category || "").trim() || undefined,
        region: String(f?.region || "").trim() || undefined,
        // Keep the source on the row: an operator approving a cold email should be
        // one click from the page the address came from.
        fit: [String(f?.fit || "").trim(), `Source: ${source_url}`].filter(Boolean).join(" "),
      });
    }

    if (items.length === 0) return json({ ok: true, added: 0, found: 0, dropped });

    // Hand off to the mailer's existing intake so suggestions land exactly like any
    // other: status 'new', awaiting human approval, upserted on email.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/quorly-outreach`, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${OUTREACH_KEY}` },
      body: JSON.stringify({ action: "suggest", items }),
    });
    const out = await res.json().catch(() => ({}));
    return json({ ok: true, added: out?.added ?? 0, found: items.length, dropped, prospects: items.map((i) => ({ org_name: i.org_name, email: i.email, region: i.region })) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
