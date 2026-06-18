// Concord Express outreach mailer (Kolis · Business sales follow-ups).
// Uses the existing RESEND_API_KEY. Three actions, authed by the project's
// service-role key as a Bearer token (deploy with --no-verify-jwt; auth enforced
// here):
//   GET  ?action=domains              → list Resend domains + verification status
//   POST {action:"add_domain", name}  → register a sending domain, returns DNS records
//   POST {action:"send", ...}         → send an email (from/to/cc/reply_to/subject/html)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND = Deno.env.get("RESEND_API_KEY")!;
const SERVICE = Deno.env.get("OUTREACH_KEY")!; // dedicated shared secret for this admin-only mailer
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function resend(path: string, init?: RequestInit) {
  const r = await fetch("https://api.resend.com" + path, {
    ...init,
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (auth !== SERVICE) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("action") === "domains") {
    const { status, body } = await resend("/domains");
    return json(body, status);
  }

  const b = await req.json().catch(() => ({}));
  if (b.action === "add_domain") {
    const { status, body } = await resend("/domains", { method: "POST", body: JSON.stringify({ name: b.name }) });
    return json(body, status);
  }
  if (b.action === "send") {
    const payload: Record<string, unknown> = {
      from: b.from, to: Array.isArray(b.to) ? b.to : [b.to], subject: b.subject, html: b.html,
    };
    if (b.cc) payload.cc = Array.isArray(b.cc) ? b.cc : [b.cc];
    if (b.reply_to) payload.reply_to = b.reply_to;
    const { status, body } = await resend("/emails", { method: "POST", body: JSON.stringify(payload) });
    return json(body, status);
  }
  return json({ error: "unknown_action" }, 400);
});
