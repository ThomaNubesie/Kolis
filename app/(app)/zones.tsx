import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ZONES } from "../../constants/zones";

export default function Zones() {
  const { t } = useStrings();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode: string; size: string; from: string; to: string; price: string }>();
  const [sel, setSel] = useState(ZONES[0].id);

  const next = () => {
    const zone = ZONES.find((z) => z.id === sel)!;
    router.push({ pathname: "/(app)/confirm", params: { ...params, pickup_zone: zone.name } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("pickZone")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginTop: 4, marginBottom: 16 }}>{t("zonesNear")}</Text>
        {ZONES.map((z) => {
          const on = z.id === sel;
          return (
            <Pressable key={z.id} onPress={() => setSel(z.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 12, marginBottom: 9, backgroundColor: "#fff", borderColor: on ? Colors.accent : Colors.line }}>
              <Text style={{ fontSize: 17 }}>🏁</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: Colors.ink }}>{z.name}</Text>
                <Text style={{ fontSize: 11, color: Colors.t3 }}>{t("driversQueued", { n: z.drivers, city: params.to ?? "" })}</Text>
              </View>
              <Text style={{ fontWeight: "800", fontSize: 12.5, color: Colors.accent }}>{z.km} km</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={next} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 6 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("useThisZone")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
