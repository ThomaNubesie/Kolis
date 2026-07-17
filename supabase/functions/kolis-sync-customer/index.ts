// Sync an org's Stripe customer with its Kolis record (name, email, phone,
// description, address/country, metadata). Secret-gated ops/admin use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

function resolveStripe(): Stripe | null {
  const key = (Deno.env.get("STRIPE_TEST_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key) return null;
  if (!key.startsWith("sk_test_") && !liveOk) return null;
  return new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = "kolis_synccust_2f7a";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if ((req.headers.get("x-secret") || "") !== SECRET) return json({ error: "forbidden" }, 403);
    const { org_id } = await req.json();
    if (!org_id) return json({ error: "org_id required" }, 400);
    const stripe = resolveStripe();
    if (!stripe) return json({ error: "billing_disabled" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: org } = await admin.from("kolis_orgs").select("id,name,billing_email,phone,address,city,postal,country,stripe_customer_id").eq("id", org_id).single();
    if (!org) return json({ error: "not found" }, 404);
    if (!org.stripe_customer_id) return json({ error: "no_stripe_customer" }, 404);

    const fields: Record<string, unknown> = {
      name: org.name,
      email: org.billing_email ?? undefined,
      phone: org.phone ?? undefined,
      description: `${org.name} · Kolis Business`,
      metadata: { kolis_org_id: org.id, org_name: org.name },
    };
    if (org.address || org.city || org.postal || org.country) {
      fields.address = { line1: org.address ?? undefined, city: org.city ?? undefined, postal_code: org.postal ?? undefined, country: org.country || "CA" };
    }
    const c = await stripe.customers.update(org.stripe_customer_id as string, fields);
    return json({ ok: true, customer: c.id, name: c.name, phone: c.phone, country: c.address?.country, description: c.description });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
