// Pay-as-you-go: charge a business org's saved card for one shipment, off-session.
// Called by the shipper portal right after a PAYG shipment is created. Idempotent
// per parcel (won't double-charge). Requires the org to have a saved default card.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

// SAFETY INTERLOCK (matches kolis-setup-card): TEST key unless KOLIS_BILLING_LIVE=true,
// so pay-as-you-go can't charge real cards during the test phase.
function resolveStripe(): { stripe: Stripe } | { skip: string } {
  const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key) return { skip: "no Stripe key" };
  if (!key.startsWith("sk_test_") && !liveOk) return { skip: "live key blocked during test phase" };
  return { stripe: new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() }) };
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
// Ops/admin path: charge a parcel to its org's PAYG card without a user session
// (used for back-billing). Same credit+card logic as the portal call.
const ADMIN_SECRET = "kolis_admincharge_2f7a";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { org_id, parcel_id } = await req.json();
    if (!org_id || !parcel_id) return json({ error: "org_id and parcel_id required" }, 400);

    const adminCall = (req.headers.get("x-admin-secret") || "") === ADMIN_SECRET;
    if (!adminCall) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "unauthorized" }, 401);
      // Only owner/admin/shipper of the org may charge.
      const { data: role } = await userClient.rpc("kolis_org_role", { p_org: org_id });
      if (!["owner", "admin", "shipper"].includes(String(role))) return json({ error: "forbidden" }, 403);
    }

    const sr = resolveStripe();
    if ("skip" in sr) return json({ error: "billing_disabled", detail: sr.skip }, 400);
    const { stripe } = sr;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, org_id, price_cents, insurance_premium_cents, stripe_payment_intent_id, code").eq("id", parcel_id).maybeSingle();
    if (!p || p.org_id !== org_id) return json({ error: "not found" }, 404);
    if (p.stripe_payment_intent_id) return json({ ok: true, already: true }); // idempotent

    const { data: org } = await admin.from("kolis_orgs")
      .select("stripe_customer_id, stripe_default_pm, name").eq("id", org_id).maybeSingle();
    if (!org?.stripe_customer_id || !org?.stripe_default_pm) return json({ error: "no_card" }, 402);

    const amount = (p.price_cents ?? 0) + (p.insurance_premium_cents ?? 0);

    // Apply any prepaid org credit first (atomic — safe under concurrent bulk charges).
    let creditApplied = 0;
    if (amount > 0) {
      const { data: used } = await admin.rpc("kolis_org_consume_credit", { p_org: org_id, p_want_cents: amount });
      creditApplied = Number(used || 0);
    }
    let net = amount - creditApplied;
    // Stripe's minimum charge is 50¢; if credit leaves a sub-minimum remainder,
    // absorb it (treat as fully covered) rather than fail the shipment.
    if (net > 0 && net < 50) net = 0;

    // Fully covered by credit → no card charge. Mark paid with a credit sentinel.
    if (net <= 0) {
      await admin.from("kolis_parcels").update({ stripe_payment_intent_id: `credit_${p.id}`, credit_applied_cents: creditApplied }).eq("id", p.id);
      return json({ ok: true, charged_cents: 0, credit_applied_cents: creditApplied });
    }

    try {
      const pi = await stripe.paymentIntents.create({
        amount: net, currency: "cad",
        customer: org.stripe_customer_id as string,
        payment_method: org.stripe_default_pm as string,
        off_session: true, confirm: true,
        description: `Kolis shipment ${p.code} · ${org.name}${creditApplied ? ` (−$${(creditApplied / 100).toFixed(2)} credit)` : ""}`,
        metadata: { product: "kolis-org-payg", parcel_id: p.id as string, org_id, credit_applied_cents: String(creditApplied) },
      }, { idempotencyKey: `payg_${p.id}` });
      if (pi.status === "succeeded") {
        await admin.from("kolis_parcels").update({ stripe_payment_intent_id: pi.id, credit_applied_cents: creditApplied }).eq("id", p.id);
        return json({ ok: true, charged_cents: net, credit_applied_cents: creditApplied });
      }
      // Needs extra auth — give back the credit we consumed and surface for the portal.
      if (creditApplied > 0) await admin.rpc("kolis_org_add_credit", { p_org: org_id, p_cents: creditApplied });
      return json({ error: "authentication_required", status: pi.status, clientSecret: pi.client_secret }, 402);
    } catch (e) {
      // Charge failed → refund the consumed credit so it isn't lost.
      if (creditApplied > 0) await admin.rpc("kolis_org_add_credit", { p_org: org_id, p_cents: creditApplied });
      const err = e as { code?: string; message?: string };
      return json({ error: "payment_failed", code: err?.code, detail: err?.message }, 402);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
