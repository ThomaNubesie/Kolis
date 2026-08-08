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
