// Delivers queued Kolis webhook events. Cron-triggered: claims due deliveries
// (FOR UPDATE SKIP LOCKED via kolis_claim_webhook_deliveries), HMAC-SHA256 signs
// the payload with the endpoint secret, POSTs it, and records success/retry.
// Deploy with --no-verify-jwt; optionally gate with KOLIS_CRON_SECRET.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("KOLIS_CRON_SECRET") ?? "";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-kolis-cron") !== CRON_SECRET) return json({ error: "forbidden" }, 403);
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: claimed } = await admin.rpc("kolis_claim_webhook_deliveries", { p_limit: 20 });
  let delivered = 0, failed = 0;
  for (const d of claimed ?? []) {
    const bodyStr = JSON.stringify(d.payload);
    try {
      const sig = await hmacHex(d.secret, bodyStr);
      const res = await fetch(d.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kolis-signature": sig, "x-kolis-event": d.payload?.event ?? "" },
        body: bodyStr,
      });
      const ok = res.status >= 200 && res.status < 300;
      await admin.rpc("kolis_complete_webhook_delivery", { p_id: d.id, p_ok: ok, p_code: res.status });
      ok ? delivered++ : failed++;
    } catch (_e) {
      await admin.rpc("kolis_complete_webhook_delivery", { p_id: d.id, p_ok: false, p_code: 0 });
      failed++;
    }
  }
  return json({ ok: true, claimed: (claimed ?? []).length, delivered, failed });
});
