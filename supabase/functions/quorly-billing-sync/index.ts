// quorly-billing-sync — keeps what Stripe charges in step with what the product did.
//
// Two jobs, nightly:
//
//   1. MEMBER COUNT → the Business subscription's quantity. Graduated pricing only
//      bills "$1 per member over 250" if the quantity is the member count, and
//      members join and leave without telling Stripe. Without this the price is
//      frozen at whatever it was on the day of checkout.
//
//   2. TEXTS SENT → a metered usage record. cf_message_usage counts what was
//      actually sent; this reports the DELTA since the last run, so a re-run never
//      double-bills. The included allowance is the first tier at $0 in Stripe, so
//      an org under its allowance is reported but never charged.
//
// Idempotent by construction: quantity is set (not incremented), and usage reports
// only the difference between sent and already-reported.
//
// Auth: x-kolis-secret. Deploy verify_jwt=FALSE.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const key = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-kolis-secret") !== CF_SECRET) return json({ error: "forbidden" }, 403);
  if (!key) return json({ error: "stripe_not_configured" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const { dry_run } = await req.json().catch(() => ({} as any));

  const { data: snap } = await admin.rpc("cf_billing_snapshot", { p_org: null });
  const orgs = ((snap as any[]) ?? []).filter((o) => o.stripe_subscription_id);
  const ym = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7);
  const out: any[] = [];

  for (const o of orgs) {
    const row: any = { org: o.name, plan: o.plan, members: o.members, texts: o.texts_this_month };
    try {
      const sub = await stripe.subscriptions.retrieve(o.stripe_subscription_id) as any;
      if (!["active", "trialing", "past_due"].includes(sub.status)) { row.skipped = sub.status; out.push(row); continue; }

      for (const item of sub.items.data as any[]) {
        const metered = item.price?.recurring?.usage_type === "metered";

        if (!metered) {
          // Licensed item. Only a graduated price is quantity-sensitive, but setting
          // it on a flat price is harmless and keeps one code path.
          const want = item.price?.billing_scheme === "tiered" ? Math.max(1, o.members) : 1;
          if (item.quantity !== want) {
            row.quantity = `${item.quantity} → ${want}`;
            if (!dry_run) await stripe.subscriptionItems.update(item.id, { quantity: want, proration_behavior: "none" });
          }
        } else {
          // Report only what has not been reported: sent minus reported.
          const delta = Math.max(0, (o.texts_this_month ?? 0) - (o.texts_reported ?? 0));
          if (delta > 0) {
            row.usage = delta;
            if (!dry_run) {
              await stripe.subscriptionItems.createUsageRecord(item.id, {
                quantity: delta, timestamp: Math.floor(Date.now() / 1000), action: "increment",
              });
              await admin.from("cf_message_usage")
                .update({ reported: (o.texts_reported ?? 0) + delta })
                .eq("org_id", o.org_id).eq("ym", ym);
            }
          }
        }
      }
    } catch (e) {
      row.error = String((e as Error)?.message ?? e).slice(0, 160);
    }
    out.push(row);
  }

  return json({ ok: true, dry_run: !!dry_run, organizations: out.length, detail: out });
});
