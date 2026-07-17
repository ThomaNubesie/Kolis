// Country-aware address + phone formatting for account / client forms.
export type Country = {
  code: string; name: string; dial: string;
  region: string;        // State / Province / Region label
  postal: string;        // Postal code / ZIP / Postcode label
  postalPh: string;      // postal placeholder
  phonePh: string;       // local phone placeholder
};

// Canada first (default). Set tuned for Kolis's Canadian base + its clientele.
export const COUNTRIES: Country[] = [
  { code: "CA", name: "Canada", dial: "+1", region: "Province", postal: "Postal code", postalPh: "K1A 0B1", phonePh: "613 555 0192" },
  { code: "US", name: "United States", dial: "+1", region: "State", postal: "ZIP code", postalPh: "10001", phonePh: "212 555 0192" },
  { code: "GB", name: "United Kingdom", dial: "+44", region: "County", postal: "Postcode", postalPh: "SW1A 1AA", phonePh: "20 7946 0958" },
  { code: "FR", name: "France", dial: "+33", region: "Région", postal: "Code postal", postalPh: "75001", phonePh: "1 42 68 53 00" },
  { code: "NG", name: "Nigeria", dial: "+234", region: "State", postal: "Postal code", postalPh: "100001", phonePh: "801 234 5678" },
  { code: "GH", name: "Ghana", dial: "+233", region: "Region", postal: "Postal (GPS)", postalPh: "GA-123-4567", phonePh: "24 123 4567" },
  { code: "CM", name: "Cameroon", dial: "+237", region: "Region", postal: "Postal code", postalPh: "", phonePh: "6 71 23 45 67" },
  { code: "CI", name: "Côte d'Ivoire", dial: "+225", region: "Region", postal: "Postal code", postalPh: "", phonePh: "01 23 45 67 89" },
  { code: "SN", name: "Senegal", dial: "+221", region: "Region", postal: "Postal code", postalPh: "10200", phonePh: "70 123 45 67" },
  { code: "CD", name: "DR Congo", dial: "+243", region: "Province", postal: "Postal code", postalPh: "", phonePh: "81 234 5678" },
];

export const countryByCode = (c?: string | null): Country => COUNTRIES.find((x) => x.code === c) || COUNTRIES[0];
export const digitsOnly = (s?: string) => (s || "").replace(/[^\d]/g, "");

// Combine a local number + dial code into E.164 (idempotent for already-+ numbers).
export const toE164 = (local: string, dial: string) => {
  const s = (local || "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return "+" + digitsOnly(s);
  return dial + digitsOnly(s);
};

// Show the local part of a stored E.164 given the selected dial code.
export const localFromE164 = (e164: string | undefined | null, dial: string) => {
  if (!e164) return "";
  const d = e164.startsWith("+") ? e164 : "+" + digitsOnly(e164);
  const dd = digitsOnly(dial);
  const full = digitsOnly(d);
  return full.startsWith(dd) ? full.slice(dd.length) : full;
};
