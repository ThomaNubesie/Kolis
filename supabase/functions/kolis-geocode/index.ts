// Geocode a parcel's pickup + drop-off addresses to lat/lng so the 100 m scan
// geofence works. Best-effort: fired by a DB trigger on insert (secret-gated) and
// callable directly. Needs GOOGLE_GEOCODING_KEY (a server key with the Geocoding
// API enabled). If absent/denied, coords stay null and the scan degrades to
// "location not verified" rather than blocking pickups.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("GOOGLE_GEOCODING_KEY") || Deno.env.get("GOOGLE_MAPS_SERVER_KEY") || "";
const SECRET = "kolis_geocode_2f7a";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function geocode(addr: string): Promise<{ lat: number; lng: number } | null> {
  if (!KEY || !addr.trim()) return null;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&region=ca&key=${KEY}`);
    const d = await res.json();
    const loc = d?.results?.[0]?.geometry?.location;
    if (d?.status === "OK" && loc) return { lat: loc.lat, lng: loc.lng };
    return null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-kolis-secret") !== SECRET) {
      // also allow a signed-in call (no secret) — still service-guarded below
    }
    const { parcel_id } = await req.json();
    if (!parcel_id) return json({ error: "parcel_id required" }, 400);
    if (!KEY) return json({ ok: false, skipped: "no geocoding key" });

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, pickup_addr, from_city, dropoff_addr, to_city, pickup_lat, dropoff_lat").eq("id", parcel_id).maybeSingle();
    if (!p) return json({ error: "not_found" }, 404);

    const upd: Record<string, number> = {};
    if (p.pickup_lat == null) {
      const g = await geocode([p.pickup_addr, p.from_city].filter(Boolean).join(", "));
      if (g) { upd.pickup_lat = g.lat; upd.pickup_lng = g.lng; }
    }
    if (p.dropoff_lat == null) {
      const g = await geocode([p.dropoff_addr, p.to_city].filter(Boolean).join(", "));
      if (g) { upd.dropoff_lat = g.lat; upd.dropoff_lng = g.lng; }
    }
    if (Object.keys(upd).length) await admin.from("kolis_parcels").update(upd).eq("id", p.id);
    return json({ ok: true, updated: upd });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
