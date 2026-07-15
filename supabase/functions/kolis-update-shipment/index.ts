// Update an already-requested shipment (recipient, address, destination, hub/door,
// size) while it's still editable (requested/at-hub, no courier assigned). Recomputes
// the org-aware price; for pay-as-you-go orgs it auto charges/refunds the difference
// on the card on file. Owner/admin/shipper only.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function resolveStripe(): Stripe | null {
  const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key || (!key.startsWith("sk_test_") && !liveOk)) return null;
  return new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { org_id, parcel_id, fields } = await req.json();
    if (!org_id || !parcel_id || !fields) return json({ error: "org_id, parcel_id, fields required" }, 400);
    const { data: role } = await userClient.rpc("kolis_org_role", { p_org: org_id });
    if (!["owner", "admin", "shipper"].includes(String(role))) return json({ error: "forbidden" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, org_id, status, driver_id, price_cents, from_city, to_city, dropoff_type, size, billing_mode, stripe_payment_intent_id")
      .eq("id", parcel_id).maybeSingle();
    if (!p || p.org_id !== org_id) return json({ ok: false, error: "not_found" });
    if (p.driver_id || !["requested", "received_at_hub"].includes(String(p.status)))
      return json({ ok: false, error: "shipment_locked" });

    // Compute the new price up front (org-aware) so we can charge before committing.
    const newDtype = (fields.p_dropoff_type ?? p.dropoff_type) || p.dropoff_type;
    const newSize = (fields.p_size ?? p.size) || p.size;
    const newCity = (String(fields.p_to_city ?? "").trim() || p.to_city);
    const { data: newPrice } = await admin.rpc("kolis_org_price_cents",
      { p_org: org_id, p_size: newSize, p_dropoff_type: newDtype, p_from_city: p.from_city, p_to_city: newCity });
    const delta = (newPrice ?? p.price_cents) - p.price_cents;

    const isCard = p.billing_mode === "card";
    const stripe = resolveStripe();
    let adjustment: Record<string, unknown> = { delta_cents: delta };

    // Charge the increase BEFORE committing (so we never save an unpaid upgrade).
    if (isCard && delta > 0) {
      const { data: org } = await admin.from("kolis_orgs").select("stripe_customer_id, stripe_default_pm, name").eq("id", org_id).maybeSingle();
      if (!stripe) return json({ ok: false, error: "billing_disabled" });
      if (!org?.stripe_customer_id || !org?.stripe_default_pm) return json({ ok: false, error: "no_card", delta_cents: delta });
      try {
        const pi = await stripe.paymentIntents.create({
          amount: delta, currency: "cad", customer: org.stripe_customer_id as string, payment_method: org.stripe_default_pm as string,
          off_session: true, confirm: true, description: `Kolis shipment ${parcel_id} · edit upcharge`,
          metadata: { product: "kolis-org-payg-adjust", parcel_id, org_id },
        }, { idempotencyKey: `payg_adjust_${parcel_id}_${newPrice}` });
        if (pi.status !== "succeeded") return json({ ok: false, error: "payment_failed", status: pi.status });
        adjustment = { delta_cents: delta, charged_cents: delta, payment_intent: pi.id };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return json({ ok: false, error: "payment_failed", code: err?.code, detail: err?.message });
      }
    }

    // Commit the field + price changes.
    const { data: res, error: rpcErr } = await userClient.rpc("kolis_org_update_shipment", {
      p_org: org_id, p_parcel: parcel_id,
      p_dropoff_type: fields.p_dropoff_type ?? null, p_size: fields.p_size ?? null, p_to_city: fields.p_to_city ?? null,
      p_recipient_name: fields.p_recipient_name ?? null, p_recipient_phone: fields.p_recipient_phone ?? null,
      p_recipient_email: fields.p_recipient_email ?? null, p_dropoff_addr: fields.p_dropoff_addr ?? null,
      p_pickup_addr: fields.p_pickup_addr ?? null,
    });
    if (rpcErr) return json({ ok: false, error: rpcErr.message });

    // Refund the decrease after commit (best-effort; original hold on the parcel).
    if (isCard && delta < 0 && stripe && p.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id as string, amount: -delta });
        adjustment = { delta_cents: delta, refunded_cents: -delta };
      } catch (e) { adjustment = { delta_cents: delta, refund_error: String((e as Error)?.message ?? e) }; }
    }

    return json({ ok: true, ...(res as object), adjustment });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
