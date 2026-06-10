// Admin refund: cancel-&-refund a parcel, or approve-&-refund an insurance
// claim. Card refunds go through Stripe (refund a captured PI, or cancel an
// uncaptured escrow hold); Interac refunds are recorded for manual e-transfer.
// Gated to owner/admin/finance via kolis_admin_role().
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: role } = await userClient.rpc("kolis_admin_role");
    if (!["owner", "admin", "finance"].includes(role)) return json({ error: "forbidden" }, 403);

    const { parcel_id, amount_cents, method = "card", action, claim_id } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, status, price_cents, insurance_premium_cents, stripe_payment_intent_id").eq("id", parcel_id).single();
    if (!p) return json({ error: "not found" }, 404);

    const full = (p.price_cents ?? 0) + (p.insurance_premium_cents ?? 0);
    const amount = Math.min(amount_cents ?? full, full);

    let refunded = 0, released = false;
    if (method === "card" && p.stripe_payment_intent_id) {
      if (p.status === "delivered") {
        await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id, amount });
        refunded = amount;
      } else {
        // Uncaptured escrow hold → cancel to release the full authorization.
        try { await stripe.paymentIntents.cancel(p.stripe_payment_intent_id); released = true; } catch { /* already gone */ }
      }
    }

    if (action === "cancel") {
      await admin.from("kolis_parcels").update({ status: "cancelled" }).eq("id", p.id);
    }
    if (action === "claim" && claim_id) {
      await admin.from("kolis_claims").update({
        status: "approved", refund_cents: amount, refund_method: method,
        resolved_by: user.id, resolved_at: new Date().toISOString(),
      }).eq("id", claim_id);
    }

    return json({ ok: true, refunded_cents: refunded, released, method });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
