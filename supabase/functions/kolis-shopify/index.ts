// Kolis ↔ Shopify integration (MVP). One function, two endpoints, both authed by
// the merchant's Kolis API key passed as ?key=kolis_live_… (Shopify can't send a
// custom auth header on carrier-service / webhook callbacks):
//   POST /kolis-shopify/rates   → CarrierService rate callback: offers "Kolis
//                                  Same-Day Local Delivery" when destination is local.
//   POST /kolis-shopify/orders  → orders/create webhook: imports the order as a
//                                  Kolis shipment (idempotent via client_ref).
// Deploy with --no-verify-jwt (key auth enforced here).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RATE_CENTS = parseInt(Deno.env.get("KOLIS_SHOPIFY_RATE_CENTS") || "1250", 10);
const SERVICE_CODE = "kolis_same_day";

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
    const url = new URL(req.url);
    const key = (url.searchParams.get("key") || req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "").trim();
    if (!key.startsWith("kolis_")) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: rec } = await admin.from("kolis_access_keys")
      .select("id, key_hash, org_id, created_by, scopes, revoked_at").eq("prefix", key.slice(0, 16)).maybeSingle();
    if (!rec || rec.revoked_at || !rec.org_id) return json({ error: "unauthorized" }, 401);
    if ((await sha256Hex(key)) !== rec.key_hash) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const isRates = url.pathname.endsWith("/rates") || !!body.rate;

    // ── CarrierService: offer a same-day local rate when origin & destination share a province ──
    if (isRates) {
      const r = body.rate || {};
      const dst = r.destination || {};
      const org = r.origin || {};
      const local = dst.province && org.province && String(dst.province).toUpperCase() === String(org.province).toUpperCase();
      const rates = local ? [{
        service_name: "Kolis Same-Day Local Delivery",
        service_code: SERVICE_CODE,
        total_price: String(RATE_CENTS),     // Shopify expects cents as a string
        currency: r.currency || "CAD",
        description: "Local courier · delivered same day",
      }] : [];
      return json({ rates });
    }

    // ── orders/create webhook → create a Kolis shipment ──
    const order = body;
    const lines = order.shipping_lines || [];
    const chose = lines.some((l: any) => l.code === SERVICE_CODE || String(l.title || "").toLowerCase().includes("kolis"));
    if (!chose) return json({ ok: true, skipped: "not a Kolis delivery" });

    const a = order.shipping_address || {};
    const city = a.city || a.province || "";
    if (!city) return json({ error: "no destination city on order" }, 400);
    const name = a.name || `${a.first_name || ""} ${a.last_name || ""}`.trim() || null;
    const addr = [a.address1, a.address2, a.city, a.province, a.zip].filter(Boolean).join(", ") || null;

    const { data, error } = await admin.rpc("kolis_api_create_shipment", {
      p_org: rec.org_id, p_sender: rec.created_by,
      p_dropoff_type: "door", p_size: "small",
      p_from_city: order?.origin?.city ?? "Ottawa",
      p_to_city: city,
      p_recipient_name: name,
      p_recipient_phone: a.phone || order.phone || null,
      p_dropoff_addr: addr,
      p_client_ref: "shopify:" + String(order.id),
    });
    if (error) return json({ error: error.message }, error.message?.includes("credit_limit") ? 402 : 400);
    return json({ ok: true, shipment: data }, 201);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
