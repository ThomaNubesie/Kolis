// Notifications (mockup A3). No persisted feed yet — clean empty state; push
// notifications still arrive on-device via the existing channels.
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";

export default function Notifications() {
  const { t } = useStrings();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ padding: 18, flex: 1 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink, marginBottom: 18 }}>{t("notifications")}</Text>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 }}>
          <Text style={{ fontSize: 42 }}>🔔</Text>
          <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, marginTop: 12 }}>{t("noNotifications")}</Text>
          <Text style={{ fontSize: 12.5, color: Colors.t3, textAlign: "center", marginTop: 4, maxWidth: 240 }}>{t("noNotificationsSub")}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
