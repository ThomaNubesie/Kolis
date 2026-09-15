// loadq-stripe-webhook-setup — creates the Stripe webhook endpoint for seat payments, and
// files its signing secret in Vault.
//
// Stripe shows a signing secret ONCE, at creation. The usual route is: create it in the
// dashboard, copy the secret, paste it into an env var. This does the whole thing server-side
// so the secret is never displayed, never pasted, and never lands in a transcript — it goes
// straight from Stripe's response into vault.secrets, where loadq-seat-stripe-webhook reads
// it back.
//
// The response deliberately contains NO secret. If you need to see it, read it from Vault.
//
// POST { }             → create (or report) the endpoint
// POST { rotate:true } → delete the existing LoadQ seat endpoint and make a fresh one
// Gated by x-kolis-secret — this creates real infrastructure on a live Stripe account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const GATE = "kolis_notify_9f3a2c7b1e6d4084";
const stripe = new Stripe(KEY, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });

const TARGET = `${URL_}/functions/v1/loadq-seat-stripe-webhook`;
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] =
  ["checkout.session.completed", "payment_intent.succeeded"];
const VAULT_NAME = "loadq_stripe_webhook_secret_seats";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== GATE) return json({ ok: false, error: "forbidden" }, 403);
  if (!KEY) return json({ ok: false, error: "stripe_not_configured" }, 500);
  const db = createClient(URL_, SRK, { auth: { persistSession: false } });

  try {
    const { rotate } = await req.json().catch(() => ({} as any));

    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const mine = existing.data.filter((e) => e.url === TARGET);

    if (mine.length && !rotate) {
      const e = mine[0];
      const have = await db.rpc("loadq_vault_get", { p_name: VAULT_NAME });
      return json({ ok: true, already: true, endpoint_id: e.id, url: e.url,
        status: e.status, events: e.enabled_events,
        secret_in_vault: !!have.data,
        note: have.data ? "Endpoint exists and its secret is on file."
          : "Endpoint exists but its signing secret is NOT in Vault — Stripe only shows it once, so POST {rotate:true} to replace the endpoint and capture a fresh secret." });
    }

    for (const e of mine) await stripe.webhookEndpoints.del(e.id);

    const created = await stripe.webhookEndpoints.create({
      url: TARGET,
      enabled_events: EVENTS,
      description: "LoadQ — seat payments (settles loadq_seats via loadq_seat_card_record)",
    });

    // The one moment the secret exists in the open. Straight into Vault, and not returned.
    if (!created.secret) {
      return json({ ok: false, error: "no_secret_returned", endpoint_id: created.id,
        detail: "Stripe created the endpoint but returned no signing secret; delete it and retry." }, 500);
    }
    const { error } = await db.rpc("loadq_vault_put", { p_name: VAULT_NAME, p_value: created.secret });
    if (error) {
      return json({ ok: false, error: "vault_write_failed", detail: error.message,
        endpoint_id: created.id,
        warning: "The endpoint exists but its secret was not stored. Rotate to try again." }, 500);
    }

    return json({ ok: true, created: true, endpoint_id: created.id, url: created.url,
      status: created.status, events: created.enabled_events,
      livemode: created.livemode, secret_stored_as: VAULT_NAME,
      note: "Signing secret written to Vault. It is not shown here by design." });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
