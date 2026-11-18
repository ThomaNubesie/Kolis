import * as Location from "expo-location";
import { Platform } from "react-native";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

// Background location for a Kolis courier carrying a parcel. Mirrors LoadQ's
// background task: keeps the courier's position fresh even with the app closed
// so senders/admin/orgs see a live map + ETA. Reports through kolis_report_location
// into public.kolis_driver_locations (keyed by the courier's kolis_profiles id).
//
// Tracking ownership: a parcel accepted in Kolis is tracked by Kolis (this);
// a parcel accepted in LoadQ is tracked by LoadQ. Each app only runs its task
// while THIS app's courier is carrying.
export const BG_LOCATION_TASK = "kolis-bg-location";

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locs = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const loc = locs?.[locs.length - 1];
  if (!loc) return;
  try {
    await supabase.rpc("kolis_report_location", {
      p_lat: loc.coords.latitude,
      p_lng: loc.coords.longitude,
    });
  } catch {
    /* best effort — the next fix retries */
  }
});

// Can tracking run? (No prompt.)
//   iOS: "While Using" is enough — the app has the `location` background mode, so
//        updates started while it's open keep running in the background (iOS shows
//        the blue location indicator). "Always" is a nice-to-have upgrade, not a
//        requirement; requiring it meant most couriers were never tracked.
//   Android: "While using the app" is enough too — tracking runs as a visible
//        foreground service ("Kolis is sharing your location" notification),
//        started while the app is open, which Android allows without
//        ACCESS_BACKGROUND_LOCATION. The app doesn't declare that permission at all
//        (blocked in app.json), so no background-location review is involved.
export async function hasBackgroundPermission(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    return fg.status === "granted";
  } catch { return false; }
}

// Last failure, so the Carrying screen can show WHY tracking isn't running
// instead of failing silently (it hid a real iOS problem for a whole afternoon).
let lastError: string | null = null;

export type TrackingStatus = { active: boolean; permission: "granted" | "denied" | "undetermined"; error: string | null };
export async function getTrackingStatus(): Promise<TrackingStatus> {
  let permission: TrackingStatus["permission"] = "undetermined";
  try { permission = (await Location.getForegroundPermissionsAsync()).status as TrackingStatus["permission"]; } catch { /* keep */ }
  let active = false;
  try { active = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK); } catch { /* keep */ }
  return { active, permission, error: lastError };
}

// Start streaming. With `request`, asks for Always/background permission first —
// only ever call that right after the courier accepted the in-app disclosure
// (components/LocationDisclosure.tsx; Google Play prominent-disclosure policy).
// Without it, starts only if permission was already granted. Idempotent.
export async function startBackgroundTracking(opts: { request?: boolean } = {}): Promise<boolean> {
  try {
    if (opts.request) {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") { lastError = "permission_denied"; return false; }
      // iOS: also offer the optional "Always" upgrade. Android: never — the app
      // doesn't declare ACCESS_BACKGROUND_LOCATION (foreground service instead).
      if (Platform.OS === "ios") await Location.requestBackgroundPermissionsAsync().catch(() => null);
    } else if (!(await hasBackgroundPermission())) {
      lastError = "permission_denied";
      return false;
    }
    // Always (re)start rather than returning early when a task is already
    // registered: re-registering applies the current options, so a task left
    // over from an older version (e.g. without the iOS background indicator)
    // picks up today's settings.
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 120,
      timeInterval: 60_000,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      // iOS: show the blue location indicator while tracking in the background —
      // required for "While Using" tracking to continue, and honest with the courier.
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Kolis is sharing your location",
        notificationBody: "The sender and dispatch can see your position and ETA while you deliver.",
        notificationColor: "#E11D6B",
      },
    });
    lastError = null;
    return true;
  } catch (e) {
    lastError = String((e as Error)?.message ?? e);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } catch {
    /* ignore */
  }
}
