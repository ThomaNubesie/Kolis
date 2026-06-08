import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";

export default function Hub() {
  const { t } = useStrings();
  const router = useRouter();
  const p = useLocalSearchParams<{ drop: string; size: string; from: string; to: string; price: string }>();
  const city = p.from || "Ottawa";

  const go = () => router.push({ pathname: "/(app)/confirm", params: { ...p, pickup_hub: `${city} hub` } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 23, fontWeight: "800", color: Colors.ink, marginBottom: 14 }}>{t("hubAt", { city })}</Text>

        <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 12 }}>
          <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>{t("hubAddress")}</Text>
          <Text style={{ fontWeight: "700", fontSize: 15, color: Colors.ink, marginTop: 3 }}>Bayview Station · Bay 4</Text>
          <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 2 }}>{t("hubOpen")}</Text>
        </View>

        <View style={{ backgroundColor: Colors.cardAlt, borderRadius: 12, padding: 13, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: Colors.t2, lineHeight: 19 }}>🏢 {t("hubPromise", { city: p.to || "" })}</Text>
        </View>
        <View style={{ backgroundColor: "rgba(46,204,143,0.12)", borderRadius: 12, padding: 11, marginBottom: 18 }}>
          <Text style={{ color: "#178a5e", fontWeight: "700", fontSize: 12.5 }}>⏱ {t("dispatchedSameDay")}</Text>
        </View>

        <Pressable onPress={go} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("confirmHubBtn", { city })}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
