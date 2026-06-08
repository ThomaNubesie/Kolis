import { View, Text, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";

export default function RequestPlaced() {
  const { t } = useStrings();
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; to: string; mode: string; zone: string }>();
  const msg = p.mode === "zone"
    ? t("delegating", { zone: p.zone || "the zone", city: p.to || "" })
    : t("matching", { city: p.to || "" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, padding: 24, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.green, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Text style={{ color: "#fff", fontSize: 36 }}>✓</Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink, marginBottom: 8 }}>{t("requestPlaced")}</Text>
      <Text style={{ fontSize: 14, color: Colors.t2, textAlign: "center", lineHeight: 20, marginBottom: 18 }}>{msg}</Text>
      <View style={{ backgroundColor: Colors.cardAlt, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 24 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: Colors.t2 }}>⏱ {t("usuallyMatched")}</Text>
      </View>
      <Pressable onPress={() => router.replace({ pathname: "/(app)/track", params: { id: p.id } })}
        style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", alignSelf: "stretch" }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("trackShipment")}</Text>
      </Pressable>
      <Pressable onPress={() => router.replace("/(app)/shipments")} style={{ marginTop: 14 }}>
        <Text style={{ color: Colors.t3, fontSize: 13 }}>{t("done")}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
