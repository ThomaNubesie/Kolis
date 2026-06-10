// Creates a Stripe Identity verification session for Kolis onboarding and
// returns the hosted verification URL (opened in a WebView). Couriers must use a
// driving licence; senders may use licence/passport/ID. Reuses the shared
// Concord Stripe account (STRIPE_SECRET_KEY already on the project).
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { role } = await req.json();
    const allowed = role === "courier" || role === "both"
      ? ["driving_license"]
      : ["driving_license", "passport", "id_card"];

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { user_id: user.id },
      options: { document: { allowed_types: allowed as any, require_matching_selfie: true, require_live_capture: true } },
    });

    const admin = createClient(SUPABASE_URL, SERVICE);
    await admin.from("kolis_profiles").update({ identity_session_id: session.id }).eq("id", user.id);

    return json({ url: (session as any).url, id: session.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
