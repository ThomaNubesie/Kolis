// Reconciles pending card (PAYG) parcels against Stripe every minute.
//  - PI authorized (requires_capture) or captured (succeeded) -> mark authorized/paid
//    and ACTIVATE the parcel: enqueue the 'created' recipient notification (which the
//    insert trigger deliberately skips for card parcels until payment is secured).
//  - PI canceled, or never authorized after 30 min (abandoned) -> mark failed/canceled
//    and cancel the parcel (releases any hold, drops it from the hub queue).
// Scoped to recent parcels (last 3h) so it never retroactively touches historical rows.
// Guarded by x-kolis-secret; invoked by the kolis-payment-sync cron.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ABANDON_MIN = 30;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "forbidden" }, 403);
  const admin = createClient(SUPABASE_URL, SERVICE);
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data: rows, error } = await admin.from("kolis_parcels")
    .select("id, code, stripe_payment_intent_id, created_at, recipient_email, recipient_phone, status, payment_method")
    .eq("billing_mode", "card").eq("payment_status", "pending")
    .gt("created_at", cutoff).limit(100);
  if (error) return json({ error: error.message }, 500);

  let activated = 0, cancelled = 0, checked = 0;
  const cancel = async (id: string) => { await admin.from("kolis_parcels").update({ status: "cancelled" }).eq("id", id); };
  const activate = async (id: string, email: string | null, phone: string | null) => {
    if (email || phone) await admin.from("kolis_notifications")
      .upsert({ parcel_id: id, kind: "created", state: "pending", attempts: 0, last_error: null }, { onConflict: "parcel_id,kind" });
  };

  for (const p of rows ?? []) {
    // Only Stripe/card payments reconcile here. Interac/cash (any non-card payment_method)
    // are settled manually (kolis_admin_mark_paid) and must never be auto-failed/cancelled.
    if (p.payment_method && p.payment_method !== "card") continue;
    checked++;
    const ageMin = (Date.now() - new Date(p.created_at as string).getTime()) / 60000;
    if (!p.stripe_payment_intent_id) { if (ageMin > ABANDON_MIN) { await admin.from("kolis_parcels").update({ payment_status: "failed" }).eq("id", p.id); await cancel(p.id as string); cancelled++; } continue; }
    let pi: Stripe.PaymentIntent;
    try { pi = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id as string); } catch { continue; }
    if (pi.status === "requires_capture" || pi.status === "succeeded") {
      const paid = pi.status === "succeeded";
      await admin.from("kolis_parcels").update({ payment_status: paid ? "paid" : "authorized", authorized_at: new Date().toISOString(), ...(paid ? { paid_at: new Date().toISOString() } : {}) }).eq("id", p.id);
      await activate(p.id as string, p.recipient_email as string | null, p.recipient_phone as string | null);
      activated++;
    } else if (pi.status === "canceled") {
      await admin.from("kolis_parcels").update({ payment_status: "canceled" }).eq("id", p.id);
      if (p.status !== "delivered") { await cancel(p.id as string); cancelled++; }
    } else if (ageMin > ABANDON_MIN) {
      await admin.from("kolis_parcels").update({ payment_status: "failed" }).eq("id", p.id);
      await cancel(p.id as string); cancelled++;
    }
  }
  return json({ ok: true, checked, activated, cancelled });
});
