// Captures (on delivery) or cancels (releases the hold) a Kolis parcel's escrow
// PaymentIntent. capture = admin only; cancel = parcel sender or admin.
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

    const { parcel_id, action } = await req.json(); // action: 'capture' | 'cancel'
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: parcel } = await admin
      .from("kolis_parcels")
      .select("id, sender_id, stripe_payment_intent_id")
      .eq("id", parcel_id)
      .single();
    if (!parcel?.stripe_payment_intent_id) return json({ error: "no payment" }, 404);

    const { data: drv } = await admin.from("drivers").select("is_admin").eq("id", user.id).maybeSingle();
    const isAdmin = !!drv?.is_admin;

    if (action === "capture") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      await stripe.paymentIntents.capture(parcel.stripe_payment_intent_id);
      await admin.from("kolis_parcels").update({ status: "delivered" }).eq("id", parcel.id);
    } else if (action === "cancel") {
      if (!isAdmin && parcel.sender_id !== user.id) return json({ error: "forbidden" }, 403);
      await stripe.paymentIntents.cancel(parcel.stripe_payment_intent_id);
      await admin.from("kolis_parcels").update({ status: "cancelled" }).eq("id", parcel.id);
    } else {
      return json({ error: "bad action" }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
