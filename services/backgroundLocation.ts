import * as Location from "expo-location";
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

// Ask for Always/background permission and start streaming. Idempotent.
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return false;
    if (await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 120,
      timeInterval: 60_000,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "Kolis is sharing your location",
        notificationBody: "The sender and dispatch can see your position and ETA while you deliver.",
        notificationColor: "#E11D6B",
      },
    });
    return true;
  } catch {
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
