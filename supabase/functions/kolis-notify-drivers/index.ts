// Notifies LoadQ drivers queued at a parcel's zone + heading to its destination
// that a Kolis parcel is available — so they don't have to remember to check.
// Called by the sender app after the parcel is paid/available.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { parcel_id } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: parcel } = await admin
      .from("kolis_parcels")
      .select("id, sender_id, to_city, pickup_zone, to_region, dropoff_type, status")
      .eq("id", parcel_id)
      .single();
    if (!parcel || parcel.sender_id !== user.id) return json({ error: "not found" }, 404);
    if (parcel.dropoff_type !== "zone" || parcel.status !== "requested") return json({ ok: true, skipped: true });

    const { data: zone } = await admin.from("zones").select("name").eq("id", parcel.pickup_zone).maybeSingle();
    const zoneName = zone?.name ?? "your zone";

    const { data: queued } = await admin
      .from("queue_entries").select("driver_id")
      .eq("zone_id", parcel.pickup_zone).eq("destination_region", parcel.to_region);
    const driverIds = [...new Set((queued ?? []).map((q: { driver_id: string }) => q.driver_id).filter(Boolean))];
    if (driverIds.length === 0) return json({ ok: true, notified: 0 });

    const { data: drivers } = await admin.from("drivers").select("push_token").in("id", driverIds);
    const messages = (drivers ?? [])
      .filter((d: { push_token: string | null }) => !!d.push_token)
      .map((d: { push_token: string }) => ({
        to: d.push_token,
        sound: "default",
        title: `Kolis · parcel to ${parcel.to_city}`,
        body: `Ready at ${zoneName} — tap to accept and earn on your trip.`,
        data: { type: "kolis_parcel", parcel_id: parcel.id },
        channelId: "default",
        priority: "high",
      }));

    if (messages.length > 0) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
    }
    return json({ ok: true, notified: messages.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
