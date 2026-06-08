import { supabase } from "./supabase";

// Reads from LoadQ's shared tables (zones + live queue). Kolis only reads these;
// LoadQ owns/manages them.
export type LoadqZone = {
  id: string;
  name: string;
  region: string | null;
  address: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
};

// Sender-facing available driver (from kolis_available_drivers RPC — PII-safe).
export type AvailableDriver = {
  driver_id: string;
  display_name: string;
  avatar_url: string | null;
  trust_score: number | null;
  verified: boolean;
  queue_position: number | null;
  seats_available: number;
  queued_minutes: number;
};

export const LoadqAPI = {
  async zones() {
    const { data, error } = await supabase
      .from("zones")
      .select("id,name,region,address,is_active,latitude,longitude")
      .eq("is_active", true)
      .order("name");
    return { zones: (data ?? []) as LoadqZone[], error: error?.message };
  },

  // Sender-facing available drivers for a route (PII-safe RPC). Pass zoneId for a
  // specific loading zone, or null to list everyone queued for the destination.
  async availableDrivers(destinationRegion: string, zoneId?: string | null): Promise<AvailableDriver[]> {
    const { data } = await supabase.rpc("kolis_available_drivers", {
      p_zone_id: zoneId ?? null,
      p_dest_region: destinationRegion,
    });
    return (data ?? []) as AvailableDriver[];
  },

  // Live count of queued drivers per zone heading to a destination region.
  // Returns { [zone_id]: count }.
  async availability(destinationRegion: string): Promise<Record<string, number>> {
    const { data } = await supabase
      .from("queue_entries")
      .select("zone_id")
      .eq("destination_region", destinationRegion);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r: { zone_id: string }) => {
      counts[r.zone_id] = (counts[r.zone_id] ?? 0) + 1;
    });
    return counts;
  },

  // Total queued drivers per zone (any destination) — used in the zone admin.
  async queuedByZone(): Promise<Record<string, number>> {
    const { data } = await supabase.from("queue_entries").select("zone_id");
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r: { zone_id: string }) => {
      counts[r.zone_id] = (counts[r.zone_id] ?? 0) + 1;
    });
    return counts;
  },

  // Kolis enablement per zone (kolis_zone_settings). Missing row = enabled (default).
  async zoneSettings(): Promise<Record<string, boolean>> {
    const { data } = await supabase.from("kolis_zone_settings").select("zone_id, kolis_enabled");
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: { zone_id: string; kolis_enabled: boolean }) => { map[r.zone_id] = r.kolis_enabled; });
    return map;
  },

  async setZoneEnabled(zone_id: string, kolis_enabled: boolean) {
    const { error } = await supabase.from("kolis_zone_settings").upsert({ zone_id, kolis_enabled });
    return { error: error?.message };
  },
};
