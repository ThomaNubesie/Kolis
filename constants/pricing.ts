import { regionCode } from "./geo";

export type SizeKey = "envelope" | "small" | "large";
export type DropType = "hub" | "zone" | "door";

// Distance-based pricing. Hub & Zone share one rate; Door-to-door is its own
// (higher) rate. Calibrated to Ottawa <-> Montréal (~200 km), small parcel:
//   Hub/Zone = $30, Door = $45. Tune against real courier rate cards.
const HUB_BASE = 10, HUB_PER_KM = 0.10;   // hub & zone customer price
const DOOR_BASE = 5, DOOR_PER_KM = 0.20;  // door-to-door customer price ($/km over full route)

const SIZE_MULT: Record<SizeKey, number> = { envelope: 0.75, small: 1.0, large: 1.6 };

// Driver's cut of the customer price. Hub/Zone ~2/3 ($20 of $30); Door 45%.
const DRIVER_SHARE: Record<DropType, number> = { hub: 2 / 3, zone: 2 / 3, door: 0.45 };

// Express courier (Canada Post / UPS / FedEx) baseline — pricier AND ~2 days slower.
const COURIER_MULT = 1.4;
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
  return ROUTE_KM[[a, b].sort().join("-")] ?? 250;
}

export function estimatePrice(size: SizeKey, drop: DropType, from: string, to: string): number {
  const km = routeKm(from, to);
  const base = drop === "door" ? DOOR_BASE + DOOR_PER_KM * km : HUB_BASE + HUB_PER_KM * km;
  return Math.round(base * SIZE_MULT[size]);
}

// Driver payout in cents, from the (already-rounded) customer price in cents.
export function driverPayoutCents(priceCents: number, drop: DropType): number {
  return Math.round(priceCents * DRIVER_SHARE[drop]);
}

export type Comparison = {
  price: number;
  courier: number;
  saved: number;
  courierDays: number;
  hours: number;
  km: number;
  payout: number;
};

export function compare(size: SizeKey, drop: DropType, from: string, to: string): Comparison {
  const price = estimatePrice(size, drop, from, to);
  const courier = Math.round(price * COURIER_MULT);
  return {
    price,
    courier,
    saved: Math.max(0, courier - price),
    courierDays: COURIER_DAYS,
    hours: 4,
    km: routeKm(from, to),
    payout: Math.round(driverPayoutCents(price * 100, drop) / 100),
  };
}
