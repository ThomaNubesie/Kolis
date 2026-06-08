import { Tabs } from "expo-router";
import { Text } from "react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";

export default function AppLayout() {
  const { t } = useStrings();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.t3,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: Colors.line },
      }}
    >
      <Tabs.Screen name="send" options={{ title: t("tabSend"), tabBarIcon: () => <Text style={{ fontSize: 18 }}>📦</Text> }} />
      <Tabs.Screen name="shipments" options={{ title: t("tabShipments"), tabBarIcon: () => <Text style={{ fontSize: 18 }}>🚚</Text> }} />
      <Tabs.Screen name="profile" options={{ title: t("tabProfile"), tabBarIcon: () => <Text style={{ fontSize: 18 }}>👤</Text> }} />
      {/* Non-tab screens (pushed full-screen, hidden from the tab bar) */}
      <Tabs.Screen name="zones" options={{ href: null }} />
      <Tabs.Screen name="confirm" options={{ href: null }} />
      <Tabs.Screen name="request" options={{ href: null }} />
      <Tabs.Screen name="track" options={{ href: null }} />
    </Tabs>
  );
}
