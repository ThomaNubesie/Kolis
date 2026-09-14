// loadq-seat-pay — a Stripe payment link for one seat.
//
// There is no card reader at the pickup point, so the passenger pays on their own phone:
// the tablet asks for a link, shows it as a QR (or texts it), and the webhook marks the seat
// paid when Stripe confirms. Nobody on the sheet ever types "paid" for a card again.
//
// Permission is checked by the DATABASE, through the caller's own JWT: loadq_seat_set_session
// refuses unless loadq_seat_may_manage passes. This function never decides who may collect.
//
// Env: STRIPE_SECRET_KEY (or STRIPE_TEST_SECRET_KEY), SUPABASE_URL, SUPABASE_ANON_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripe = new Stripe(KEY, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!KEY) return json({ ok: false, error: "stripe_not_configured" }, 500);
  try {
    const { seat_id } = await req.json().catch(() => ({} as any));
    if (!seat_id) return json({ ok: false, error: "seat_id manquant" }, 400);

    const jwt = req.headers.get("Authorization") ?? "";
    if (!jwt) return json({ ok: false, error: "forbidden" }, 401);
    const db = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: jwt } } });

    // First call does double duty: it is the permission check AND it hands back the fare,
    // so the amount charged is the seat's own price and never something a client sent us.
    const { data: claim, error: ce } = await db.rpc("loadq_seat_set_session",
      { p_seat: seat_id, p_session: "pending" });
    if (ce) return json({ ok: false, error: ce.message }, 500);
    if (!claim?.ok) return json({ ok: false, error: claim?.error ?? "refusé" }, 403);

    const fare = Number(claim.fare_cents ?? 0);
    if (!fare) return json({ ok: false, error: "no_fare_for_route" }, 400);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: fare,
          product_data: {
            name: "LoadQ — place / seat",
            description: `Réf. ${claim.reference}`,
          },
        },
      }],
      // The webhook reads these. seat_id is the one that matters; the rest is for a human
      // reading the Stripe dashboard at 6am wondering what this charge was.
      metadata: { seat_id, reference: String(claim.reference ?? "") },
      payment_intent_data: { metadata: { seat_id, reference: String(claim.reference ?? "") } },
      success_url: "https://loadq.ca/?place=payee",
      cancel_url: "https://loadq.ca/?place=annulee",
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    const { data: set } = await db.rpc("loadq_seat_set_session", { p_seat: seat_id, p_session: session.id });
    if (!set?.ok) return json({ ok: false, error: set?.error ?? "session non enregistrée" }, 500);

    return json({ ok: true, url: session.url, session_id: session.id,
                  fare_cents: fare, reference: claim.reference, expires_in_minutes: 30 });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
