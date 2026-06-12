"use client";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const r = async <T,>(fn: string, args?: any): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
};

// Mirrors the mobile AdminAPI — same SECURITY DEFINER RPCs.
export const api = {
  role: () => r<string | null>("kolis_admin_role"),
  isStaff: () => r<boolean>("kolis_is_staff"),
  overview: () => r<any>("kolis_admin_overview"),
  parcels: (filter = "all", search: string | null = null) => r<any[]>("kolis_admin_parcels", { p_filter: filter, p_search: search }),
  parcel: (id: string) => r<any>("kolis_admin_parcel", { p_id: id }),
  candidates: (id: string) => r<any[]>("kolis_admin_candidates", { p_id: id }),
  async assign(id: string, driver: string) {
    const res = await r("kolis_admin_assign", { p_id: id, p_driver: driver });
    // Notify the driver they have a delivery request to accept/decline.
    supabase.functions.invoke("kolis-notify", { body: { parcel_id: id, event: "assigned" } }).catch(() => {});
    return res;
  },
  changeDriver: (id: string, driver: string) => r("kolis_admin_change_driver", { p_id: id, p_driver: driver }),
  unassign: (id: string) => r("kolis_admin_unassign", { p_id: id }),
  reroute: (id: string, toCity: string, toRegion: string) => r("kolis_admin_reroute", { p_id: id, p_to_city: toCity, p_to_region: toRegion }),
  members: (filter = "all", search: string | null = null) => r<any[]>("kolis_admin_members", { p_filter: filter, p_search: search }),
  suspend: (id: string, s: boolean) => r("kolis_admin_suspend", { p_id: id, p_suspended: s }),
  claims: (status = "open") => r<any[]>("kolis_admin_claims", { p_status: status }),
  denyClaim: (id: string) => r("kolis_deny_claim", { p_id: id, p_note: null }),
  team: () => r<any[]>("kolis_admin_team"),
  invite: (email: string, role: string) => r<string>("kolis_admin_invite", { p_email: email, p_role: role }),
  removeStaff: (user: string) => r("kolis_admin_remove_staff", { p_user: user }),
  keys: () => r<any[]>("kolis_admin_keys"),
  createKey: (name: string, scopes: string[]) => r<any>("kolis_admin_create_key", { p_name: name, p_scopes: scopes }),
  revokeKey: (id: string) => r("kolis_admin_revoke_key", { p_id: id }),
  async refund(body: any) {
    const { data, error } = await supabase.functions.invoke("kolis-admin-refund", { body });
    if (error) throw error;
    return data;
  },
};
