// Normalize user-entered phone numbers to E.164, which Supabase phone-OTP
// requires (e.g. +16135550000). Defaults to North America (+1) when the
// caller omits a country code, so a plain 10-digit number works.
export function toE164(raw: string): string {
  const trimmed = (raw || "").trim();
  // Already has a country code — keep the +, drop any spaces/dashes/parens.
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits; // 1 613 555 0000
  if (digits.length === 10) return "+1" + digits;                          // 613 555 0000
  return digits ? "+" + digits : "";                                       // assume already includes a country code
}

// A best-effort validity check: a real number after normalizing has 11–15 digits.
export function isValidE164(e164: string): boolean {
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 11 && digits.length <= 15;
}
