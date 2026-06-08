import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Switch } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { HubsAPI, Hub } from "../../services/hubs";

export default function AdminHubs() {
  const { t } = useStrings();
  const router = useRouter();
  const [hubs, setHubs] = useState<Hub[]>([]);

  const load = useCallback(() => { HubsAPI.listAll().then(({ hubs }) => setHubs(hubs)); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (h: Hub) => {
    setHubs((hs) => hs.map((x) => (x.id === h.id ? { ...x, is_active: !x.is_active } : x)));
    await HubsAPI.setActive(h.id, !h.is_active);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("admin")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("adminHubs")}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t2, marginBottom: 14 }}>{t("hubsSub")}</Text>
        {hubs.map((h) => (
          <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 9, opacity: h.is_active ? 1 : 0.6 }}>
            <Text style={{ fontSize: 18 }}>🏢</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 14, color: Colors.ink }}>{h.name}</Text>
              <Text style={{ fontSize: 11.5, color: Colors.t3 }}>{h.address || h.city}</Text>
            </View>
            <Switch value={h.is_active} onValueChange={() => toggle(h)} trackColor={{ true: Colors.accent, false: "#cfcabb" }} />
          </View>
        ))}
        <Pressable onPress={() => router.push("/(admin)/add-hub")} style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.accent, borderRadius: 13, padding: 14, alignItems: "center", marginTop: 4 }}>
          <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 13.5 }}>＋ {t("addHub")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
