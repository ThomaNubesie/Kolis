export type Zone = { id: string; name: string; drivers: number; km: number };

// Static LoadQ loading zones (placeholder — wire to the LoadQ zones table later).
export const ZONES: Zone[] = [
  { id: "bayview", name: "Bayview Station lot", drivers: 12, km: 0.8 },
  { id: "byward", name: "ByWard Market", drivers: 5, km: 2.1 },
  { id: "stlaurent", name: "St-Laurent Centre", drivers: 8, km: 4.6 },
  { id: "hurdman", name: "Hurdman Station", drivers: 3, km: 5.0 },
];
