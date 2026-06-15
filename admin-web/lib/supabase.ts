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
  // ── Organizations (staff-provisioned business accounts) ──
  orgs: () => r<any[]>("kolis_admin_orgs"),
  org: (id: string) => r<any[]>("kolis_admin_org", { p_org: id }),
  createOrg: (a: { name: string; type: string; billing_email?: string; net_terms?: number; discount?: number; credit_limit_cents?: number }) =>
    r<string>("kolis_admin_create_org", { p_name: a.name, p_type: a.type, p_billing_email: a.billing_email ?? null, p_net_terms: a.net_terms ?? 30, p_discount: a.discount ?? 0, p_credit_limit_cents: a.credit_limit_cents ?? 0 }),
  orgMembers: (id: string) => r<any[]>("kolis_admin_org_members", { p_org: id }),
  setOrgProfile: (id: string, a: { name?: string; billing_email?: string }) =>
    r("kolis_admin_set_org_profile", { p_org: id, p_name: a.name ?? null, p_billing_email: a.billing_email ?? null }),
  setOrgLimits: (id: string, a: { credit_limit_cents?: number; discount?: number; net_terms?: number; platform_fee?: number }) =>
    r("kolis_admin_set_org_limits", { p_org: id, p_credit_limit_cents: a.credit_limit_cents ?? null, p_discount: a.discount ?? null, p_net_terms: a.net_terms ?? null, p_platform_fee: a.platform_fee ?? null }),
  setOrgKyb: (id: string, status: string) => r("kolis_admin_set_kyb", { p_org: id, p_status: status }),
  setOrgStatus: (id: string, status: string) => r("kolis_admin_set_org_status", { p_org: id, p_status: status }),
  async orgInviteEmail(id: string, email: string, role: string) {
    // Creates the invite AND emails it (the RPC alone never notified anyone).
    const { data, error } = await supabase.functions.invoke("kolis-org-invite", { body: { org_id: id, email, role } });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  },
  orgAddByPhone: (id: string, phone: string, role: string) => r<any>("kolis_admin_org_add_member_by_phone", { p_org: id, p_phone: phone, p_role: role }),
  orgRemoveMember: (id: string, user: string) => r("kolis_admin_org_remove_member", { p_org: id, p_user: user }),
};

// ── Kolis for Business — org-scoped RPCs (shipper + carrier portals) ──────────
export type MyOrg = {
  org_id: string;
  name: string;
  type: "shipper" | "carrier" | "both";
  role: string;
  status: "active" | "suspended";
  kyb_status: "pending" | "verified" | "rejected";
};

export const org = {
  mine: () => r<MyOrg[]>("kolis_my_orgs"),
  acceptInvites: () => r<number>("kolis_accept_org_invite"),
  // shipper
  overview: (o: string) => r<any>("kolis_org_overview", { p_org: o }),
  shipments: (o: string, filter = "all", search: string | null = null) =>
    r<any[]>("kolis_org_shipments", { p_org: o, p_filter: filter, p_search: search }),
  // args use p_-prefixed keys matching kolis_org_create_shipment
  createShipment: (o: string, args: Record<string, any>) =>
    r<{ id: string; code: string; dedup?: boolean }>("kolis_org_create_shipment", { p_org: o, ...args }),
  bulkCreate: (o: string, rows: any[]) => r<any[]>("kolis_org_bulk_create", { p_org: o, p_rows: rows }),
  addresses: (o: string) => r<any[]>("kolis_org_addresses", { p_org: o }),
  saveAddress: (o: string, a: any) =>
    r<string>("kolis_org_save_address", { p_org: o, p_label: a.label, p_name: a.name, p_line1: a.line1, p_city: a.city, p_province: a.province, p_postal: a.postal, p_phone: a.phone }),
  async setupCard(o: string) {
    const { data, error } = await supabase.functions.invoke("kolis-setup-card", { body: { org_id: o } });
    if (error) throw error;
    return data as { clientSecret?: string; skipped?: string };
  },
  invoices: (o: string) => r<any[]>("kolis_org_invoices", { p_org: o }),
  invoice: (o: string, id: string) => r<any>("kolis_org_invoice", { p_org: o, p_id: id }),
  team: (o: string) => r<{ members: any[]; invites: any[] }>("kolis_org_team", { p_org: o }),
  async invite(o: string, email: string, role: string) {
    const { data, error } = await supabase.functions.invoke("kolis-org-invite", { body: { org_id: o, email, role } });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  },
  setRole: (o: string, user: string, role: string) => r("kolis_org_set_role", { p_org: o, p_user: user, p_role: role }),
  removeMember: (o: string, user: string) => r("kolis_org_remove_member", { p_org: o, p_user: user }),
  // carrier
  board: (o: string) => r<any[]>("kolis_carrier_dispatch_board", { p_org: o }),
  drivers: (o: string) => r<any[]>("kolis_carrier_drivers", { p_org: o }),
  assign: (o: string, parcel: string, driver: string) => r<boolean>("kolis_carrier_assign", { p_org: o, p_parcel: parcel, p_driver: driver }),
  advance: (o: string, parcel: string, to: string) => r<boolean>("kolis_carrier_advance_status", { p_org: o, p_parcel: parcel, p_to: to }),
  // carrier payouts
  pendingPayouts: (o: string) => r<any[]>("kolis_carrier_pending_payouts", { p_org: o }),
  payoutStatements: (o: string) => r<any[]>("kolis_org_payout_statements", { p_org: o }),
  payoutStatement: (o: string, id: string) => r<any>("kolis_carrier_statement", { p_org: o, p_id: id }),
  // developer API
  keys: (o: string) => r<any[]>("kolis_org_keys", { p_org: o }),
  createKey: (o: string, name: string, scopes: string[]) => r<string>("kolis_org_create_key", { p_org: o, p_name: name, p_scopes: scopes }),
  revokeKey: (o: string, id: string) => r("kolis_org_revoke_key", { p_org: o, p_id: id }),
  webhooks: (o: string) => r<any[]>("kolis_org_webhooks", { p_org: o }),
  createWebhook: (o: string, url: string, events: string[]) => r<string>("kolis_org_create_webhook", { p_org: o, p_url: url, p_events: events }),
  deleteWebhook: (o: string, id: string) => r("kolis_org_delete_webhook", { p_org: o, p_id: id }),
  webhookDeliveries: (o: string) => r<any[]>("kolis_org_webhook_deliveries", { p_org: o }),
};
