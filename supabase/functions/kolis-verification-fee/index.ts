// Kolis onboarding fee: identity verification ($3.99) + annual membership ($10),
// in CAD, with multi-country tax. First 100 members per role are FREE.
// Actions: quote (display) | activate_free | create_intent | finalize.
// Identity must already be verified before any charge.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const VERIFY_CENTS = 399;       // C$3.99
const MEMBERSHIP_CENTS = 1000;  // C$10.00
const PROVINCE_TAX: Record<string, number> = { ON:0.13, QC:0.14975, NB:0.15, NL:0.15, NS:0.15, PE:0.15, BC:0.12, MB:0.12, SK:0.11, AB:0.05, NT:0.05, NU:0.05, YT:0.05 };
const COUNTRY_VAT: Record<string, number> = { CA:0.13, US:0, FR:0.20, UK:0.20, MA:0.20, SN:0.18, CI:0.18, RW:0.18, KE:0.16, GH:0.15, CM:0.1925, NG:0.075 };

function taxRate(country: string, province?: string | null): number {
  if (country === "CA") return PROVINCE_TAX[String(province || "ON").toUpperCase()] ?? 0.13;
  return COUNTRY_VAT[String(country || "").toUpperCase()] ?? 0;
}
function amounts(country: string, province?: string | null) {
  const subtotal = VERIFY_CENTS + MEMBERSHIP_CENTS;
  const rate = taxRate(country, province);
  const tax = Math.round(subtotal * rate);
  return { verify: VERIFY_CENTS, membership: MEMBERSHIP_CENTS, subtotal, tax, total: subtotal + tax, rate };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "quote";
    const province = body.province || null;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: prof } = await admin.from("kolis_profiles")
      .select("role, country, identity_verified, verification_fee_paid, is_founding, founding_number")
      .eq("id", user.id).maybeSingle();
    const role = prof?.role || "sender";
    const country = prof?.country || "CA";
    const amt = amounts(country, province);

    if (action === "quote") {
      if (prof?.verification_fee_paid) return json({ already_paid: true, is_founding: prof.is_founding, founding_number: prof.founding_number });
      const { data: fc } = await admin.from("kolis_founding").select("count").eq("role", role).maybeSingle();
      const founding = (fc?.count ?? 0) < 100;
      return json({ founding, country, role, ...amt });
    }

    if (action === "activate_free") {
      if (prof?.verification_fee_paid) return json({ ok: true, founding_number: prof.founding_number });
      const { data: n, error } = await admin.rpc("kolis_claim_founding", { p_role: role });
      if (error) return json({ error: error.message }, 500);
      if (n === null || n === undefined) return json({ founding: false }); // cap reached — must pay
      await admin.from("kolis_profiles").update({ verification_fee_paid: true, is_founding: true, founding_number: n }).eq("id", user.id);
      return json({ ok: true, founding_number: n });
    }

    if (action === "create_intent") {
      if (prof?.verification_fee_paid) return json({ already_paid: true });
      if (!prof?.identity_verified) return json({ error: "Verify your identity first." }, 400);
      const pi = await stripe.paymentIntents.create({
        amount: amt.total,
        currency: "cad",
        automatic_payment_methods: { enabled: true },
        metadata: { user_id: user.id, role, country, kind: "kolis_verification", subtotal: String(amt.subtotal), tax: String(amt.tax) },
      });
      return json({ client_secret: pi.client_secret, payment_intent_id: pi.id, ...amt });
    }

    if (action === "finalize") {
      const pid = body.payment_intent_id;
      if (!pid) return json({ error: "payment_intent_id required" }, 400);
      const pi = await stripe.paymentIntents.retrieve(pid);
      if (!["succeeded", "processing"].includes(pi.status)) return json({ error: "Payment not completed." }, 400);
      await admin.from("kolis_profiles").update({ verification_fee_paid: true }).eq("id", user.id);
      return json({ ok: true, payment_intent_id: pid });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
