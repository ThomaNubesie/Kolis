export type SizeKey = "envelope" | "small" | "large";

// Placeholder pricing model — firm up with the real route/distance logic later.
const BASE: Record<SizeKey, number> = { envelope: 6, small: 9, large: 16 };

// Loading-zone drop-off is the cheapest; door-to-door adds a pickup fee.
export function estimatePrice(size: SizeKey, mode: "zone" | "door"): number {
  const base = BASE[size];
  return mode === "door" ? base + 5 : base;
}
