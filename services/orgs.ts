import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export type OrgType = "shipper" | "carrier" | "both";
export type OrgRole = "owner" | "admin" | "finance" | "shipper" | "dispatcher" | "driver";

export type MyOrg = {
  org_id: string;
  name: string;
  type: OrgType;
  role: OrgRole;
  status: "active" | "suspended";
  kyb_status: "pending" | "verified" | "rejected";
};

// AsyncStorage key for the active org context (null/absent = personal account).
export const ACTIVE_ORG_KEY = "activeOrgId";

export const OrgsAPI = {
  // Orgs the signed-in user belongs to (drives the org switcher).
  async myOrgs(): Promise<MyOrg[]> {
    const { data } = await supabase.rpc("kolis_my_orgs");
    return (data ?? []) as MyOrg[];
  },

  async getActiveOrgId(): Promise<string | null> {
    return AsyncStorage.getItem(ACTIVE_ORG_KEY);
  },

  async setActiveOrgId(id: string | null): Promise<void> {
    if (id) await AsyncStorage.setItem(ACTIVE_ORG_KEY, id);
    else await AsyncStorage.removeItem(ACTIVE_ORG_KEY);
  },

  // Accept any pending org invites addressed to the signed-in user's email.
  // Returns the number of invites accepted. Call after sign-in / on the switcher.
  async acceptInvites(): Promise<number> {
    const { data } = await supabase.rpc("kolis_accept_org_invite");
    return (data as number) ?? 0;
  },

  // ── Shipper ──
  async overview(orgId: string): Promise<any> {
    const { data } = await supabase.rpc("kolis_org_overview", { p_org: orgId });
    return data ?? {};
  },
  async createShipment(orgId: string, args: Record<string, any>): Promise<{ id: string; code: string } | null> {
    const { data, error } = await supabase.rpc("kolis_org_create_shipment", { p_org: orgId, ...args });
    if (error) throw error;
    return data ?? null;
  },

  // ── Carrier / fleet ──
  async board(orgId: string): Promise<any[]> {
    const { data } = await supabase.rpc("kolis_carrier_dispatch_board", { p_org: orgId });
    return (data ?? []) as any[];
  },
  async drivers(orgId: string): Promise<any[]> {
    const { data } = await supabase.rpc("kolis_carrier_drivers", { p_org: orgId });
    return (data ?? []) as any[];
  },
  async assign(orgId: string, parcel: string, driver: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("kolis_carrier_assign", { p_org: orgId, p_parcel: parcel, p_driver: driver });
    if (error) throw error;
    return data === true;
  },
  async advance(orgId: string, parcel: string, to: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("kolis_carrier_advance_status", { p_org: orgId, p_parcel: parcel, p_to: to });
    if (error) throw error;
    return data === true;
  },
};
