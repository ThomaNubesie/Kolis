import { supabase } from "./supabase";
import { SizeKey } from "../constants/pricing";

export type ParcelStatus = "requested" | "matched" | "picked_up" | "in_transit" | "delivered" | "cancelled";

export type Parcel = {
  id: string;
  code: string;
  status: ParcelStatus;
  mode: "zone" | "door";
  size: SizeKey;
  from_city: string;
  to_city: string;
  pickup_zone: string | null;
  pickup_addr: string | null;
  dropoff_zone: string | null;
  dropoff_addr: string | null;
  price_cents: number;
  driver_id: string | null;
  created_at: string;
};

function genCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `KL-${n}`;
}

export const ParcelsAPI = {
  async create(input: {
    mode: "zone" | "door";
    size: SizeKey;
    from_city: string;
    to_city: string;
    pickup_zone?: string | null;
    pickup_addr?: string | null;
    price: number;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { parcel: null, error: "Not signed in" };
    const { data, error } = await supabase
      .from("parcels")
      .insert({
        code: genCode(),
        sender_id: user.id,
        status: "requested",
        mode: input.mode,
        size: input.size,
        from_city: input.from_city,
        to_city: input.to_city,
        pickup_zone: input.pickup_zone ?? null,
        pickup_addr: input.pickup_addr ?? null,
        price_cents: Math.round(input.price * 100),
      })
      .select()
      .single();
    return { parcel: (data as Parcel) ?? null, error: error?.message };
  },

  async listMine() {
    const { data, error } = await supabase
      .from("parcels")
      .select("*")
      .order("created_at", { ascending: false });
    return { parcels: (data ?? []) as Parcel[], error: error?.message };
  },

  async get(id: string) {
    const { data, error } = await supabase.from("parcels").select("*").eq("id", id).single();
    return { parcel: (data as Parcel) ?? null, error: error?.message };
  },
};
