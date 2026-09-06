// quorly-plans — Quorly subscriptions on Stripe. Mirrors kolis-plans so billing
// works one way across the company.
//
//   POST {action:"ensure"}                    → create/sync Stripe products + prices
//   POST {action:"checkout", org_id, plan}    → Stripe Checkout (subscription) → {url}
//   POST {action:"portal", org_id}            → Stripe Billing Portal → {url}
//   POST {action:"state", org_id}             → what this org is on, and its usage
//   x-kolis-secret                            → server-to-server (cron, price sync)
//
// THE PRICING, EXPRESSED AS STRIPE OBJECTS
//
//   Starter   $49  flat, no texts
//   Board     $129 flat + metered texts: first 800 free, then $0.06
//   Business  GRADUATED on member count — first 250 members are a $299 flat tier,
//             each member beyond is $1 — plus metered texts, first 2,500 free.
//
// Graduated licensed pricing is what makes "$299 up to 250, then $1 each" a single
// subscription item rather than an invoicing chore: the quantity is the member count
// and Stripe does the arithmetic. A nightly job keeps that quantity honest.
//
// The included text allowance is the FIRST TIER AT ZERO on a metered graduated price,
// so an org that never exceeds it is never billed for texts and never sees a line
// item it has to think about.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Live unless a test key is explicitly present — chosen deliberately: Quorly bills
// through the existing Kolis/Concord Stripe account, in live mode.
const key = Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const SITE = "https://quorly.ca";
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";

type Plan = {
  name: string;
  lookup: string;
  flat_cad?: number;                 // Starter, Board
  graduated?: { included: number; base_cad: number; per_extra_cad: number };  // Business
  texts?: { included: number; per_text_cad: number; lookup: string };
};

