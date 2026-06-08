// Automatic Interac e-Transfer payout of a driver's pending balance (batched).
// Admin-only. Sends via a configured Interac payout provider (VoPay / Zūm Rails /
// bank API) set through env, then marks the parcels paid. If the provider isn't
// configured it returns provider_not_configured so the admin can mark paid manually.
//
// Env to enable auto-send (set via `supabase secrets set`):
//   KOLIS_PAYOUT_URL  - provider payout endpoint
//   KOLIS_PAYOUT_KEY  - provider API key / bearer token
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYOUT_URL = Deno.env.get("KOLIS_PAYOUT_URL") ?? "";
const PAYOUT_KEY = Deno.env.get("KOLIS_PAYOUT_KEY") ?? "";

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
    const { data: me } = await admin.from("drivers").select("is_admin").eq("id", user.id).maybeSingle();
    if (!me?.is_admin) return json({ error: "forbidden" }, 403);

    const { driver_id } = await req.json();

    const { data: parcels } = await admin
      .from("kolis_parcels")
      .select("id, driver_payout_cents")
      .eq("driver_id", driver_id).eq("status", "delivered").is("driver_paid_at", null);
    const amountCents = (parcels ?? []).reduce((s: number, p: { driver_payout_cents: number | null }) => s + (p.driver_payout_cents ?? 0), 0);
    if (amountCents === 0) return json({ ok: true, amount: 0 });

    const { data: dp } = await admin.from("kolis_driver_payout").select("interac_email").eq("driver_id", driver_id).maybeSingle();
    if (!dp?.interac_email) return json({ error: "no_interac_email" }, 400);

    if (!PAYOUT_URL || !PAYOUT_KEY) return json({ error: "provider_not_configured" }, 400);

    // Send the Interac e-Transfer via the configured provider. Adjust the payload
    // to your provider's spec (VoPay / Zūm Rails / etc.).
    const res = await fetch(PAYOUT_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${PAYOUT_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: dp.interac_email, amount: amountCents / 100, currency: "CAD", reference: `Kolis payout ${driver_id}` }),
    });
    if (!res.ok) return json({ error: "provider_error", detail: await res.text() }, 502);

    await admin.from("kolis_parcels").update({ driver_paid_at: new Date().toISOString() })
      .eq("driver_id", driver_id).eq("status", "delivered").is("driver_paid_at", null);

    return json({ ok: true, amount: amountCents / 100, auto: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
