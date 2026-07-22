// Post-checkout card confirm (fallback for the setup_intent.succeeded webhook).
// Called when the shipper returns from Stripe hosted Checkout (?card=saved): looks
// up the org's Stripe customer, takes their newest saved card, sets it as the org
// default_pm + the customer's default. Idempotent. Owner only.
//
// SAFETY INTERLOCK: TEST key unless KOLIS_BILLING_LIVE=true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function resolveStripe(): { stripe: Stripe } | { skip: string } {
  const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key) return { skip: "no Stripe key" };
  if (!key.startsWith("sk_test_") && !liveOk) return { skip: "live key blocked during test phase" };
  return { stripe: new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() }) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { org_id } = await req.json();
    if (!org_id) return json({ error: "org_id required" }, 400);
    const { data: role } = await userClient.rpc("kolis_org_role", { p_org: org_id });
    if (role !== "owner") return json({ error: "forbidden" }, 403); // billing/card is owner-only

    const sr = resolveStripe();
    if ("skip" in sr) return json({ ok: false, skipped: sr.skip });
    const { stripe } = sr;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: org } = await admin.from("kolis_orgs").select("id, stripe_customer_id").eq("id", org_id).single();
    if (!org?.stripe_customer_id) return json({ ok: false, has_card: false, reason: "no_customer" });

    // Newest saved card on the customer (Checkout mode=setup just attached it).
    const pms = await stripe.paymentMethods.list({ customer: org.stripe_customer_id as string, type: "card", limit: 1 });
    const pm = pms.data[0];
    if (!pm) return json({ ok: false, has_card: false, reason: "no_payment_method" });

    await stripe.customers.update(org.stripe_customer_id as string, { invoice_settings: { default_payment_method: pm.id } });
    await admin.from("kolis_orgs").update({ stripe_default_pm: pm.id }).eq("id", org.id);
    return json({ ok: true, has_card: true, brand: pm.card?.brand, last4: pm.card?.last4, livemode: pm.livemode });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
