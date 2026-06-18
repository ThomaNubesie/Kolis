// Resend webhook receiver for the Concord Express outreach campaign.
// Logs delivered/opened/clicked/bounced/complained events into
// concord_outreach_events and updates the matching concord_outreach recipient
// (opened_at / clicked_at / bounced_at; clicked or bounced stops follow-ups).
// Deploy with --no-verify-jwt (Resend calls it; authenticity via Svix signature).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHSEC = Deno.env.get("RESEND_WEBHOOK_SECRET") || ""; // "whsec_<base64>"

function b64decode(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Svix signature verification (Resend uses Svix). Returns true if any provided
// signature matches, or if no secret is configured yet (setup window).
async function verify(req: Request, body: string): Promise<boolean> {
  if (!WHSEC) return true;
  const id = req.headers.get("svix-id"), ts = req.headers.get("svix-timestamp"), sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const secret = b64decode(WHSEC.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sig.split(" ").some((p) => p.split(",")[1] === expected);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("bad signature", { status: 401 });
  let ev: any; try { ev = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }

  const type = String(ev.type || "").replace(/^email\./, ""); // delivered | opened | clicked | bounced | complained
  const data = ev.data || {};
  const email = (Array.isArray(data.to) ? data.to[0] : data.to || "").toLowerCase();
  const link = data.click?.link || null;
  const admin = createClient(SUPABASE_URL, SERVICE);

  await admin.from("concord_outreach_events").insert({ email, type, resend_email_id: data.email_id ?? null, link });

  if (email) {
    const patch: Record<string, unknown> = {};
    const now = new Date().toISOString();
    if (type === "opened") patch.opened_at = now;
    if (type === "clicked") { patch.clicked_at = now; patch.status = "clicked"; } // strong signal → stop follow-ups
    if (type === "bounced") { patch.bounced_at = now; patch.status = "bounced"; }
    if (Object.keys(patch).length) await admin.from("concord_outreach").update(patch).eq("email", email);
  }
  return new Response("ok");
});
