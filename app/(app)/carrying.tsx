// Parcels this courier is carrying + deliver via the recipient's 4-digit code
// (captures the escrow through kolis-finalize-payment). Courier never sees the
// sender's price — only their own payout.
import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI, CourierParcel } from "../../services/courier";

const SIZE_EMOJI: Record<string, string> = { envelope: "✉️", small: "📦", large: "🧳" };

export default function Carrying() {
  const { t } = useStrings();
  const [list, setList] = useState<CourierParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    CourierAPI.carrying().then(setList).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deliver = async (p: CourierParcel) => {
    const code = (codes[p.id] || "").trim();
    if (code.length < 4) return;
    setBusyId(p.id);
    const { ok, error } = await CourierAPI.deliver(p.id, code);
    setBusyId(null);
    if (!ok) { Alert.alert("Kolis", error === "bad_code" ? t("badCode") : (error || t("badCode"))); return; }
    setCodes((c) => ({ ...c, [p.id]: "" }));
    Alert.alert("Kolis", t("delivered"));
    load();
  };

  const payout = (p: CourierParcel) => Math.round((p.driver_payout_cents ?? 0) / 100);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}
      >
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 4 }}>{t("carrying")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginBottom: 18 }}>{t("carryingSub")}</Text>

        {!loading && list.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 40 }}>🚚</Text>
            <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, marginTop: 12 }}>{t("noneCarrying")}</Text>
          </View>
        )}

        {list.map((p) => {
          const isHub = p.dropoff_type === "hub";
          const where = isHub ? (p.pickup_hub || "") : (p.pickup_addr || "");
          return (
            <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 16, padding: 15, marginBottom: 14, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <Text style={{ fontSize: 22 }}>{SIZE_EMOJI[p.size] ?? "📦"}</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, flex: 1 }}>#{p.code} {t("forDest")} {p.to_city}</Text>
              </View>
              {where ? (
                <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 2 }}>{isHub ? "🏢" : "🚪"} {isHub ? t("pickupHub") : t("pickupDoor")}: {where}</Text>
              ) : null}
              <Text style={{ fontSize: 11.5, color: Colors.t3, marginBottom: 12 }}>🔒 {t("recipientMasked")}</Text>

              <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{t("enterDeliveryCode")}</Text>
              <TextInput
                value={codes[p.id] || ""}
                onChangeText={(v) => setCodes((c) => ({ ...c, [p.id]: v.replace(/[^0-9]/g, "") }))}
                keyboardType="number-pad" maxLength={4} placeholder="••••" placeholderTextColor={Colors.t3}
                style={{ borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 11, padding: 12, fontSize: 22, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: Colors.ink, backgroundColor: Colors.bg, marginBottom: 10 }}
              />
              <Pressable onPress={() => deliver(p)} disabled={busyId === p.id || (codes[p.id] || "").trim().length < 4} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", opacity: (busyId === p.id || (codes[p.id] || "").trim().length < 4) ? 0.55 : 1 }}>
                {busyId === p.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("markDelivered")}</Text>}
              </Pressable>
              <Text style={{ color: "#178a5e", fontSize: 11.5, textAlign: "center", marginTop: 8, fontWeight: "700" }}>+C${payout(p)} {t("released")}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
