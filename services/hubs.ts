import { supabase } from "./supabase";

export type Hub = {
  id: string;
  city: string;
  name: string;
  address: string | null;
  hours: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
};

export const HubsAPI = {
  async listActive() {
    const { data, error } = await supabase.from("kolis_hubs").select("*").eq("is_active", true).order("city");
    return { hubs: (data ?? []) as Hub[], error: error?.message };
  },
  async listAll() {
    const { data, error } = await supabase.from("kolis_hubs").select("*").order("city");
    return { hubs: (data ?? []) as Hub[], error: error?.message };
  },
  async forCity(city: string) {
    const { data } = await supabase.from("kolis_hubs").select("*").eq("city", city).eq("is_active", true);
    return (data ?? []) as Hub[];
  },
  // admin (gated by RLS: public.drivers.is_admin)
  async create(input: { city: string; name: string; address?: string; hours?: string }) {
    const { data, error } = await supabase.from("kolis_hubs").insert(input).select().single();
    return { hub: (data as Hub) ?? null, error: error?.message };
  },
  async setActive(id: string, is_active: boolean) {
    const { error } = await supabase.from("kolis_hubs").update({ is_active }).eq("id", id);
    return { error: error?.message };
  },
};
