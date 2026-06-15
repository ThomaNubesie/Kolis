// Kolis public REST API for business orgs. Authenticated by an org API key
// (Authorization: Bearer kolis_live_…), not a user JWT.
//   POST /v1/shipments  → create an invoice-mode shipment (idempotent via client_ref)
// Deploy with --no-verify-jwt (key auth is enforced here).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const key = auth.replace(/^Bearer\s+/i, "").trim();
    if (!key.startsWith("kolis_")) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: rec } = await admin.from("kolis_access_keys")
      .select("id, key_hash, scopes, org_id, created_by, revoked_at")
      .eq("prefix", key.slice(0, 16)).maybeSingle();
    if (!rec || rec.revoked_at || !rec.org_id) return json({ error: "unauthorized" }, 401);
    if ((await sha256Hex(key)) !== rec.key_hash) return json({ error: "unauthorized" }, 401);
    if (!(rec.scopes ?? []).includes("shipments:write")) return json({ error: "insufficient_scope" }, 403);
    await admin.from("kolis_access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", rec.id);

    const body = await req.json().catch(() => ({}));
    if (!body.to_city) return json({ error: "to_city required" }, 400);

    const { data, error } = await admin.rpc("kolis_api_create_shipment", {
      p_org: rec.org_id, p_sender: rec.created_by,
      p_dropoff_type: body.pickup ?? body.dropoff_type ?? "door",
      p_size: body.size ?? "small",
      p_from_city: body.from_city ?? "Ottawa",
      p_to_city: body.to_city,
      p_recipient_name: body.to_name ?? null,
      p_recipient_phone: body.to_phone ?? null,
      p_dropoff_addr: body.to_address ?? null,
      p_client_ref: body.client_ref ?? null,
    });
    if (error) {
      const msg = error.message || "error";
      const code = msg.includes("credit_limit") ? 402 : msg.includes("org_inactive") ? 403 : msg.includes("bad_") ? 400 : 500;
      return json({ error: msg }, code);
    }
    return json({ shipment: data }, 201);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
