import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
// the app is next opened, so the disclosure doesn't nag every 2 minutes. Once the
// courier has accepted it, it is never shown again (permission problems after
// that go to Settings, not back to the disclosure — it used to loop on iOS).
const ACCEPTED_KEY = "kolis.locationDisclosureAccepted";
export function useDeliveryTracking() {
  const [needDisclosure, setNeedDisclosure] = useState(false);
  const declined = useRef(false);
  const accepted = useRef<boolean | null>(null);   // null = not read from storage yet

  const reconcile = useCallback(async () => {
    try {
      const carry = await CourierAPI.carrying().catch(() => []);
      const mine = (carry ?? []).some((p) => p.accepted_via === "kolis");
      if (!mine) { setNeedDisclosure(false); await stopBackgroundTracking(); return; }
      if (await hasBackgroundPermission()) { setNeedDisclosure(false); await startBackgroundTracking(); return; }
      if (accepted.current === null) accepted.current = (await AsyncStorage.getItem(ACCEPTED_KEY).catch(() => null)) === "1";
      if (!declined.current && !accepted.current) setNeedDisclosure(true);
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
    accepted.current = true;
    AsyncStorage.setItem(ACCEPTED_KEY, "1").catch(() => {});
    // Let the disclosure sheet finish closing first: iOS can silently skip its
    // permission alert when it's requested while a modal is still dismissing.
    await new Promise((r) => setTimeout(r, 700));
    const ok = await startBackgroundTracking({ request: true });
    if (!ok) {
      Alert.alert(
        "Kolis",
        "Location isn't allowed for Kolis. To share your position while delivering, open Settings → Kolis → Location and choose “Always” (Android: “Allow all the time”).\n\nLa localisation n'est pas autorisée pour Kolis. Ouvrez Réglages → Kolis → Position et choisissez « Toujours ».",
        [{ text: "Not now / Pas maintenant", style: "cancel" }, { text: "Settings / Réglages", onPress: () => Linking.openSettings().catch(() => {}) }],
      );
    }
  }, []);
  const decline = useCallback(() => { declined.current = true; setNeedDisclosure(false); }, []);

  return { needDisclosure, accept, decline };
}
