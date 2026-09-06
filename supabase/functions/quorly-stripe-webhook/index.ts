// quorly-stripe-webhook — Stripe's word on what an organisation is paying for.
//
// The subscription is the source of truth for `plan`; nothing else may write it.
// Without this the checkout would take money and the product would never unlock,
// which is the worst of both.
//
// Deploy with verify_jwt=FALSE — Stripe does not send a Supabase JWT. The signature
// IS the authentication, and a request that fails it is rejected before anything is
// read from the body.
//
// Env: STRIPE_SECRET_KEY (or STRIPE_TEST_SECRET_KEY), QUORLY_STRIPE_WEBHOOK_SECRET
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const key = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const webhookSecret = Deno.env.get("QUORLY_STRIPE_WEBHOOK_SECRET") || "";
const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!key || !webhookSecret) return new Response("stripe not configured", { status: 503 });

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (e) {
    return new Response(`bad signature: ${String((e as Error)?.message ?? e)}`, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // A subscription that is not paying does not confer a plan. 'trialing' does —
  // the advertised free month is a real subscription that has simply not billed yet.
  const planFor = (status: string, plan: string) =>
    ["active", "trialing", "past_due"].includes(status) ? plan : "free";

  const apply = async (orgId: string, plan: string, subId: string | null, status: string, renews: number | null) => {
    if (!orgId) return;
    await admin.from("cf_forms").update({
      plan: planFor(status, plan),
      plan_status: status,
      stripe_subscription_id: subId,
      plan_renews_at: renews ? new Date(renews * 1000).toISOString() : null,
    }).eq("id", orgId);
  };

  const planFromPrice = async (priceId?: string) => {
    if (!priceId) return null;
    const { data } = await admin.from("quorly_plan_prices")
      .select("plan").eq("stripe_price_id", priceId).eq("kind", "base").maybeSingle();
    return data?.plan ?? null;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode !== "subscription") break;
      const sub = s.subscription ? (await stripe.subscriptions.retrieve(s.subscription as string)) as any : null;
      await apply(s.metadata?.org_id || "", s.metadata?.plan || "board",
                  (s.subscription as string) || null, sub?.status || "active", sub?.current_period_end ?? null);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as any;
      // The plan comes from metadata when we set it, and from the price when Stripe
      // is the one that changed the subscription (an upgrade in the billing portal).
      const plan = sub.metadata?.plan || (await planFromPrice(sub.items?.data?.[0]?.price?.id)) || "board";
      await apply(sub.metadata?.org_id || "", plan, sub.id, sub.status, sub.current_period_end ?? null);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      await apply(sub.metadata?.org_id || "", "free", null, "canceled", null);
      break;
    }
    case "invoice.payment_failed": {
      // Do not strip the plan on a single failed charge: Stripe retries, and a board
      // locked out mid-meeting over an expired card is a worse outcome than a few
      // days of unpaid access. The status is recorded so it can be chased.
      const inv = event.data.object as any;
      const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (customer) await admin.from("cf_forms").update({ plan_status: "past_due" }).eq("stripe_customer_id", customer);
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
