// Issues Stripe invoices for closed (draft) Kolis billing periods.
// Triggered by cron (every few minutes) so a Stripe outage never blocks the
// pure-SQL accrual — drafts are simply retried until issued.
//
// SAFETY INTERLOCK: refuses to touch Stripe unless the key is a TEST key
// (sk_test_…) OR KOLIS_BILLING_LIVE=true is explicitly set. The app's existing
// STRIPE_SECRET_KEY is a LIVE key, so until go-live this function safely no-ops
// and leaves invoices in 'draft'. Add STRIPE_TEST_SECRET_KEY to test end-to-end.
//
// Env: STRIPE_TEST_SECRET_KEY (preferred for testing) or STRIPE_SECRET_KEY,
//      KOLIS_BILLING_LIVE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KOLIS_CRON_SECRET
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("KOLIS_CRON_SECRET") ?? "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-cron", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function resolveStripe(): { stripe: Stripe; mode: string } | { skip: string } {
  const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
  const mainKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const key = testKey || mainKey;
  const isTest = key.startsWith("sk_test_");
  const liveOk = Deno.env.get("KOLIS_BILLING_LIVE") === "true";
  if (!key) return { skip: "no Stripe key configured" };
  if (!isTest && !liveOk) return { skip: "live key blocked during test phase (set STRIPE_TEST_SECRET_KEY or KOLIS_BILLING_LIVE=true)" };
  return { stripe: new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() }), mode: isTest ? "test" : "live" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Cron/service gate (optional shared secret).
  if (CRON_SECRET && req.headers.get("x-kolis-cron") !== CRON_SECRET) return json({ error: "forbidden" }, 403);

  const s = resolveStripe();
  const admin = createClient(SUPABASE_URL, SERVICE);
  if ("skip" in s) return json({ ok: true, issued: 0, skipped: s.skip });
  const { stripe, mode } = s;

  const { data: drafts } = await admin.from("kolis_invoices").select("*").eq("status", "draft").limit(50);
  let issued = 0;
  for (const inv of drafts ?? []) {
    try {
      const { data: org } = await admin.from("kolis_orgs").select("*").eq("id", inv.org_id).single();
      if (!org) continue;

      // ensure a Stripe customer
      let customerId = org.stripe_customer_id as string | null;
      if (!customerId) {
        const c = await stripe.customers.create(
          { name: org.name, email: org.billing_email ?? undefined, metadata: { kolis_org_id: org.id } },
          { idempotencyKey: `kolis_cust_${org.id}` });
        customerId = c.id;
        await admin.from("kolis_orgs").update({ stripe_customer_id: customerId }).eq("id", org.id);
      }

      // pending invoice items: one per parcel line + our discount + our tax
      const { data: lines } = await admin.from("kolis_invoice_lines").select("*").eq("invoice_id", inv.id);
      for (const l of lines ?? []) {
        await stripe.invoiceItems.create(
          { customer: customerId, amount: l.amount_cents, currency: "cad", description: l.description ?? "Parcel" },
          { idempotencyKey: `kolis_li_${l.id}` });
      }
      if (inv.discount_cents > 0) await stripe.invoiceItems.create(
        { customer: customerId, amount: -inv.discount_cents, currency: "cad", description: "Volume discount" },
        { idempotencyKey: `kolis_disc_${inv.id}` });
      if (inv.tax_cents > 0) await stripe.invoiceItems.create(
        { customer: customerId, amount: inv.tax_cents, currency: "cad", description: `Tax (${org.province})` },
        { idempotencyKey: `kolis_tax_${inv.id}` });

      const sInv = await stripe.invoices.create(
        { customer: customerId, collection_method: "send_invoice", days_until_due: org.net_terms_days,
          // Recent Stripe API versions do NOT auto-attach pending invoice items;
          // without this the invoice finalizes at $0 (and auto-marks paid).
          pending_invoice_items_behavior: "include",
          metadata: { kolis_invoice_id: inv.id, kolis_org_id: org.id } },
        { idempotencyKey: `kolis_inv_${inv.id}` });
      const finalized = await stripe.invoices.finalizeInvoice(sInv.id);

      // flip to open only if still draft (guards against a concurrent run)
      const { data: upd } = await admin.from("kolis_invoices")
        .update({ status: "open", stripe_invoice_id: finalized.id, hosted_url: finalized.hosted_invoice_url ?? null,
                  due_at: finalized.due_date ? new Date(finalized.due_date * 1000).toISOString() : inv.due_at })
        .eq("id", inv.id).eq("status", "draft").select("id");
      if (upd && upd.length) issued++;
    } catch (e) {
      console.error("[kolis-issue-invoices]", inv.id, String((e as Error)?.message ?? e));
    }
  }
  return json({ ok: true, issued, mode });
});
