// loadq-seat-stripe-webhook — Stripe says a seat was paid, and only then is it paid.
//
// This is the card counterpart of loadq-interac-inbound. A seat reaches status='paid' from a
// charge Stripe confirmed, recorded in loadq_card_inbound, so loadq_payout_verify can later
// ask "is there really money behind this seat?" and get an answer.
//
// verify_jwt MUST stay false — Stripe does not send a Supabase JWT. The signature IS the
// authentication, and an unsigned request is refused below.
//
// The signing secret comes from VAULT (loadq_stripe_webhook_secret_seats), written there by
// loadq-stripe-webhook-setup at the moment Stripe issued it. Stripe shows it once; routing it
// through Vault means it is never pasted into a dashboard field or a chat. The env vars are
// kept as a fallback for an endpoint created by hand.
//
// Env: STRIPE_SECRET_KEY|STRIPE_TEST_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      optional STRIPE_WEBHOOK_SECRET_SEATS | STRIPE_WEBHOOK_SECRET
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const ENV_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET_SEATS") || Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const VAULT_NAME = "loadq_stripe_webhook_secret_seats";
const stripe = new Stripe(KEY, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

// Cached for the life of the instance: Stripe can deliver bursts, and this must not become a
// database round trip per event.
let cached: string | null = null;
async function signingSecret(): Promise<string> {
  if (ENV_SECRET) return ENV_SECRET;
  if (cached) return cached;
  const { data } = await db.rpc("loadq_vault_get", { p_name: VAULT_NAME });
  cached = (data as string) ?? "";
  return cached;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!KEY) return new Response("stripe not configured", { status: 500 });

  const SECRET = await signingSecret();
  if (!SECRET) return new Response("no webhook secret", { status: 500 });

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, SECRET);
  } catch (e) {
    // Unsigned or mis-signed: someone other than Stripe. Never touch a seat on this.
    return new Response(`bad signature: ${String((e as Error)?.message ?? e)}`, { status: 400 });
  }

  const out: Record<string, unknown> = { type: event.type, id: event.id };

  try {
    let seatId: string | null = null, intent: string | null = null, amount: number | null = null, currency = "cad";

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status !== "paid") return json({ ...out, skipped: s.payment_status });
      seatId = (s.metadata?.seat_id as string) ?? null;
      intent = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
      amount = s.amount_total ?? null;
      currency = s.currency ?? "cad";
      // The session id is the fallback route home: metadata can be dropped by a hand-made
      // payment link, but the seat still remembers which sessions it asked for.
      if (!seatId && s.id) {
        const { data } = await db.from("loadq_seat_sessions").select("seat_id")
          .eq("session_id", s.id).maybeSingle();
        seatId = data?.seat_id ?? null;
      }
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      seatId = (pi.metadata?.seat_id as string) ?? null;
      intent = pi.id;
      amount = pi.amount_received ?? pi.amount ?? null;
      currency = pi.currency ?? "cad";
    } else {
      return json({ ...out, ignored: true });
    }

    if (!intent || amount == null) return json({ ...out, error: "incomplete event" }, 400);

    const { data, error } = await db.rpc("loadq_seat_card_record", {
      p_seat: seatId, p_intent: intent, p_amount: amount,
      p_currency: currency, p_event: event.id, p_raw: event.data.object as unknown as Record<string, unknown>,
    });
    if (error) return json({ ...out, error: error.message }, 500);

    // 200 even when the seat could not be matched: Stripe retries non-2xx, and retrying will
    // not conjure a seat. The row is already filed as 'orphan' or 'mismatch' for a human.
    return json({ ...out, result: data });
  } catch (e) {
    return json({ ...out, error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
}
