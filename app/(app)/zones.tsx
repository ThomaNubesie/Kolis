import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { LoadqAPI, LoadqZone } from "../../services/loadq";
import { regionCode } from "../../constants/geo";

export default function Zones() {
  const { t } = useStrings();
  const router = useRouter();
  const params = useLocalSearchParams<{ drop: string; size: string; from: string; to: string; price: string }>();
  const originRegion = regionCode(params.from ?? "");
  const destCode = regionCode(params.to ?? "");

  const [zones, setZones] = useState<LoadqZone[]>([]);
  const [avail, setAvail] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [z, a, s] = await Promise.all([LoadqAPI.zones(), LoadqAPI.availability(destCode), LoadqAPI.zoneSettings()]);
    setZones(z.zones); setAvail(a); setEnabled(s); setLoading(false);
  }, [destCode]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = zones.filter((z) => z.region === originRegion && enabled[z.id] !== false);
  const current = sel ?? visible.find((z) => (avail[z.id] ?? 0) > 0)?.id ?? visible[0]?.id ?? null;

  const next = () => {
    const zone = visible.find((z) => z.id === current);
    if (!zone) return;
    router.push({ pathname: "/(app)/confirm", params: { ...params, pickup_zone: zone.id, zoneName: zone.name } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.ink }}>{t("whereToDrop")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginTop: 4, marginBottom: 16 }}>{t("forRoute", { from: params.from ?? "", to: params.to ?? "" })}</Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 30 }} />
        ) : visible.length === 0 ? (
          <Text style={{ color: Colors.t2, textAlign: "center", marginTop: 30 }}>{t("noDriversNow", { city: params.to ?? "", h: 2 })}</Text>
        ) : (
          visible.map((z) => {
            const n = avail[z.id] ?? 0;
            const on = z.id === current;
            const has = n > 0;
            return (
              <Pressable key={z.id} onPress={() => setSel(z.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 12, marginBottom: 9, backgroundColor: "#fff", borderColor: on ? Colors.accent : Colors.line, opacity: has ? 1 : 0.6 }}>
                <Text style={{ fontSize: 17 }}>🏁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 14, color: Colors.ink }}>{z.name}</Text>
                  {has ? (
                    <Text style={{ fontSize: 11, color: Colors.green }}>{t("driversQueuedFor", { n, city: params.to ?? "" })}</Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: Colors.t3 }}>{t("noDriversNow", { city: params.to ?? "", h: 2 })}</Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}

        {visible.length > 0 && (
          <Pressable onPress={next} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 6 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("useThisZone")}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
