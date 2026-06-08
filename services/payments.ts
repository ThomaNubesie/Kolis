import { supabase } from "./supabase";

export const PaymentsAPI = {
  // Creates (or reuses) the manual-capture escrow PaymentIntent for a parcel.
  async createIntent(parcel_id: string): Promise<{ clientSecret?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke("kolis-create-payment", { body: { parcel_id } });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { clientSecret: data?.clientSecret as string };
  },

  // capture (on delivery, admin) or cancel (release the hold, sender/admin).
  async finalize(parcel_id: string, action: "capture" | "cancel"): Promise<{ error?: string }> {
    const { data, error } = await supabase.functions.invoke("kolis-finalize-payment", { body: { parcel_id, action } });
    return { error: error?.message ?? data?.error };
  },
};
