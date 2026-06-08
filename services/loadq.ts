import { supabase } from "./supabase";

// Reads from LoadQ's shared tables (zones + live queue). Kolis only reads these;
// LoadQ owns/manages them.
export type LoadqZone = {
  id: string;
  name: string;
  region: string | null;
  address: string | null;
  is_active: boolean;
};

export const LoadqAPI = {
  async zones() {
    const { data, error } = await supabase
      .from("zones")
      .select("id,name,region,address,is_active")
      .eq("is_active", true)
      .order("name");
    return { zones: (data ?? []) as LoadqZone[], error: error?.message };
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
