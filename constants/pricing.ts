import { regionCode } from "./geo";

export type SizeKey = "envelope" | "small" | "large";
export type DropType = "hub" | "zone" | "door";

// Distance-based pricing, calibrated so Ottawa <-> Montréal (~200 km), small
// parcel, lands at ~C$20. Tune BASE / PER_KM with real courier rate cards.
const BASE = 7;          // C$ floor
const PER_KM = 0.06;     // C$ per km

const SIZE_MULT: Record<SizeKey, number> = { envelope: 0.75, small: 1.0, large: 1.6 };
// Hub = cheapest (you drop + recipient collects), door = full pickup + delivery.
const MODE_MULT: Record<DropType, number> = { hub: 1.0, zone: 1.05, door: 1.4 };

// Express courier (Canada Post / UPS / FedEx) is pricier AND slower — used for
// the savings comparison. Adjust the multiplier against real quotes.
const COURIER_MULT = 1.9;
const COURIER_DAYS = 2;

// Approximate road distances (km) between region codes. Default 250; floor 30.
const ROUTE_KM: Record<string, number> = {
  "montreal-ottawa": 200, "kingston-ottawa": 195, "ottawa-toronto": 450, "gatineau-ottawa": 20,
  "ottawa-quebec": 480, "ottawa-trois-rivieres": 360, "ottawa-sherbrooke": 380,
  "chicoutimi-ottawa": 660, "moncton-ottawa": 1100,
  "montreal-quebec": 250, "montreal-trois-rivieres": 140, "montreal-toronto": 540,
  "kingston-montreal": 290, "gatineau-montreal": 200, "montreal-sherbrooke": 150,
  "chicoutimi-montreal": 460, "moncton-montreal": 1100,
  "quebec-trois-rivieres": 130, "chicoutimi-quebec": 210, "quebec-sherbrooke": 240,
  "kingston-toronto": 260,
};

export function routeKm(from: string, to: string): number {
  const a = regionCode(from), b = regionCode(to);
  if (!a || !b || a === b) return 30;
  const key = [a, b].sort().join("-");
  return ROUTE_KM[key] ?? 250;
}

export function estimatePrice(size: SizeKey, drop: DropType, from: string, to: string): number {
  const km = routeKm(from, to);
  const raw = (BASE + PER_KM * km) * SIZE_MULT[size] * MODE_MULT[drop];
  return Math.round(raw);
}

export type Comparison = {
  price: number;
  courier: number;
  saved: number;
  courierDays: number;
  hours: number;
  km: number;
};

export function compare(size: SizeKey, drop: DropType, from: string, to: string): Comparison {
  const price = estimatePrice(size, drop, from, to);
  const courier = Math.round(price * COURIER_MULT);
  return { price, courier, saved: Math.max(0, courier - price), courierDays: COURIER_DAYS, hours: 4, km: routeKm(from, to) };
}
