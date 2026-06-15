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
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
