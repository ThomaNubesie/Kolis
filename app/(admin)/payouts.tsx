import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AdminAPI, PendingPayout } from "../../services/admin";

export default function Payouts() {
  const { t } = useStrings();
  const router = useRouter();
  const [list, setList] = useState<PendingPayout[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => { AdminAPI.pendingPayouts().then(setList).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markPaid = (p: PendingPayout) => {
    Alert.alert(t("markPaid"), `${p.driver_name ?? ""} · C$${Math.round(p.pending_cents / 100)}`, [
      { text: t("cancel"), style: "cancel" },
      { text: t("markPaid"), onPress: async () => { await AdminAPI.markPaid(p.driver_id); load(); } },
    ]);
  };

  const autoSend = async (p: PendingPayout) => {
    setBusyId(p.driver_id);
    const { ok, error } = await AdminAPI.autoPay(p.driver_id);
    setBusyId(null);
    if (!ok) { Alert.alert(t("autoSend"), error === "provider_not_configured" ? t("autoNotConfigured") : (error ?? "")); return; }
    load();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("admin")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("payouts")}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t2, marginBottom: 14 }}>{t("payoutsSub")}</Text>
        {list.length === 0 && <Text style={{ color: Colors.t2, textAlign: "center", marginTop: 40 }}>{t("noPayouts")}</Text>}
        {list.map((p) => (
          <View key={p.driver_id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 15, color: Colors.ink }}>{p.driver_name || p.driver_id.slice(0, 8)}</Text>
                <Text style={{ fontSize: 11.5, color: p.interac_email ? Colors.t2 : Colors.accentDk, marginTop: 2 }}>{p.interac_email || t("noInterac")}</Text>
                <Text style={{ fontSize: 11, color: Colors.t3, marginTop: 1 }}>{p.parcels} · {t("pendingLabel")}</Text>
              </View>
              <Text style={{ fontWeight: "800", fontSize: 20, color: Colors.green }}>C${Math.round(p.pending_cents / 100)}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 11 }}>
              <Pressable onPress={() => autoSend(p)} disabled={busyId === p.driver_id || !p.interac_email} style={{ flex: 1, backgroundColor: p.interac_email ? Colors.accent : Colors.line, borderRadius: 10, padding: 11, alignItems: "center" }}>
                {busyId === p.driver_id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>⚡ {t("autoSend")}</Text>}
              </Pressable>
              <Pressable onPress={() => markPaid(p)} style={{ flex: 1, borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 10, padding: 11, alignItems: "center" }}>
                <Text style={{ color: Colors.ink, fontWeight: "800", fontSize: 13 }}>✓ {t("markPaid")}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
