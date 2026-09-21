// loadq-stripe-pause-drivers — ONE-OFF (2026-09-21). Delete after it has run.
//
// Every LoadQ driver was given access through 2026-12-21 via drivers.waiver_until. Drivers
// billed through Stripe would still be charged meanwhile, so this pauses payment collection
// on their subscriptions until the free period ends:
//   pause_collection = { behavior: "void", resumes_at: 2026-12-22 00:00 ET }
// "void" means invoices drafted during the pause are voided, not collected later.
//
// Scope is strictly subscriptions stored on public.drivers.stripe_subscription_id — the Stripe
// account is shared with Kolis, so nothing is listed from Stripe itself.
//
//   POST { "action": "preview" }  (default) → what would change, touches nothing
//   POST { "action": "apply" }              → pauses; idempotent, already-paused ones skipped
//
// The customer.subscription.updated event this triggers is harmless: stripe-webhook refreshes
// status/subscription_ends_at, and access rides on waiver_until, which it never writes.
//
// Only the service role may call it (Authorization: Bearer <service_role key> — the dashboard's
// function "Test" panel sends that). It also refuses to run after CUTOFF, so a forgotten copy
// cannot pause anything later.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESUMES_AT = Math.floor(Date.UTC(2026, 11, 22, 5, 0, 0) / 1000); // 2026-12-22 00:00 EST
const CUTOFF = Date.UTC(2026, 9, 1, 4, 0, 0);                           // 2026-10-01 00:00 EDT

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${SERVICE}`) return json({ error: "unauthorized" }, 401);
  if (Date.now() > CUTOFF) return json({ error: "expired one-off" }, 410);

  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const apply = b.action === "apply";

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const { data: drivers, error } = await admin
    .from("drivers")
    .select("id, full_name, stripe_subscription_id")
    .not("stripe_subscription_id", "is", null);
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, unknown>[] = [];
  for (const d of drivers ?? []) {
    const r: Record<string, unknown> = { driver: d.full_name, sub: d.stripe_subscription_id };
    try {
      const sub = await stripe.subscriptions.retrieve(d.stripe_subscription_id);
      r.status = sub.status;
      if (["canceled", "incomplete_expired"].includes(sub.status)) {
        r.result = "skip: not billing";
      } else if (sub.pause_collection?.resumes_at === RESUMES_AT) {
        r.result = "skip: already paused";
      } else if (!apply) {
        r.result = "would pause";
      } else {
        await stripe.subscriptions.update(sub.id, {
          pause_collection: { behavior: "void", resumes_at: RESUMES_AT },
        });
        r.result = "paused";
      }
    } catch (e) {
      r.result = `error: ${(e as Error).message}`;
    }
    results.push(r);
  }

  const tally: Record<string, number> = {};
  for (const r of results) {
    const k = String(r.result).split(":")[0];
    tally[k] = (tally[k] ?? 0) + 1;
  }
  return json({ mode: apply ? "apply" : "preview", resumes_at: new Date(RESUMES_AT * 1000).toISOString(), tally, results });
});
