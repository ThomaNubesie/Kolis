import { supabase } from "./supabase";
import { SizeKey, DropType, driverPayoutCents } from "../constants/pricing";
import { regionCode } from "../constants/geo";

export type ParcelStatus =
  | "requested"        // pending — waiting for a match
  | "received_at_hub"  // dropped at a staffed hub, awaiting dispatch
  | "matched"          // zone/door driver matched
  | "dispatched"       // hub: handed to a driver (platform or off-platform)
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type Parcel = {
  id: string;
  code: string;
  status: ParcelStatus;
  dropoff_type: DropType;
  size: SizeKey;
  from_city: string;
  to_city: string;
  pickup_zone: string | null;
  pickup_hub: string | null;
  pickup_addr: string | null;
  dropoff_zone: string | null;
  dropoff_addr: string | null;
  price_cents: number;
  driver_id: string | null;
  external_driver_name: string | null;
  created_at: string;
};

function genCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `KL-${n}`;
}

export const ParcelsAPI = {
  async create(input: {
    dropoff_type: DropType;
    size: SizeKey;
    from_city: string;
    to_city: string;
    pickup_zone?: string | null;
    pickup_hub?: string | null;
    price: number;
    preferred_driver_id?: string | null;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { parcel: null, error: "Not signed in" };
    // Hub drops start at the hub; zone/door start pending until a match.
    const status: ParcelStatus = input.dropoff_type === "hub" ? "received_at_hub" : "requested";
    // First right of refusal: chosen driver gets a 10-min exclusive window.
    const preferred = input.preferred_driver_id || null;
    const offerExpires = preferred ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
    const { data, error } = await supabase
      .from("kolis_parcels")
      .insert({
        code: genCode(),
        sender_id: user.id,
        status,
        dropoff_type: input.dropoff_type,
        size: input.size,
        from_city: input.from_city,
        to_city: input.to_city,
        to_region: regionCode(input.to_city),
        pickup_zone: input.pickup_zone ?? null,
        pickup_hub: input.pickup_hub ?? null,
        price_cents: Math.round(input.price * 100),
        driver_payout_cents: driverPayoutCents(Math.round(input.price * 100), input.dropoff_type),
        preferred_driver_id: preferred,
        offer_expires_at: offerExpires,
      })
      .select()
      .single();
    return { parcel: (data as Parcel) ?? null, error: error?.message };
  },

  async listMine() {
    const { data, error } = await supabase
      .from("kolis_parcels")
      .select("*")
      .order("created_at", { ascending: false });
    return { parcels: (data ?? []) as Parcel[], error: error?.message };
  },

  async get(id: string) {
    const { data, error } = await supabase.from("kolis_parcels").select("*").eq("id", id).single();
    return { parcel: (data as Parcel) ?? null, error: error?.message };
  },

  // Admin: parcels dropped at a hub, awaiting dispatch.
  async atHub() {
    const { data, error } = await supabase
      .from("kolis_parcels")
      .select("*")
      .eq("status", "received_at_hub")
      .order("created_at", { ascending: true });
    return { parcels: (data ?? []) as Parcel[], error: error?.message };
  },

  // Notify queued LoadQ drivers that a zone parcel is available (push).
  async notifyDrivers(id: string) {
    try { await supabase.functions.invoke("kolis-notify-drivers", { body: { parcel_id: id } }); } catch { /* best-effort */ }
  },

  // Admin: dispatch a hub parcel with a platform or off-platform driver.
  async dispatch(id: string, opts: { driver_id?: string | null; external_driver_name?: string | null }) {
    const { error } = await supabase
      .from("kolis_parcels")
      .update({ status: "dispatched", driver_id: opts.driver_id ?? null, external_driver_name: opts.external_driver_name ?? null })
      .eq("id", id);
    return { error: error?.message };
  },
};
