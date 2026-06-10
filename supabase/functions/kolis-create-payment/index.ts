// Creates a manual-capture (escrow) PaymentIntent for a Kolis parcel.
// Funds are authorized/held now and captured on delivery (kolis-finalize-payment),
// or released if cancelled. Reuses the shared Concord Express Stripe account.
//
// Env (already set on the project for stripe-webhook):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { parcel_id } = await req.json();
    if (!parcel_id) return json({ error: "parcel_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: parcel } = await admin
      .from("kolis_parcels")
      .select("id, sender_id, price_cents, insurance_premium_cents, code, stripe_payment_intent_id")
      .eq("id", parcel_id)
      .single();
    if (!parcel || parcel.sender_id !== user.id) return json({ error: "not found" }, 404);

    // Total charged = shipping + insurance premium (premium is company revenue).
    const amount = (parcel.price_cents ?? 0) + (parcel.insurance_premium_cents ?? 0);

    let intent;
    if (parcel.stripe_payment_intent_id) {
      intent = await stripe.paymentIntents.retrieve(parcel.stripe_payment_intent_id);
    } else {
      intent = await stripe.paymentIntents.create({
        amount,
        currency: "cad",
        capture_method: "manual",
        description: `Kolis parcel ${parcel.code}`,
        metadata: { product: "kolis", parcel_id: parcel.id, code: parcel.code, sender_id: user.id, insurance_premium_cents: String(parcel.insurance_premium_cents ?? 0) },
      });
      await admin.from("kolis_parcels").update({ stripe_payment_intent_id: intent.id }).eq("id", parcel.id);
    }
    return json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
