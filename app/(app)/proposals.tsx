// Courier proposals — parcels proposed to this verified Kolis member (hub/door
// rules in kolis_available_parcels). Accept is the same atomic claim as LoadQ.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI, CourierParcel } from "../../services/courier";

const SIZE_EMOJI: Record<string, string> = { envelope: "✉️", small: "📦", large: "🧳" };

export default function Proposals() {
  const { t } = useStrings();
  const [list, setList] = useState<CourierParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    CourierAPI.proposals().then(setList).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = async (p: CourierParcel) => {
    setBusyId(p.id);
    const ok = await CourierAPI.accept(p.id);
    setBusyId(null);
    if (!ok) { Alert.alert("Kolis", t("proposalGone")); load(); return; }
    Alert.alert(t("acceptedTitle"), t("acceptedBody"));
    load();
  };

  const payout = (p: CourierParcel) => Math.round((p.driver_payout_cents ?? 0) / 100);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}
      >
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 4 }}>{t("proposals")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginBottom: 18 }}>{t("proposalsSub")}</Text>

        {!loading && list.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, marginTop: 12 }}>{t("noProposals")}</Text>
            <Text style={{ fontSize: 12.5, color: Colors.t3, textAlign: "center", marginTop: 4, maxWidth: 240 }}>{t("noProposalsSub")}</Text>
          </View>
        )}

        {list.map((p) => {
          const isHub = p.dropoff_type === "hub";
          const where = isHub ? (p.pickup_hub_name || t("proposalHub")) : `${t("proposalDoor")} · ${p.from_city}`;
          return (
            <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 16, padding: 15, marginBottom: 12, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 24 }}>{SIZE_EMOJI[p.size] ?? "📦"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink }}>#{p.code} · {t("forCity", { city: p.to_city })}</Text>
                    <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{isHub ? "🏢" : "🚪"} {isHub ? t("proposalHub") : t("proposalDoor")}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: "rgba(46,204,143,0.14)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: "#178a5e", fontWeight: "800", fontSize: 13 }}>{t("payoutBadge", { amount: payout(p) })}</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: Colors.line, marginTop: 12, paddingTop: 10, marginBottom: 12 }}>
                <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("pickupAt")}</Text>
                <Text style={{ fontSize: 13, color: Colors.ink, fontWeight: "600", marginTop: 2 }}>{where}</Text>
              </View>

              <Pressable onPress={() => accept(p)} disabled={busyId === p.id} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", opacity: busyId === p.id ? 0.7 : 1 }}>
                {busyId === p.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("acceptParcel", { amount: payout(p) })}</Text>}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
