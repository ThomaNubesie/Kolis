import * as Location from "expo-location";

export type Coords = { lat: number; lng: number };

// One-shot current position. Returns null if permission is denied or unavailable.
export async function getMyLocation(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

// Watch position; calls back with each update. Returns an unsubscribe fn.
export async function watchLocation(
  onUpdate: (c: Coords) => void
): Promise<() => void> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return () => {};
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 5000 },
      (pos) => onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
