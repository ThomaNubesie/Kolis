// Bridge from the QR scanner (app/(app)/scan.tsx) to the Carrying screen.
// When the driver scans a parcel's QR and is inside the 100 m geofence, the
// server reveals the pickup/delivery code. We stash it here so the matching
// code input on the Carrying card auto-fills — the driver never types it, and
// the code is never printed on the label.
type Kind = "pickup" | "delivery";
type Entry = { kind: Kind; code: string };

const store: Record<string, Entry> = {};

export function stashScannedCode(parcelId: string, kind: Kind, code: string) {
  store[parcelId] = { kind, code };
}

// Consume everything stashed since the last drain (clears the store).
export function drainScannedCodes(): Record<string, Entry> {
  const copy = { ...store };
  for (const k of Object.keys(store)) delete store[k];
  return copy;
}
