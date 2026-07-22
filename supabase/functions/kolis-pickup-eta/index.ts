// Auto pickup-ETA: driving minutes from the courier's live coords to the parcel's
// pickup address, via Google Distance Matrix. Returns { ok:false } (never errors
// the caller) when the Maps key is unset or the lookup fails — the app then falls
// back to the courier's tapped ETA. Requires GOOGLE_MAPS_SERVER_KEY (Distance
// Matrix API enabled) to be active.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { parcel_id, lat, lng } = await req.json();
    if (!parcel_id || typeof lat !== "number" || typeof lng !== "number") return json({ ok: false, reason: "bad_input" });
    if (!MAPS_KEY) return json({ ok: false, reason: "no_maps_key" });

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: p } = await admin.from("kolis_parcels")
      .select("pickup_addr, from_city").eq("id", parcel_id).maybeSingle();
    const dest = (p?.pickup_addr || p?.from_city || "").trim();
    if (!dest) return json({ ok: false, reason: "no_pickup_addr" });

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${lat},${lng}`
      + `&destinations=${encodeURIComponent(dest)}`
      + `&mode=driving&departure_time=now&key=${MAPS_KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    const el = j?.rows?.[0]?.elements?.[0];
    if (el?.status !== "OK") return json({ ok: false, reason: "no_route", detail: el?.status ?? j?.status });

    // Prefer duration_in_traffic when available.
    const secs = (el.duration_in_traffic?.value ?? el.duration?.value) as number;
    const eta = Math.max(1, Math.round(secs / 60));
    return json({ ok: true, eta_minutes: eta, distance_text: el.distance?.text ?? null });
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message ?? e) });
  }
});
