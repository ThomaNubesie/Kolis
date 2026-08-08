// Public parcel tracking by scan_token. GET ?t=<scan_token> -> status + ETA (for the countdown page).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const t = new URL(req.url).searchParams.get("t") || "";
    if (!t) return json({ error: "missing_token" }, 400);
    const { data: p } = await admin.from("kolis_parcels")
      .select("code,status,from_city,to_city,dropoff_addr,dropoff_slot,external_driver_name,arrival_eta,delivered_at")
      .eq("scan_token", t).maybeSingle();
    if (!p) return json({ error: "not_found" }, 404);
    const dest = (p.dropoff_addr || "").split(",")[0].trim() || p.to_city;
    const driver = (p.external_driver_name || "").split(" (")[0].trim() || null;
    return json({
      code: p.code, status: p.status, delivered: p.status === "delivered",
      from_city: p.from_city, to_city: p.to_city, dest,
      driver, window: p.dropoff_slot, arrival_eta: p.arrival_eta,
      delivered_at: p.delivered_at,
    });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
