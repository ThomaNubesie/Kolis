// kolis-mark-replied: reply-detection bridge for the outreach CRM.
// Resend can't see replies (they hit the mailbox, not the tracking webhook), so a
// scheduled Gmail-scanning routine calls this to close the loop.
//   GET/POST {action:"watch"}            → prospects sent a tracked email, still open
//                                          (the addresses to scan Gmail for replies from)
//   POST     {action:"replied", email}   → mark that prospect "replied": stop follow-ups
//                                          + log a 'replied' event on the profile timeline
// Bearer must equal KOLIS_REPLIED_KEY. Deploy with --no-verify-jwt.
const KEY = Deno.env.get("KOLIS_REPLIED_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const rest = (p: string, init?: RequestInit) => fetch(`${SB_URL}/rest/v1${p}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if ((req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim()) !== KEY) return json({ error: "unauthorized" }, 401);

  const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const action = b.action || new URL(req.url).searchParams.get("action") || "watch";
  try {

  // Watch-list: emailed prospects not yet replied/won/lost.
  if (action === "watch") {
    const rows = await (await rest(`/concord_outreach?select=id,business_name,email,stage&email=not.is.null&initial_sent_at=not.is.null&stage=not.in.(replied,won,lost)`)).json();
    return json({ ok: true, watch: Array.isArray(rows) ? rows.filter((r: { email?: string }) => r.email) : [], raw: Array.isArray(rows) ? undefined : rows });
  }

  if (action === "replied") {
    const email = (b.email || "").trim().toLowerCase();
    if (!email) return json({ error: "email required" }, 400);
    const found = await (await rest(`/concord_outreach?email=eq.${encodeURIComponent(email)}&select=id,business_name,stage`)).json();
    const p = Array.isArray(found) ? found[0] : null;
    if (!p) return json({ ok: true, matched: false });
    if (["replied", "won", "lost"].includes(p.stage)) return json({ ok: true, already: true, stage: p.stage, business_name: p.business_name });

    // Stop follow-ups and move the stage to replied.
    await rest(`/concord_outreach?id=eq.${p.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ stage: "replied", status: "done", next_due_at: null, followup_due_at: null }),
    });
    // Surface it on the profile engagement timeline.
    await rest(`/concord_outreach_events`, {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email, type: "replied" }),
    }).catch(() => {});
    return json({ ok: true, marked: true, business_name: p.business_name });
  }

  return json({ error: "bad_action" }, 400);
  } catch (e) {
    return json({ error: "runtime", detail: String((e as Error)?.message ?? e), hasKey: !!KEY, hasUrl: !!SB_URL, hasSr: !!SR }, 500);
  }
});
