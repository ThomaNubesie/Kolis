// kolis-plans: Kolis Business subscription plans (Stripe).
//   POST {action:"ensure"}                       → staff: create/sync Stripe products+prices, store price ids
//   POST {action:"checkout", org_id, plan}       → member: Stripe Checkout (subscription) → {url}
//   POST {action:"portal", org_id}               → member: Stripe Billing Portal → {url}
// TEST-mode safe like the rest of Kolis billing (STRIPE_TEST_SECRET_KEY until go-live).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const SITE = Deno.env.get("KOLIS_BUSINESS_URL") || "https://business.kolis.ca";

// Plan catalogue — the source of truth for price + commission.
export const PLANS: Record<string, { name: string; price_cad: number; fee: number; lookup: string }> = {
  business: { name: "Kolis Business", price_cad: 79, fee: 0.15, lookup: "kolis_business_monthly" },
  pro: { name: "Kolis Pro", price_cad: 199, fee: 0.12, lookup: "kolis_pro_monthly" },
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Find-or-create the Stripe monthly price for a plan (idempotent via lookup_key),
// persist its id. Used by both `ensure` and lazily by `checkout`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePrice(admin: any, planKey: string): Promise<string> {
  const p = PLANS[planKey];
  const found = await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 });
  let priceId = found.data[0]?.id;
  if (!priceId) {
    const product = await stripe.products.create({ name: p.name, metadata: { plan: planKey } });
    const price = await stripe.prices.create({ product: product.id, currency: "cad", unit_amount: p.price_cad * 100, recurring: { interval: "month" }, lookup_key: p.lookup, metadata: { plan: planKey } });
    priceId = price.id;
  }
  await admin.from("kolis_plan_prices").upsert({ plan: planKey, stripe_price_id: priceId });
  return priceId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!key) return json({ error: "stripe_not_configured" }, 500);
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE);
    const b = await req.json().catch(() => ({} as Record<string, string>));

    // ── ensure Stripe products + monthly prices (idempotent via lookup_key) ──
    if (b.action === "ensure") {
      const { data: staff } = await userClient.rpc("kolis_is_staff");
      if (!staff) return json({ error: "forbidden" }, 403);
      const out: Record<string, string> = {};
      for (const planKey of Object.keys(PLANS)) out[planKey] = await ensurePrice(admin, planKey);
      return json({ ok: true, prices: out });
    }

    // membership guard for org actions
    const orgId = b.org_id;
    if (!orgId) return json({ error: "org_id required" }, 400);
    const { data: mem } = await admin.from("kolis_org_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (!mem) return json({ error: "forbidden" }, 403);

    // ensure the org has a Stripe customer
    const { data: org } = await admin.from("kolis_orgs").select("id, name, billing_email, stripe_customer_id").eq("id", orgId).single();
    let customerId = org?.stripe_customer_id as string | null;
    if (!customerId) {
      const c = await stripe.customers.create({ name: org?.name || "Kolis merchant", email: org?.billing_email || user.email || undefined, metadata: { org_id: orgId } });
      customerId = c.id;
      await admin.from("kolis_orgs").update({ stripe_customer_id: customerId }).eq("id", orgId);
    }

    // ── checkout: start a subscription for the chosen plan ──
    if (b.action === "checkout") {
      const plan = b.plan;
      if (!plan || !PLANS[plan]) return json({ error: "bad_plan" }, 400);
      const { data: pr } = await admin.from("kolis_plan_prices").select("stripe_price_id").eq("plan", plan).maybeSingle();
      const priceId = pr?.stripe_price_id || (await ensurePrice(admin, plan)); // self-heal if not created yet
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId!,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${SITE}/shipper/plans?sub=ok`,
        cancel_url: `${SITE}/shipper/plans?sub=cancel`,
        metadata: { org_id: orgId, plan },
        subscription_data: { metadata: { org_id: orgId, plan } },
      });
      return json({ ok: true, url: session.url });
    }

    // ── portal: manage / cancel the subscription ──
    if (b.action === "portal") {
      const session = await stripe.billingPortal.sessions.create({ customer: customerId!, return_url: `${SITE}/shipper/plans` });
      return json({ ok: true, url: session.url });
    }

    return json({ error: "bad_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
