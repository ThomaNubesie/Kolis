// Canonical city list for the From/To pickers. `code` matches LoadQ's
// zones.region / queue_entries.destination_region; `label` is shown to users.
export type City = { code: string; label: string };

export const CITIES: City[] = [
  { code: "ottawa", label: "Ottawa" },
  { code: "montreal", label: "Montréal" },
  { code: "gatineau", label: "Gatineau" },
  { code: "toronto", label: "Toronto" },
  { code: "kingston", label: "Kingston" },
  { code: "quebec", label: "Québec" },
  { code: "trois-rivieres", label: "Trois-Rivières" },
  { code: "sherbrooke", label: "Sherbrooke" },
  { code: "chicoutimi", label: "Chicoutimi" },
  { code: "moncton", label: "Moncton" },
];

export function cityLabel(code: string): string {
  return CITIES.find((c) => c.code === code)?.label ?? code;
}
