export type SizeKey = "envelope" | "small" | "large";
export type DropType = "hub" | "zone" | "door";

// Placeholder pricing — firm up with the real route/distance logic later.
const BASE: Record<SizeKey, number> = { envelope: 6, small: 9, large: 16 };

// Typical express-courier price for the same parcel (illustrative baseline used
// for the savings comparison). Express couriers are also slower (1–2+ days).
const COURIER: Record<SizeKey, number> = { envelope: 18, small: 26, large: 48 };
const COURIER_DAYS = 2;

// Hub + zone drop-off are cheapest; door-to-door adds a pickup fee.
export function estimatePrice(size: SizeKey, drop: DropType): number {
  return drop === "door" ? BASE[size] + 5 : BASE[size];
}

export type Comparison = {
  price: number;
  courier: number;
  saved: number;
  courierDays: number;
  hours: number;
};

export function compare(size: SizeKey, drop: DropType): Comparison {
  const price = estimatePrice(size, drop);
  const courier = COURIER[size];
  return { price, courier, saved: Math.max(0, courier - price), courierDays: COURIER_DAYS, hours: 4 };
}
