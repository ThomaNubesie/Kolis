import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { startBackgroundTracking, stopBackgroundTracking } from "../services/backgroundLocation";
import { CourierAPI } from "../services/courier";

// Runs background location while this courier is carrying a parcel they accepted
// in Kolis (accepted_via 'kolis'); stops otherwise. Parcels accepted in LoadQ
// are tracked by the LoadQ app, so we ignore them here (no double reporting).
// Mounted once from the authenticated (app) layout; re-checks on foreground and
// on a slow timer so a delivered parcel stops tracking.
export function useDeliveryTracking() {
  const reconcile = useCallback(async () => {
    try {
      const carry = await CourierAPI.carrying().catch(() => []);
      const mine = (carry ?? []).some((p) => p.accepted_via === "kolis");
      if (mine) await startBackgroundTracking();
      else await stopBackgroundTracking();
    } catch {
      /* best effort — next tick retries */
    }
  }, []);

  useEffect(() => {
    reconcile();
    const iv = setInterval(reconcile, 120_000);
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") reconcile();
    });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [reconcile]);
}
