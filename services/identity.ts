import { supabase } from "./supabase";

// Stripe Identity (hosted) for Kolis onboarding.
export const IdentityAPI = {
  async createSession(role: string) {
    const { data, error } = await supabase.functions.invoke("kolis-create-identity-session", { body: { role } });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error as string };
    return { url: data.url as string, id: data.id as string };
  },

  // status: requires_input | processing | verified | canceled | error
  async status(sessionId?: string) {
    const { data, error } = await supabase.functions.invoke("kolis-identity-status", { body: { session_id: sessionId } });
    if (error) return { status: "error", name: null as string | null };
    return { status: (data?.status ?? "requires_input") as string, name: (data?.name ?? null) as string | null };
  },
};
