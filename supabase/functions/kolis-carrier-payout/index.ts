// Pays a carrier fleet its statement net (one consolidated Interac e-Transfer to
// the fleet's payout_email), then marks the statement + its parcels paid.
// Admin-only. Mirrors kolis-payout. If the Interac provider isn't configured it
// returns provider_not_configured so ops can send manually and mark paid.
//
// Env: KOLIS_PAYOUT_URL, KOLIS_PAYOUT_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYOUT_URL = Deno.env.get("KOLIS_PAYOUT_URL") ?? "";
const PAYOUT_KEY = Deno.env.get("KOLIS_PAYOUT_KEY") ?? "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
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

    const { statement_id } = await req.json();
    if (!statement_id) return json({ error: "statement_id required" }, 400);

    const { data: st } = await admin.from("kolis_payout_statements")
      .select("id, org_id, net_cents, status").eq("id", statement_id).single();
    if (!st) return json({ error: "not found" }, 404);
    if (st.status !== "pending") return json({ error: "already_" + st.status }, 400);
    if (!st.net_cents) return json({ ok: true, amount: 0 });

    const { data: org } = await admin.from("kolis_orgs").select("name, payout_email").eq("id", st.org_id).single();
    if (!org?.payout_email) return json({ error: "no_payout_email" }, 400);

    if (!PAYOUT_URL || !PAYOUT_KEY) return json({ error: "provider_not_configured", net: st.net_cents }, 400);

    const res = await fetch(PAYOUT_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${PAYOUT_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: org.payout_email, amount: st.net_cents / 100, currency: "CAD", reference: `Kolis fleet payout ${org.name} ${statement_id}` }),
    });
    if (!res.ok) return json({ error: "provider_error", detail: await res.text() }, 502);

    await admin.rpc("kolis_mark_carrier_statement_paid", { p_statement: statement_id, p_ref: `interac:${Date.now()}` });
    return json({ ok: true, amount: st.net_cents / 100, auto: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
