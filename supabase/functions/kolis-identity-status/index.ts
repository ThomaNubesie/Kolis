// Checks a Kolis Stripe Identity session. On 'verified' it reads the document's
// name (verified_outputs) — the authoritative legal name — marks the profile
// verified and reconciles full_name to the ID. Returns status + name.
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

    const admin = createClient(SUPABASE_URL, SERVICE);
    let { session_id } = await req.json().catch(() => ({ session_id: undefined }));
    if (!session_id) {
      const { data: prof } = await admin.from("kolis_profiles").select("identity_session_id").eq("id", user.id).maybeSingle();
      session_id = prof?.identity_session_id;
    }
    if (!session_id) return json({ status: "requires_input" });

    const session = await stripe.identity.verificationSessions.retrieve(session_id, { expand: ["verified_outputs"] });
    const status = session.status; // requires_input | processing | verified | canceled

    let name: string | null = null;
    if (status === "verified") {
      const vo: any = (session as any).verified_outputs || {};
      const first = vo?.name?.first_name ?? vo?.first_name ?? "";
      const last = vo?.name?.last_name ?? vo?.last_name ?? "";
      name = `${first} ${last}`.trim() || null;
      await admin.from("kolis_profiles").update({
        identity_verified: true,
        verified_name: name,
        full_name: name || undefined, // reconcile account name to the ID
      }).eq("id", user.id);
    }
    return json({ status, name });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e), status: "error" }, 500);
  }
});
