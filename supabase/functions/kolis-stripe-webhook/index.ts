// Stripe webhook for Kolis business invoices. Verifies the signature, then
// applies the event idempotently via kolis_apply_stripe_invoice_event (dedupe
// on event.id). Handles invoice paid / payment_failed.
//
// SAFETY INTERLOCK: uses the TEST key + TEST webhook secret unless
// KOLIS_BILLING_LIVE=true. Until go-live, configure STRIPE_TEST_SECRET_KEY +
// STRIPE_WEBHOOK_SECRET_TEST and point a Stripe TEST webhook here.
//
// Env: STRIPE_TEST_SECRET_KEY|STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET_TEST|
//      STRIPE_WEBHOOK_SECRET, KOLIS_BILLING_LIVE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
const webhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") || Deno.env.get("STRIPE_WEBHOOK_SECRET") || "");
const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!key.startsWith("sk_test_") && !liveOk) return new Response(JSON.stringify({ skipped: "test phase" }), { status: 200 });
  if (!webhookSecret) return new Response("no webhook secret", { status: 500 });

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (e) {
    return new Response(`bad signature: ${String((e as Error)?.message ?? e)}`, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const map: Record<string, string> = {
    "invoice.paid": "paid",
    "invoice.payment_succeeded": "paid",
    "invoice.payment_failed": "payment_failed",
  };
  const status = map[event.type];
  if (status) {
    const inv = event.data.object as Stripe.Invoice;
    await admin.rpc("kolis_apply_stripe_invoice_event", {
      p_event_id: event.id, p_stripe_invoice_id: inv.id, p_status: status,
    });
  }

  // ── Subscription (plans) sync → org.plan + platform_fee_rate ──
  const PLAN_FEE: Record<string, number> = { free: 0.20, business: 0.15, pro: 0.12 };
  const applyPlan = async (orgId: string, plan: string, subId: string | null, subStatus: string, renews: number | null) => {
    if (!orgId) return;
    await admin.from("kolis_orgs").update({
      plan, platform_fee_rate: PLAN_FEE[plan] ?? 0.20,
      plan_status: subStatus, stripe_subscription_id: subId,
      plan_renews_at: renews ? new Date(renews * 1000).toISOString() : null,
    }).eq("id", orgId);
  };
  const planFromPrice = async (priceId?: string) => {
    if (!priceId) return null;
    const { data } = await admin.from("kolis_plan_prices").select("plan").eq("stripe_price_id", priceId).maybeSingle();
    return data?.plan ?? null;
  };

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.mode === "subscription") {
      const orgId = s.metadata?.org_id || "";
      const plan = s.metadata?.plan || "business";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = s.subscription ? (await stripe.subscriptions.retrieve(s.subscription as string)) as any : null;
      await applyPlan(orgId, plan, (s.subscription as string) || null, sub?.status || "active", sub?.current_period_end || null);
    }
  } else if (event.type === "customer.subscription.updated") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = event.data.object as any;
    const plan = sub.metadata?.org_id ? (sub.metadata?.plan || (await planFromPrice(sub.items?.data?.[0]?.price?.id)) || "business") : "business";
    const eff = ["active", "trialing"].includes(sub.status) ? plan : "free";
    await applyPlan(sub.metadata?.org_id || "", eff, sub.id, sub.status, sub.current_period_end);
  } else if (event.type === "customer.subscription.deleted") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = event.data.object as any;
    await applyPlan(sub.metadata?.org_id || "", "free", null, "canceled", null);
  } else if (event.type === "setup_intent.succeeded") {
    // A business saved a card (pay-as-you-go) — record it as their default payment method.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const si = event.data.object as any;
    const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
    const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
    if (customer && pm) await admin.from("kolis_orgs").update({ stripe_default_pm: pm }).eq("stripe_customer_id", customer);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
