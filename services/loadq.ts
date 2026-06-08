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
};
