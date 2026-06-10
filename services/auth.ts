import { supabase } from "./supabase";

// Phone-OTP auth, same pattern as LoadQ.
export const AuthAPI = {
  async sendOTP(phone: string) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error: error?.message };
  },

  async verifyOTP(phone: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    return { user: data?.user, session: data?.session, error: error?.message };
  },

  // Email verification (separate from phone auth). Code is sent + checked by a
  // Kolis edge function; returns dev_otp when email can't be delivered so the
  // team can still test. Phone remains the primary Supabase auth identity.
  async sendEmailOTP(email: string) {
    const { data, error } = await supabase.functions.invoke("kolis-send-email-otp", { body: { email } });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error as string };
    return { dev_otp: data?.dev_otp as string | undefined };
  },

  async verifyEmailOTP(email: string, token: string) {
    const { data, error } = await supabase.functions.invoke("kolis-verify-email-otp", { body: { email, otp: token } });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error as string };
    return { ok: true };
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
