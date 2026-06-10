import { supabase } from "./supabase";

export type AdminRole = "owner" | "admin" | "dispatcher" | "finance" | "support" | null;
export type Overview = {
  in_transit: number; awaiting: number; delivered_today: number; revenue_today_cents: number;
  pending_payout_cents: number; open_claims: number; members: number; role: AdminRole;
};
export type AdminParcel = {
  id: string; code: string; from_city: string; to_city: string; size: string; dropoff_type: string;
  status: string; price_cents: number; driver_payout_cents: number | null; declared_value_cents: number | null;
  insured: boolean; recipient_name: string | null; driver_name: string | null; created_at: string; has_open_claim: boolean;
};
export type Candidate = { driver_id: string; name: string | null; queue_pos: number | null; carrying: number; source: string };
export type AdminMember = {
  id: string; full_name: string | null; email: string | null; role: string | null; country: string;
  identity_verified: boolean; is_founding: boolean; founding_number: number | null; suspended: boolean;
};
export type AdminClaim = {
  id: string; parcel_id: string; code: string; from_city: string; to_city: string; type: string; status: string;
  insured: boolean; declared_value_cents: number | null; price_cents: number; refund_cents: number | null; created_at: string;
};
export type StaffMember = { user_id: string | null; name: string | null; email: string | null; role: string; pending: boolean };
export type AccessKey = { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
export type PendingPayout = { driver_id: string; driver_name: string | null; interac_email: string | null; pending_cents: number; parcels: number };

const rpc = async <T>(fn: string, args?: any): Promise<T> => {
  const { data } = await supabase.rpc(fn, args);
  return data as T;
};

export const AdminAPI = {
  // Any staff role (owner/admin/dispatcher/finance/support) → admin access.
  async isAdmin(): Promise<boolean> {
    const { data } = await supabase.rpc("kolis_is_staff");
    return data === true;
  },
  async role(): Promise<AdminRole> {
    const { data } = await supabase.rpc("kolis_admin_role");
    return (data as AdminRole) ?? null;
  },
  // Resolve a pending staff invite on launch (no-op if none).
  async claimInvite(): Promise<AdminRole> {
    const { data } = await supabase.rpc("kolis_claim_admin_invite");
    return (data as AdminRole) ?? null;
  },

  overview: () => rpc<Overview | null>("kolis_admin_overview"),
  parcels: (filter = "all", search: string | null = null) => rpc<AdminParcel[]>("kolis_admin_parcels", { p_filter: filter, p_search: search }).then((d) => d ?? []),
  parcel: (id: string) => rpc<any>("kolis_admin_parcel", { p_id: id }),
  candidates: (id: string) => rpc<Candidate[]>("kolis_admin_candidates", { p_id: id }).then((d) => d ?? []),

  assign: (id: string, driver: string) => rpc<void>("kolis_admin_assign", { p_id: id, p_driver: driver }),
  changeDriver: (id: string, driver: string) => rpc<void>("kolis_admin_change_driver", { p_id: id, p_driver: driver }),
  unassign: (id: string) => rpc<void>("kolis_admin_unassign", { p_id: id }),
  reroute: (id: string, toCity: string, toRegion: string) => rpc<void>("kolis_admin_reroute", { p_id: id, p_to_city: toCity, p_to_region: toRegion }),

  members: (filter = "all", search: string | null = null) => rpc<AdminMember[]>("kolis_admin_members", { p_filter: filter, p_search: search }).then((d) => d ?? []),
  suspend: (id: string, suspended: boolean) => rpc<void>("kolis_admin_suspend", { p_id: id, p_suspended: suspended }),

  claims: (status = "open") => rpc<AdminClaim[]>("kolis_admin_claims", { p_status: status }).then((d) => d ?? []),
  openClaim: (parcel: string, type: string, note?: string) => rpc<string>("kolis_open_claim", { p_parcel: parcel, p_type: type, p_note: note ?? null }),
  denyClaim: (id: string, note?: string) => rpc<void>("kolis_deny_claim", { p_id: id, p_note: note ?? null }),
  async refund(body: { parcel_id: string; amount_cents?: number; method?: "card" | "interac"; action?: "cancel" | "claim"; claim_id?: string }): Promise<{ ok?: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke("kolis-admin-refund", { body });
    if (error) return { error: error.message };
    return data;
  },

  team: () => rpc<StaffMember[]>("kolis_admin_team").then((d) => d ?? []),
  invite: (email: string, role: string) => rpc<string>("kolis_admin_invite", { p_email: email, p_role: role }),
  removeStaff: (user: string) => rpc<void>("kolis_admin_remove_staff", { p_user: user }),
  keys: () => rpc<AccessKey[]>("kolis_admin_keys").then((d) => d ?? []),
  createKey: (name: string, scopes: string[]) => rpc<{ key: string; prefix: string }>("kolis_admin_create_key", { p_name: name, p_scopes: scopes }),
  revokeKey: (id: string) => rpc<void>("kolis_admin_revoke_key", { p_id: id }),

  // Payouts (existing)
  pendingPayouts: () => rpc<PendingPayout[]>("kolis_pending_payouts").then((d) => d ?? []),
  markPaid: (driver_id: string) => rpc<number>("kolis_mark_paid", { p_driver: driver_id }),
  async autoPay(driver_id: string): Promise<{ ok: boolean; error?: string; amount?: number }> {
    const { data, error } = await supabase.functions.invoke("kolis-payout", { body: { driver_id } });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, amount: data?.amount };
  },
};
