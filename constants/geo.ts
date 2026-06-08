// Normalize a city name to the lowercase code used by LoadQ's zones.region and
// queue_entries.destination_region (e.g. "Montréal" -> "montreal",
// "Québec City" -> "quebec", "Trois-Rivières" -> "trois-rivieres").
const ACCENTS: Record<string, string> = {
  "á": "a", "à": "a", "â": "a", "ä": "a",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
  "ó": "o", "ò": "o", "ô": "o", "ö": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u",
  "ç": "c",
};

export function regionCode(city: string): string {
  const first = (city || "").trim().toLowerCase().split(/[\s\n]+/)[0] || "";
  return first.split("").map((ch) => ACCENTS[ch] ?? ch).join("");
}
