// Shared form validators for the Kolis Business portal.
import { cityList } from "./cities";

// Proper email address.
export const emailOk = (e?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

// North-American phone: 10 digits, or 11 starting with 1 (formatting chars ignored).
export const phoneOk = (p?: string | null) => {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
};

// A plausible person/business name: at least 2 chars and contains a letter.
export const nameOk = (n?: string | null) => {
  const s = (n || "").trim();
  return s.length >= 2 && /\p{L}/u.test(s);
};

// City must be one of the served network cities (so the address corresponds to a
// real destination we cover). Case-insensitive.
const CITY_SET = new Set(cityList.map((c) => c.toLowerCase()));
export const cityOk = (c?: string | null) => CITY_SET.has((c || "").trim().toLowerCase());

// A plausible street address: needs a civic/street number and a street name.
// Rejects placeholders like "ssss" or "asdf".
export const addressOk = (a?: string | null) => {
  const s = (a || "").trim();
  if (s.length < 5) return false;
  if (!/\d/.test(s)) return false;          // a civic / street number
  if (!/\p{L}{2,}/u.test(s)) return false;  // a street name
  return true;
};

// Reject obvious gibberish for the parcel contents description: needs real
// letters, a vowel, and some variety (so "asdfgh", "xxxxx", "....", "123" fail
// while "documents", "auto parts", "vêtements" pass).
export const contentsOk = (c?: string | null) => {
  const s = (c || "").trim();
  if (s.length < 3) return false;
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (letters < 3) return false;
  if (!/[aeiouyàâäéèêëïîôöùûü]/i.test(s)) return false;              // must contain a vowel
  const distinct = new Set(s.toLowerCase().replace(/[^a-zà-ÿ]/gi, "")).size;
  return distinct >= 3;                                              // enough letter variety
};
