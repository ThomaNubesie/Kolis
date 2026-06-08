import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Switch } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { LoadqAPI, LoadqZone } from "../../services/loadq";

export default function AdminZones() {
  const { t } = useStrings();
  const router = useRouter();
  const [zones, setZones] = useState<LoadqZone[]>([]);
  const [queued, setQueued] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [z, q, s] = await Promise.all([LoadqAPI.zones(), LoadqAPI.queuedByZone(), LoadqAPI.zoneSettings()]);
    setZones(z.zones); setQueued(q); setEnabled(s);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOn = (id: string) => enabled[id] !== false; // missing row defaults to enabled
  const toggle = async (id: string) => {
    const next = !isOn(id);
    setEnabled((e) => ({ ...e, [id]: next }));
    await LoadqAPI.setZoneEnabled(id, next);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("admin")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("adminZones")}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t2, marginBottom: 14 }}>{t("zonesSub")}</Text>
        {zones.map((z) => {
          const n = queued[z.id] ?? 0;
          const on = isOn(z.id);
          return (
            <View key={z.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, padding: 11, backgroundColor: "#fff", marginBottom: 8, opacity: on ? 1 : 0.6 }}>
              <Text style={{ fontSize: 16 }}>🏁</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: Colors.ink }}>{z.name}</Text>
                <Text style={{ fontSize: 11, color: Colors.t3 }}>{z.region || ""}</Text>
              </View>
              <Text style={{ fontSize: 10, fontWeight: "800", color: n > 0 ? "#178a5e" : Colors.t3, backgroundColor: n > 0 ? "rgba(46,204,143,0.15)" : Colors.cardAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" }}>{t("queuedN", { n })}</Text>
              <Switch value={on} onValueChange={() => toggle(z.id)} trackColor={{ true: Colors.accent, false: "#cfcabb" }} />
            </View>
          );
        })}
        <Text style={{ fontSize: 11, color: Colors.t3, textAlign: "center", marginTop: 8, lineHeight: 15 }}>{t("managedInLoadq")}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
