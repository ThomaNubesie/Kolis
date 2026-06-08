import { supabase } from "./supabase";

export type PendingPayout = {
  driver_id: string;
  driver_name: string | null;
  interac_email: string | null;
  pending_cents: number;
  parcels: number;
};

export const AdminAPI = {
  // True if the signed-in user is a LoadQ admin (drivers.is_admin).
  async isAdmin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("drivers").select("is_admin").eq("id", user.id).maybeSingle();
    return !!data?.is_admin;
  },

  // Pending Interac payouts grouped by driver (batched end of day).
  async pendingPayouts(): Promise<PendingPayout[]> {
    const { data } = await supabase.rpc("kolis_pending_payouts");
    return (data ?? []) as PendingPayout[];
  },

  // Manual: record that a driver's pending balance was paid (after sending e-Transfer).
  async markPaid(driver_id: string): Promise<number> {
    const { data } = await supabase.rpc("kolis_mark_paid", { p_driver: driver_id });
    return (data as number) ?? 0;
  },

  // Auto: send the Interac e-Transfer via the configured provider, then mark paid.
  async autoPay(driver_id: string): Promise<{ ok: boolean; error?: string; amount?: number }> {
    const { data, error } = await supabase.functions.invoke("kolis-payout", { body: { driver_id } });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, amount: data?.amount };
  },
};