export const PLANS: Record<string, Plan> = {
  starter: {
    name: "Quorly Starter", lookup: "quorly_starter_monthly_v1", flat_cad: 49,
  },
  board: {
    name: "Quorly Board", lookup: "quorly_board_monthly_v1", flat_cad: 129,
    texts: { included: 800, per_text_cad: 0.06, lookup: "quorly_board_texts_v1" },
  },
  business: {
    name: "Quorly Business", lookup: "quorly_business_monthly_v1",
    graduated: { included: 250, base_cad: 299, per_extra_cad: 1 },
    texts: { included: 2500, per_text_cad: 0.06, lookup: "quorly_business_texts_v1" },
  },
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const cents = (cad: number) => Math.round(cad * 100);

// Found-or-created by lookup_key, so running this twice never makes a second price
// and never changes what an existing subscriber is paying.
async function ensurePrice(admin: any, planKey: string, kind: "base" | "texts"): Promise<string> {
  const p = PLANS[planKey];
  const lookup = kind === "base" ? p.lookup : p.texts!.lookup;
  const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  let priceId = found.data[0]?.id;

  if (!priceId) {
    const prod = await stripe.products.create({
      name: kind === "base" ? p.name : `${p.name} — texts`,
      metadata: { plan: planKey, kind },
    });
    const common = { product: prod.id, currency: "cad", lookup_key: lookup, metadata: { plan: planKey, kind } };

    let price;
    if (kind === "texts") {
      // Metered, graduated: the allowance is simply the first tier priced at zero.
      price = await stripe.prices.create({
        ...common,
        recurring: { interval: "month", usage_type: "metered", aggregate_usage: "sum" },
        billing_scheme: "tiered", tiers_mode: "graduated",
        tiers: [
          { up_to: p.texts!.included, unit_amount: 0 },
          { up_to: "inf", unit_amount_decimal: String(p.texts!.per_text_cad * 100) },
        ],
      });
    } else if (p.graduated) {
      // quantity = member count. flat_amount on the first tier gives "$299 covers
      // the first 250"; unit_amount on the second charges each member beyond.
      price = await stripe.prices.create({
        ...common,
        recurring: { interval: "month" },
        billing_scheme: "tiered", tiers_mode: "graduated",
        tiers: [
          { up_to: p.graduated.included, flat_amount: cents(p.graduated.base_cad), unit_amount: 0 },
          { up_to: "inf", unit_amount: cents(p.graduated.per_extra_cad) },
        ],
      });
    } else {
      price = await stripe.prices.create({ ...common, recurring: { interval: "month" }, unit_amount: cents(p.flat_cad!) });
    }
    priceId = price.id;
  }
  await admin.from("quorly_plan_prices").upsert({ plan: planKey, kind, stripe_price_id: priceId, updated_at: new Date().toISOString() });
  return priceId;
}

async function ensureAll(admin: any) {
  const out: Record<string, string> = {};
  for (const k of Object.keys(PLANS)) {
    out[`${k}.base`] = await ensurePrice(admin, k, "base");
    if (PLANS[k].texts) out[`${k}.texts`] = await ensurePrice(admin, k, "texts");
  }
  return out;
}

// Members counted the way the product counts them: active and not suspended.
async function memberCount(admin: any, orgId: string): Promise<number> {
  const { count } = await admin.from("cf_members")
    .select("id", { count: "exact", head: true })
    .eq("form_id", orgId).eq("status", "active").eq("suspended", false);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!key) return json({ error: "stripe_not_configured" }, 503);
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({} as any));

    // Server-to-server: materialise prices without a browser session.
    if (req.headers.get("x-kolis-secret") === CF_SECRET) {
      if (b.action === "ensure") return json({ ok: true, prices: await ensureAll(admin) });
      if (b.action === "state") return json({ ok: true, orgs: (await admin.rpc("cf_billing_snapshot", { p_org: b.org_id ?? null })).data });
      return json({ error: "bad_action" }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const orgId = b.org_id as string | undefined;
    if (!orgId) return json({ error: "org_id_required" }, 400);

    // Only an admin of the organisation may see or change its billing.
    const { data: org } = await admin.from("cf_forms")
      .select("id, name, admin_id, plan, stripe_customer_id, stripe_subscription_id, plan_status")
      .eq("id", orgId).maybeSingle();
    if (!org) return json({ error: "org_not_found" }, 404);
    const { data: adminRow } = await admin.from("cf_members").select("id")
      .eq("form_id", orgId).eq("user_id", user.id).eq("role", "admin").eq("status", "active").maybeSingle();
    if (!adminRow && org.admin_id !== user.id) return json({ error: "not_admin" }, 403);

    if (b.action === "state") {
      const { data } = await admin.rpc("cf_billing_snapshot", { p_org: orgId });
      return json({ ok: true, state: (data as any[])?.[0] ?? null, plans: PLANS });
    }

    // Every billing action needs a Stripe customer for the organisation.
    let customerId = org.stripe_customer_id as string | null;
    if (!customerId) {
      const c = await stripe.customers.create({
        name: org.name || "Quorly organization",
        email: user.email || undefined,
        metadata: { org_id: orgId, product: "quorly" },
      });
      customerId = c.id;
      await admin.from("cf_forms").update({ stripe_customer_id: customerId }).eq("id", orgId);
    }

    if (b.action === "checkout") {
      const plan = String(b.plan || "");
      if (!PLANS[plan]) return json({ error: "bad_plan" }, 400);

      const base = (await admin.from("quorly_plan_prices").select("stripe_price_id").eq("plan", plan).eq("kind", "base").maybeSingle()).data?.stripe_price_id
                || await ensurePrice(admin, plan, "base");

      const items: any[] = [{ price: base }];
      // Graduated-on-members needs the quantity; a flat price is always quantity 1.
      items[0].quantity = PLANS[plan].graduated ? Math.max(1, await memberCount(admin, orgId)) : 1;
      if (PLANS[plan].texts) {
        const t = (await admin.from("quorly_plan_prices").select("stripe_price_id").eq("plan", plan).eq("kind", "texts").maybeSingle()).data?.stripe_price_id
               || await ensurePrice(admin, plan, "texts");
        items.push({ price: t });                    // metered: no quantity at checkout
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId!,
        line_items: items,
        // The 7-day trial advertised on the pricing page, honoured by Stripe rather
        // than tracked by hand. If this number and the page ever disagree, Stripe wins
        // and the page is the bug.
        subscription_data: { trial_period_days: 7, metadata: { org_id: orgId, plan, product: "quorly" } },
        success_url: `${SITE}/organizations?billing=ok`,
        cancel_url: `${SITE}/pricing?billing=cancel`,
        metadata: { org_id: orgId, plan, product: "quorly" },
      });
      return json({ ok: true, url: session.url });
    }

    if (b.action === "portal") {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId!, return_url: `${SITE}/organizations`,
      });
      return json({ ok: true, url: session.url });
    }

    return json({ error: "bad_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
