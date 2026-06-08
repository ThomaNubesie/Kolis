import { supabase } from "./supabase";

export const AdminAPI = {
  // True if the signed-in user is a LoadQ admin (drivers.is_admin).
  async isAdmin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("drivers").select("is_admin").eq("id", user.id).maybeSingle();
    return !!data?.is_admin;
  },
};
