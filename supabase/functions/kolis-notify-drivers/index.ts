// Proposes a paid/ready Kolis parcel to drivers (push). Targets VERIFIED Kolis
// members heading to the destination: Hub = any queued driver to that region;
// Door = drivers waiting in queue position >= 2 (slack to detour). Off-queue
// members still see it in-app via kolis_available_parcels. Called after the
// parcel is dropped+paid (hub) or paid (door).
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
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { parcel_id } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: parcel } = await admin.from("kolis_parcels")
      .select("id, sender_id, to_city, to_region, dropoff_type, status, driver_payout_cents")
      .eq("id", parcel_id).single();
    if (!parcel || parcel.sender_id !== user.id) return json({ error: "not found" }, 404);

    const ready = (parcel.dropoff_type === "hub" && parcel.status === "received_at_hub")
               || (parcel.dropoff_type === "door" && parcel.status === "requested");
    if (!ready) return json({ ok: true, skipped: true });

    // Queued drivers heading to the destination (door requires waiting position >= 2).
    const { data: queued } = await admin.from("queue_entries")
      .select("driver_id, position").eq("destination_region", parcel.to_region).is("end_reason", null);
    let driverIds = [...new Set((queued ?? [])
      .filter((r: { position: number | null }) => parcel.dropoff_type === "hub" || (r.position ?? 1) >= 2)
      .map((r: { driver_id: string }) => r.driver_id).filter(Boolean))];
    if (driverIds.length === 0) return json({ ok: true, notified: 0 });

    // Only verified Kolis members (courier/both).
    const { data: members } = await admin.from("kolis_profiles")
      .select("id").in("id", driverIds).eq("identity_verified", true).in("role", ["courier", "both"]);
    const memberIds = (members ?? []).map((m: { id: string }) => m.id);
    if (memberIds.length === 0) return json({ ok: true, notified: 0 });

    const { data: drivers } = await admin.from("drivers").select("push_token").in("id", memberIds);
    const payout = Math.round((parcel.driver_payout_cents ?? 0) / 100);
    const where = parcel.dropoff_type === "hub" ? "at the hub" : "for pickup on your route";
    const messages = (drivers ?? [])
      .filter((d: { push_token: string | null }) => !!d.push_token)
      .map((d: { push_token: string }) => ({
        to: d.push_token, sound: "default",
        title: `Kolis · parcel to ${parcel.to_city}`,
        body: `+C$${payout} — ${where}. Tap to accept (LoadQ or Kolis).`,
        data: { type: "kolis_parcel", parcel_id: parcel.id },
        channelId: "default", priority: "high",
      }));
    if (messages.length > 0) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
    }
    return json({ ok: true, notified: messages.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
