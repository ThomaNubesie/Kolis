import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { HubsAPI, Hub } from "../../services/hubs";
import { regionCode } from "../../constants/geo";

export default function HubScreen() {
  const { t } = useStrings();
  const router = useRouter();
  const p = useLocalSearchParams<{ drop: string; size: string; from: string; to: string; price: string }>();
  const city = p.from || "";
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    HubsAPI.listActive().then(({ hubs }) => {
      const match = hubs.find((h) => regionCode(h.city) === regionCode(city)) ?? null;
      setHub(match);
      setLoading(false);
    });
  }, [city]);

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} /></SafeAreaView>;
  }

  const go = () => {
    if (!hub) return;
    router.push({ pathname: "/(app)/confirm", params: { ...p, pickup_hub: hub.id, hubName: hub.name } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>

        {!hub ? (
          <Text style={{ color: Colors.t2, marginTop: 30, textAlign: "center" }}>{t("noDriversNow", { city, h: 2 })}</Text>
        ) : (
          <>
            <Text style={{ fontSize: 23, fontWeight: "800", color: Colors.ink, marginBottom: 14 }}>{hub.name}</Text>
            <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 12 }}>
              <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600" }}>{t("fAddress")}</Text>
              <Text style={{ fontWeight: "700", fontSize: 15, color: Colors.ink, marginTop: 3 }}>{hub.address || hub.city}</Text>
              <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 2 }}>{hub.hours || t("hubOpen")}</Text>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
