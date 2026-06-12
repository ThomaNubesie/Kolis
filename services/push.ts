import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Expo push notifications for Kolis. The token is stored on the signed-in
// courier's kolis_profiles row so the kolis-notify Edge Function can push
// delivery requests ("a parcel was assigned to you / is available") server-side.

let _handlerSet = false;

async function ensureHandler() {
  if (_handlerSet) return;
  const Notifications = await import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Kolis",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  _handlerSet = true;
}

export const PushAPI = {
  // Request permission, get the Expo push token, and persist it on the current
  // courier. Safe to call on every app start / auth change — no-ops when
  // permission is denied or no user is signed in.
  async register(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await ensureHandler();
      const Notifications = await import("expo-notifications");

      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") return;

      const projectId =
        (Constants.expoConfig?.extra as any)?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      const token = tokenResp.data;
      if (!token) return;

      await supabase.from("kolis_profiles").update({ push_token: token }).eq("id", user.id);
    } catch {
      // Push is best-effort; never block the app on it.
    }
  },
};
