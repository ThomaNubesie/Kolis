// Kolis courier API — the in-app side of the cross-app proposal engine. Uses the
// same shared RPCs/functions as the LoadQ driver card, so accepting here or in
// LoadQ is the same atomic claim.
import { supabase } from "./supabase";

export type CourierParcel = {
  id: string;
  code: string;
  size: string;
  to_city: string;
  to_region?: string | null;
  dropoff_type: string;
  pickup_zone: string | null;
  pickup_hub: string | null;
  pickup_addr: string | null;
  price_cents: number;
  driver_payout_cents: number | null;
  status?: string;
};

export const CourierAPI = {
  // Parcels proposed to this courier (verified Kolis member, by hub/door rules).
  async proposals(): Promise<CourierParcel[]> {
    const { data } = await supabase.rpc("kolis_available_parcels");
    return (data ?? []) as CourierParcel[];
  },

  // Atomic accept (cross-app: same claim as the LoadQ card).
  async accept(id: string): Promise<boolean> {
    const { data } = await supabase.rpc("kolis_accept_parcel", { p_id: id });
    return data === true;
  },

  async carrying(): Promise<CourierParcel[]> {
    const { data } = await supabase
      .from("kolis_parcels")
      .select("id, code, size, to_city, to_region, dropoff_type, pickup_zone, pickup_hub, pickup_addr, price_cents, driver_payout_cents, status")
      .in("status", ["matched", "picked_up", "in_transit"])
      .order("created_at", { ascending: true });
    return (data ?? []) as CourierParcel[];
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
