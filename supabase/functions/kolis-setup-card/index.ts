// Card-on-file for orgs: opens a Stripe hosted Checkout (mode=setup) so the org can
// save a card. Used both by pay-as-you-go orgs (charged per shipment) and net-terms
// orgs (charged if an invoice goes overdue). Returns a redirect URL. Owner only.
//
// SAFETY INTERLOCK: TEST key (sk_test_…) unless KOLIS_BILLING_LIVE=true.
// Env: STRIPE_TEST_SECRET_KEY|STRIPE_SECRET_KEY, KOLIS_BILLING_LIVE,
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL = Deno.env.get("KOLIS_PORTAL_URL") || "https://business.kolis.ca";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function resolveStripe(): { stripe: Stripe } | { skip: string } {
  const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key) return { skip: "no Stripe key" };
  if (!key.startsWith("sk_test_") && !liveOk) return { skip: "live key blocked during test phase (set STRIPE_TEST_SECRET_KEY)" };
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

    const s = resolveStripe();
    if ("skip" in s) return json({ ok: false, skipped: s.skip });
    const { stripe } = s;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: org } = await admin.from("kolis_orgs").select("id,name,billing_email,phone,address,city,postal,country,stripe_customer_id").eq("id", org_id).single();
    if (!org) return json({ error: "not found" }, 404);

    // Full customer profile so the Stripe record clearly identifies the org.
    const custFields: Record<string, unknown> = {
      name: org.name,
      email: org.billing_email ?? undefined,
      phone: org.phone ?? undefined,
      description: `${org.name} · Kolis Business`,
      metadata: { kolis_org_id: org.id, org_name: org.name },
    };
    if (org.address || org.city || org.postal || org.country) {
      custFields.address = { line1: org.address ?? undefined, city: org.city ?? undefined, postal_code: org.postal ?? undefined, country: org.country || "CA" };
    }

    let customerId = org.stripe_customer_id as string | null;
    if (!customerId) {
      const c = await stripe.customers.create(custFields, { idempotencyKey: `kolis_cust_${org.id}` });
      customerId = c.id;
      await admin.from("kolis_orgs").update({ stripe_customer_id: customerId }).eq("id", org.id);
    } else {
      try { await stripe.customers.update(customerId, custFields); } catch { /* keep-in-sync; non-fatal */ }
    }
    // Hosted Checkout (mode=setup): Stripe collects + saves the card on its own page,
    // then setup_intent.succeeded (webhook) records it as the org default_pm. We just
    // hand back a URL to redirect to — no card fields to build in the portal.
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      custom_text: {
        submit: { message: "Kolis is operated by Concord Express Co Inc. Your card is saved securely and charged per shipment — no invoices, cancel anytime." },
      },
      success_url: `${PORTAL}/shipper/billing?card=saved`,
      cancel_url: `${PORTAL}/shipper/billing?card=cancel`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
