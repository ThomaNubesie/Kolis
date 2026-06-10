import { supabase } from "./supabase";

export type KolisRole = "sender" | "courier" | "both";

export type KolisProfile = {
  id: string;
  role: KolisRole | null;
  full_name: string | null;
  email: string | null;
  country: string;
  identity_verified: boolean;
  verification_fee_paid: boolean;
  is_founding: boolean;
  founding_number: number | null;
};

export const ProfileAPI = {
  // Upsert the caller's profile (requires an auth session from phone OTP).
  async save(input: { role?: KolisRole; full_name?: string; email?: string; country?: string }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const { error } = await supabase
      .from("kolis_profiles")
      .upsert({ id: user.id, ...input, updated_at: new Date().toISOString() });
    return { error: error?.message };
  },

  async get(): Promise<KolisProfile | null> {
    const { data } = await supabase.from("kolis_profiles").select("*").maybeSingle();
    return (data as KolisProfile) ?? null;
  },

  // Permanently deletes the caller's account + all Kolis/LoadQ data (shared RPC).
  async deleteAccount(): Promise<{ error?: string }> {
    const { error } = await supabase.rpc("delete_my_account");
    return { error: error?.message };
  },
};
