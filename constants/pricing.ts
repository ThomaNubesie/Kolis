export type SizeKey = "envelope" | "small" | "large";

// Placeholder pricing — firm up with the real route/distance logic later.
const BASE: Record<SizeKey, number> = { envelope: 6, small: 9, large: 16 };

// Typical express-courier price for the same parcel (illustrative baseline used
// for the savings comparison). Express couriers are also slower (1–2+ days).
const COURIER: Record<SizeKey, number> = { envelope: 18, small: 26, large: 48 };
const COURIER_DAYS = 2; // express courier typical transit (business days)

// Loading-zone drop-off is cheapest; door-to-door adds a pickup fee.
export function estimatePrice(size: SizeKey, mode: "zone" | "door"): number {
  return mode === "door" ? BASE[size] + 5 : BASE[size];
}

export type Comparison = {
  price: number;        // Kolis price
  courier: number;      // express-courier baseline
  saved: number;        // dollars saved vs courier
  courierDays: number;  // courier transit days
  hours: number;        // Kolis typical delivery (hours)
};

export function compare(size: SizeKey, mode: "zone" | "door"): Comparison {
  const price = estimatePrice(size, mode);
  const courier = COURIER[size];
  return {
    price,
    courier,
    saved: Math.max(0, courier - price),
    courierDays: COURIER_DAYS,
    hours: 4, // intercity same-day, measured in hours
  };
}
