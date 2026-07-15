// Kolis courier API — the in-app side of the cross-app proposal engine. Uses the
// same shared RPCs/functions as the LoadQ driver card, so accepting here or in
// LoadQ is the same atomic claim.
import { supabase } from "./supabase";

// Courier-facing shape — NO sender price field exists here by construction.
export type CourierParcel = {
  id: string;
  code: string;
  size: string;
  from_city: string;
  to_city: string;
  to_region?: string | null;
  dropoff_type: string;
  pickup_zone: string | null;
  pickup_hub_name: string | null;
  pickup_addr?: string | null; // present only in carrying (post-accept), not proposals
  dropoff_addr?: string | null;    // carrying only, revealed after pickup
  recipient_name?: string | null;  // carrying only, revealed after pickup
  recipient_phone?: string | null; // carrying only, revealed after pickup
  driver_payout_cents: number | null;
  status?: string;
  is_request?: boolean; // true = admin assigned this to me specifically (accept/decline)
  accepted_via?: string | null; // 'loadq' | 'kolis' — which app owns live tracking
};

// Delivery receipt (role-walled server-side by kolis_parcel_receipt).
export type CourierReceipt = {
  id: string;
  code: string;
  from_city: string;
  to_city: string;
  size: string;
  dropoff_type: string;
  status: string;
  delivered_at: string | null;
  created_at: string;
  role: "courier";
  payout_cents: number;
};

export type TaxYear = { year: number; total_payout_cents: number; parcels: number };

export const CourierAPI = {
  // Parcels proposed to this courier (verified Kolis member, by hub/door rules).
  async proposals(): Promise<CourierParcel[]> {
    const { data } = await supabase.rpc("kolis_available_parcels");
    return (data ?? []) as CourierParcel[];
  },

  // Atomic accept (cross-app: same claim as the LoadQ card). etaMinutes = the
  // courier's pickup ETA shown to the sender (auto or tapped).
  async accept(id: string, etaMinutes?: number | null): Promise<boolean> {
    const { data } = await supabase.rpc("kolis_accept_parcel", { p_id: id, p_via: "kolis", p_eta_minutes: etaMinutes ?? null });
    return data === true;
  },

  // Auto pickup ETA (driving minutes) from the courier's coords to the pickup
  // address. Returns null when unavailable (no Maps key / stale GPS) — the caller
  // then uses the courier's tapped ETA.
  async pickupEta(parcelId: string, lat: number, lng: number): Promise<number | null> {
    try {
      const { data } = await supabase.functions.invoke("kolis-pickup-eta", { body: { parcel_id: parcelId, lat, lng } });
      return data?.ok ? (data.eta_minutes as number) : null;
    } catch { return null; }
  },

  // Decline a request that was targeted to me — returns it to the pool.
  async decline(id: string): Promise<boolean> {
    const { data } = await supabase.rpc("kolis_decline_parcel", { p_id: id });
    return data === true;
  },

  // Confirm possession with the SENDER's pickup code: matched -> picked_up.
  // Reveals the drop-off address + recipient and notifies the recipient.
  // Returns "ok" | "bad_code" | "fail".
  async markPickedUp(id: string, code: string): Promise<string> {
    const { data } = await supabase.rpc("kolis_courier_pickup", { p_id: id, p_code: code });
    return (data as string) ?? "fail";
  },

  // Carried parcels via the walled RPC (hub name resolved, payout only).
  async carrying(): Promise<CourierParcel[]> {
    const { data } = await supabase.rpc("kolis_carrying");
    return (data ?? []) as CourierParcel[];
  },

  // Role-appropriate receipt — courier branch returns payout only, never price.
  async receipt(id: string): Promise<CourierReceipt | null> {
    const { data } = await supabase.rpc("kolis_parcel_receipt", { p_id: id });
    return (data as CourierReceipt) ?? null;
  },

  // Tax: years with delivered earnings + annual gross totals.
  async taxYears(): Promise<TaxYear[]> {
    const { data } = await supabase.rpc("kolis_tax_years");
    return (data ?? []) as TaxYear[];
  },

  // Generate + email the year's contractor tax document (T4A/1099/statement).
  async taxDocument(year: number): Promise<{ ok?: boolean; emailed?: boolean; emailed_to?: string | null; doc_type?: string; gross_cents?: number; parcels?: number; error?: string }> {
    const { data, error } = await supabase.functions.invoke("kolis-tax-document", { body: { year } });
    if (error) return { error: error.message };
    return data;
  },

  // Earnings split paid vs pending (cents). NOTE: never exposes the sender's price.
  async earnings(): Promise<{ paid: number; pending: number }> {
    const { data } = await supabase
      .from("kolis_parcels")
      .select("driver_payout_cents, driver_paid_at")
      .eq("status", "delivered");
    let paid = 0, pending = 0;
    (data ?? []).forEach((r: { driver_payout_cents: number | null; driver_paid_at: string | null }) => {
      const c = r.driver_payout_cents ?? 0;
      if (r.driver_paid_at) paid += c; else pending += c;
    });
    return { paid, pending };
  },

  async getInterac(): Promise<string | null> {
    const { data } = await supabase.from("kolis_driver_payout").select("interac_email").maybeSingle();
    return data?.interac_email ?? null;
  },

  async setInterac(email: string): Promise<{ error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "not signed in" };
    const { error } = await supabase.from("kolis_driver_payout").upsert({ driver_id: user.id, interac_email: email });
    return { error: error?.message };
  },

  // Deliver with the recipient's 4-digit code → captures the escrow.
  async deliver(id: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke("kolis-finalize-payment", { body: { parcel_id: id, action: "deliver", code } });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  },
};
