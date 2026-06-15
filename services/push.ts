import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { supabase } from "./supabase";

// Expo push notifications for Kolis. The token is stored on the signed-in
// courier's kolis_profiles row so the kolis-notify Edge Function can push
// delivery requests ("a parcel was assigned to you / is available") server-side.

let _handlerSet = false;
let _listenersSet = false;

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
    // Parcel requests: a separate MAX-importance channel so they chime loudly,
    // pop as a heads-up, and stay in the tray until the courier acts on them.
    await Notifications.setNotificationChannelAsync("parcel-requests", {
      name: "Delivery requests",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300],
      sound: "default",
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  ensureListeners(Notifications);
  _handlerSet = true;
}

// Tap a parcel request → open the requests screen and clear its sticky copy.
// Receiving one in the foreground → keep an ongoing (sticky) notification so it
// can't be swiped away until the courier opens it.
function ensureListeners(Notifications: typeof import("expo-notifications")) {
  if (_listenersSet) return;
  _listenersSet = true;
  try {
    Notifications.addNotificationResponseReceivedListener((resp) => {
      const data: any = resp?.notification?.request?.content?.data ?? {};
      if (data.persistent && data.parcel_id) Notifications.dismissNotificationAsync(`req-${data.parcel_id}`).catch(() => {});
      if (data.parcel_id) { try { router.push("/(app)/proposals"); } catch { /* ignore */ } }
    });
    Notifications.addNotificationReceivedListener(async (n) => {
      const data: any = n?.request?.content?.data ?? {};
      if (Platform.OS !== "android" || !data.persistent || !data.parcel_id) return;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `req-${data.parcel_id}`,
          content: { title: n.request.content.title ?? "New delivery request", body: n.request.content.body ?? "", data, sticky: true, autoDismiss: false, sound: "default" },
          trigger: null,
        });
      } catch { /* best-effort */ }
    });
  } catch { /* listeners are best-effort */ }
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
