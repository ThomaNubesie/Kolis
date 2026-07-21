// kolis-email-webhook: Resend webhook receiver for Kolis campaign + satisfaction
// emails. Verifies the Svix signature (RESEND_WEBHOOK_SECRET), updates the
// matching kolis_campaign_recipients row (opened_at/clicked_at/status) by
// resend_email_id, and appends to kolis_email_events. Deploy --no-verify-jwt.
// Point a Resend webhook (delivered/opened/clicked/bounced/complained) here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Dedicated secret for THIS Resend webhook endpoint (separate from the concord
// webhook's RESEND_WEBHOOK_SECRET — each Resend endpoint has its own signing key).
const WHSEC = Deno.env.get("KOLIS_RESEND_WEBHOOK_SECRET") || "";

function b64decode(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function verify(req: Request, body: string): Promise<boolean> {
  if (!WHSEC) return true; // setup window
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

  const type = String(ev.type || "").replace(/^email\./, ""); // delivered|opened|clicked|bounced|complained
  const data = ev.data || {};
  const emailId = data.email_id ?? null;
  const email = (Array.isArray(data.to) ? data.to[0] : data.to || "").toLowerCase();
  const link = data.click?.link || null;
  const admin = createClient(SUPABASE_URL, SERVICE);
  const now = new Date().toISOString();

  // Update the campaign recipient (if this was a campaign email).
  let orgId: string | null = null, kind = "campaign", refId: string | null = null;
  if (emailId) {
    const { data: rcp } = await admin.from("kolis_campaign_recipients")
      .select("id, campaign_id, kolis_campaigns(org_id)").eq("resend_email_id", emailId).maybeSingle();
    if (rcp) {
      refId = rcp.campaign_id; orgId = (rcp as any).kolis_campaigns?.org_id ?? null;
      const patch: Record<string, unknown> = {};
      if (type === "delivered") patch.status = "delivered";
      if (type === "opened") { patch.opened_at = now; patch.status = "opened"; }
      if (type === "clicked") { patch.clicked_at = now; patch.status = "clicked"; }
      if (type === "bounced") patch.status = "bounced";
      if (Object.keys(patch).length) await admin.from("kolis_campaign_recipients").update(patch).eq("id", rcp.id);
    } else {
      // maybe a satisfaction email — inherit org/kind from its 'sent' log row
      const { data: prior } = await admin.from("kolis_email_events").select("org_id, kind, ref_id").eq("resend_email_id", emailId).limit(1).maybeSingle();
      if (prior) { orgId = prior.org_id; kind = prior.kind; refId = prior.ref_id; }
    }
  }

  await admin.from("kolis_email_events").insert({ org_id: orgId, kind, ref_id: refId, email, resend_email_id: emailId, event: type, link });
  return new Response("ok");
});
