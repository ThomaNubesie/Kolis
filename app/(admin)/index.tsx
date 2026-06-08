import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";

export default function AdminHome() {
  const { t } = useStrings();
  const router = useRouter();

  const Row = ({ icon, label, to }: { icon: string; label: string; to: string }) => (
    <Pressable onPress={() => router.push(to as any)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: Colors.line }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.ink }}>{label}</Text>
      <Text style={{ marginLeft: "auto", color: Colors.t3 }}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <Pressable onPress={() => router.replace("/(app)/profile")}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 8 }}>← {t("tabProfile")}</Text></Pressable>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink }}>{t("admin")}</Text>
        <Text style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: "800", color: Colors.accentDk, backgroundColor: "rgba(225,29,107,0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6, marginBottom: 8, overflow: "hidden" }}>🔒 {t("adminGate")}</Text>
        <Row icon="🏢" label={t("adminHubs")} to="/(admin)/hubs" />
        <Row icon="🏁" label={t("adminZones")} to="/(admin)/zones" />
        <Row icon="🚚" label={t("adminDispatch")} to="/(admin)/dispatch" />
        <Row icon="💸" label={t("payouts")} to="/(admin)/payouts" />
      </ScrollView>
    </SafeAreaView>
  );
}
