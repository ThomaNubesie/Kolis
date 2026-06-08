export type Zone = { id: string; name: string; drivers: number; km: number };

// Static LoadQ loading zones with live-queue counts for the destination.
// (Placeholder — wire `drivers` to LoadQ's live queue table once on the shared
// Supabase. A 0 count renders the "no drivers right now" state.)
export const ZONES: Zone[] = [
  { id: "bayview", name: "Bayview Station lot", drivers: 12, km: 0.8 },
  { id: "byward", name: "ByWard Market", drivers: 0, km: 2.1 },
  { id: "stlaurent", name: "St-Laurent Centre", drivers: 8, km: 4.6 },
  { id: "hurdman", name: "Hurdman Station", drivers: 3, km: 5.0 },
];

// Cities with a staffed Kolis drop-off hub (always-available, ops-dispatched —
// drivers may be on-platform or not). Expand the corridor list over time.
export const HUB_CITIES = ["Ottawa", "Montréal", "Montreal"];

export function hasHub(from: string): boolean {
  return HUB_CITIES.includes(from.trim());
}
