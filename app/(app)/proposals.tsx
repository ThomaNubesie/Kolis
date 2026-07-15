// Courier proposals — parcels proposed to this verified Kolis member (hub/door
// rules in kolis_available_parcels). Accept is the same atomic claim as LoadQ.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI, CourierParcel } from "../../services/courier";

const SIZE_EMOJI: Record<string, string> = { envelope: "✉️", small: "📦", large: "🧳" };
const ETA_CHIPS = [10, 15, 20, 30, 45, 60];

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

  // Accept opens the ETA sheet; we try to auto-fill drive-time from the courier's
  // GPS, and they can adjust before confirming. The sender is told this ETA.
  const [etaFor, setEtaFor] = useState<CourierParcel | null>(null);
  const [etaSel, setEtaSel] = useState<number | null>(null);
  const [etaAuto, setEtaAuto] = useState<number | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const openAccept = async (p: CourierParcel) => {
    setEtaFor(p); setEtaSel(null); setEtaAuto(null); setEtaLoading(true);
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      const granted = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
      if (granted) {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const auto = await CourierAPI.pickupEta(p.id, loc.coords.latitude, loc.coords.longitude);
        if (auto) { setEtaAuto(auto); setEtaSel(auto); }
      }
    } catch { /* fall back to manual chips */ }
    setEtaLoading(false);
  };

  const confirmAccept = async () => {
    if (!etaFor || etaSel == null) return;
    const p = etaFor;
    setAccepting(true);
    const ok = await CourierAPI.accept(p.id, etaSel);
    setAccepting(false);
    setEtaFor(null);
    if (!ok) { Alert.alert("Kolis", t("proposalGone")); load(); return; }
    Alert.alert(t("acceptedTitle"), t("acceptedBody"));
    load();
  };

  const decline = async (p: CourierParcel) => {
    setBusyId(p.id);
    await CourierAPI.decline(p.id);
    setBusyId(null);
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

              {p.is_request && (
                <View style={{ backgroundColor: "rgba(255,107,0,0.10)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 }}>
                  <Text style={{ fontSize: 11.5, color: "#B85700", fontWeight: "700" }}>📣 {t("requestedForYou")}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {p.is_request && (
                  <Pressable onPress={() => decline(p)} disabled={busyId === p.id} style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, padding: 14, alignItems: "center", opacity: busyId === p.id ? 0.7 : 1 }}>
                    <Text style={{ color: Colors.t2, fontWeight: "800", fontSize: 14 }}>{t("declineParcel")}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => openAccept(p)} disabled={busyId === p.id} style={{ flex: p.is_request ? 1.4 : 1, backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", opacity: busyId === p.id ? 0.7 : 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("acceptParcel", { amount: payout(p) })}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Pickup-ETA sheet — shown when accepting; the sender is told this ETA. */}
      <Modal visible={!!etaFor} transparent animationType="fade" onRequestClose={() => setEtaFor(null)}>
        <Pressable onPress={() => !accepting && setEtaFor(null)} style={{ flex: 1, backgroundColor: "rgba(20,10,25,0.45)", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 34 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.ink }}>{t("pickupEtaTitle")}</Text>
            <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 3, marginBottom: 16 }}>{t("pickupEtaSub")}</Text>

            {etaLoading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <ActivityIndicator color={Colors.accent} />
                <Text style={{ color: Colors.t2, fontSize: 12.5 }}>{t("etaLocating")}</Text>
              </View>
            ) : etaAuto ? (
              <Text style={{ fontSize: 12.5, color: "#178a5e", fontWeight: "700", marginBottom: 12 }}>📍 {t("etaAuto", { min: etaAuto })}</Text>
            ) : (
              <Text style={{ fontSize: 12.5, color: Colors.t3, marginBottom: 12 }}>{t("etaManual")}</Text>
            )}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 20 }}>
              {ETA_CHIPS.map((m) => {
                const on = etaSel === m;
                return (
                  <Pressable key={m} onPress={() => setEtaSel(m)} style={{ borderWidth: 1.5, borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff", borderRadius: 11, paddingHorizontal: 16, paddingVertical: 11 }}>
                    <Text style={{ color: on ? "#fff" : Colors.ink, fontWeight: "800", fontSize: 14 }}>{m} {t("minShort")}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={confirmAccept} disabled={etaSel == null || accepting} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 15, alignItems: "center", opacity: (etaSel == null || accepting) ? 0.5 : 1 }}>
              {accepting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("confirmAcceptEta")}</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
