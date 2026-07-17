// Finalizes a Kolis parcel's escrow PaymentIntent.
//   action "deliver": assigned driver (with matching 4-digit code) -> capture + delivered
//   action "capture": admin -> capture + delivered
//   action "cancel":  sender or admin -> cancel (release the hold)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

// Gate to a TEST key unless billing is live (matches the rest of Kolis billing).
function resolveStripe(): Stripe | null {
  const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key) return null;
  if (!key.startsWith("sk_test_") && !liveOk) return null;
  return new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
}
const stripe = resolveStripe();
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

    const { parcel_id, action, code, force } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: parcel } = await admin
      .from("kolis_parcels")
      .select("id, sender_id, driver_id, delivery_code, stripe_payment_intent_id, billing_mode, org_id")
      .eq("id", parcel_id)
      .single();
    if (!parcel) return json({ error: "not found" }, 404);

    const { data: drv } = await admin.from("drivers").select("is_admin").eq("id", user.id).maybeSingle();
    const isAdmin = !!drv?.is_admin;
    // parcel.driver_id is the courier's kolis_profiles id; the signed-in user may
    // be that id OR their linked LoadQ driver id (loadq_driver_id).
    let isDriver = parcel.driver_id === user.id;
    if (!isDriver && parcel.driver_id) {
      const { data: kp } = await admin.from("kolis_profiles")
        .select("id").eq("id", parcel.driver_id).eq("loadq_driver_id", user.id).maybeSingle();
      if (kp) isDriver = true;
    }

    const pid = parcel.stripe_payment_intent_id as string | null;
    // Capture the escrow, tolerating no-PI (invoice/PAYG), test-mode PIs after go-live,
    // and already-captured / expired / released holds so a legitimate delivery still
    // closes instead of erroring. NEVER throws.
    async function settle(): Promise<string> {
      if (!pid) return "no_payment_intent";
      if (pid.startsWith("credit_")) return "credit"; // fully covered by org credit
      if (!stripe) return "no_payment_intent";
      try {
        const pi = await stripe.paymentIntents.retrieve(pid);
        if (pi.status === "requires_capture") { await stripe.paymentIntents.capture(pid); return "captured"; }
        return pi.status; // succeeded / canceled / expired
      } catch (e) { console.error("[finalize] settle:", pid, String((e as Error)?.message ?? e)); return "capture_error"; }
    }
    // A delivery may only close if the money is actually in hand: the escrow was
    // captured, the charge already succeeded (PAYG), org credit covered it, or the
    // org is billed by invoice. Anything else (expired/canceled hold, no PI,
    // capture error) is NOT collected — block the delivery.
    const isPaid = (settled: string) =>
      settled === "captured" || settled === "succeeded" || settled === "credit" || parcel.billing_mode === "invoice";

    // Return handled outcomes as HTTP 200 with {ok:false,error} so the app shows a
    // friendly message — a non-2xx surfaces to the driver as "Edge Function error".
    if (action === "deliver") {
      if (!isDriver && !isAdmin) return json({ ok: false, error: "not_assigned" });
      if (String(code).trim() !== String(parcel.delivery_code ?? "").trim()) return json({ ok: false, error: "bad_code" });
      const settled = await settle();
      // GUARD: never mark delivered unless the payment is actually captured/covered.
      if (!isPaid(settled)) return json({ ok: false, error: "payment_not_captured", settled });
      await admin.from("kolis_parcels").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", parcel.id);
      return json({ ok: true, settled });
    } else if (action === "capture") {
      if (!isAdmin) return json({ ok: false, error: "forbidden" });
      const settled = await settle();
      // Same guard for the admin path; an admin can override with force:true when
      // the payment is genuinely settled through another channel.
      if (!isPaid(settled) && !force) return json({ ok: false, error: "payment_not_captured", settled });
      await admin.from("kolis_parcels").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", parcel.id);
      return json({ ok: true, settled });
    } else if (action === "cancel") {
      if (!isAdmin && parcel.sender_id !== user.id) return json({ ok: false, error: "forbidden" });
      if (pid && stripe) { try { await stripe.paymentIntents.cancel(pid); } catch { /* already released */ } }
      await admin.from("kolis_parcels").update({ status: "cancelled" }).eq("id", parcel.id);
      return json({ ok: true });
    }
    return json({ ok: false, error: "bad action" }, 400);
  } catch (e) {
    console.error("[finalize] 500:", String((e as Error)?.message ?? e));
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
