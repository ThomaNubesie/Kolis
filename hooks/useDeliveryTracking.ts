import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { hasBackgroundPermission, startBackgroundTracking, stopBackgroundTracking } from "../services/backgroundLocation";
import { CourierAPI } from "../services/courier";

// Runs background location while this courier is carrying a parcel they accepted
// in Kolis (accepted_via 'kolis'); stops otherwise. Parcels accepted in LoadQ
// are tracked by the LoadQ app, so we ignore them here (no double reporting).
// Mounted once from the authenticated (app) layout; re-checks on foreground and
// on a slow timer so a delivered parcel stops tracking.
//
// Permission is never requested silently: if it isn't granted yet, the hook asks
// the layout to show the prominent disclosure (LocationDisclosure), and only the
// courier's "Continue" triggers the system prompt. "Not now" is remembered until
// the app is next opened, so the disclosure doesn't nag every 2 minutes.
export function useDeliveryTracking() {
  const [needDisclosure, setNeedDisclosure] = useState(false);
  const declined = useRef(false);

  const reconcile = useCallback(async () => {
    try {
      const carry = await CourierAPI.carrying().catch(() => []);
      const mine = (carry ?? []).some((p) => p.accepted_via === "kolis");
      if (!mine) { setNeedDisclosure(false); await stopBackgroundTracking(); return; }
      if (await hasBackgroundPermission()) { setNeedDisclosure(false); await startBackgroundTracking(); return; }
      if (!declined.current) setNeedDisclosure(true);
    } catch {
      /* best effort — next tick retries */
    }
  }, []);

  useEffect(() => {
    reconcile();
    const iv = setInterval(reconcile, 120_000);
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") { declined.current = false; reconcile(); }
    });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [reconcile]);

  const accept = useCallback(async () => {
    setNeedDisclosure(false);
    await startBackgroundTracking({ request: true });
  }, []);
  const decline = useCallback(() => { declined.current = true; setNeedDisclosure(false); }, []);

  return { needDisclosure, accept, decline };
}
