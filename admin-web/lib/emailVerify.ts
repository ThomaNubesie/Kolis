import { supabase } from "./supabase";

export type EmailVerdict = { ok: boolean; reason?: string; domain?: string };
const cache = new Map<string, EmailVerdict>();

// Confirms the email is real & mail-capable (MX/A lookup + disposable block),
// via the kolis-verify-email edge function. Fail-open on our own network error.
export async function verifyEmail(email?: string | null): Promise<EmailVerdict> {
  const key = (email || "").trim().toLowerCase();
  if (!key) return { ok: false, reason: "format" };
  if (cache.has(key)) return cache.get(key)!;
  try {
    const { data, error } = await supabase.functions.invoke("kolis-verify-email", { body: { email: key } });
    const res: EmailVerdict = error ? { ok: true, reason: "lookup_failed" } : (data || { ok: true });
    cache.set(key, res);
    return res;
  } catch { return { ok: true, reason: "lookup_failed" }; }
}

// User-facing reason for a rejected email.
export function emailReason(v: EmailVerdict, fr: boolean): string {
  if (v.reason === "disposable") return fr ? "Les adresses courriel jetables ne sont pas acceptées." : "Disposable email addresses aren't accepted.";
  if (v.reason === "no_mail_server") return fr ? "Ce domaine de courriel n'existe pas ou ne reçoit pas de courriel — vérifiez l'orthographe." : "That email domain doesn't exist or can't receive mail — check the spelling.";
  return fr ? "Adresse courriel invalide." : "Invalid email address.";
}
