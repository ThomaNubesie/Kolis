// Parcels this courier is carrying + deliver via the recipient's 4-digit code
// (captures the escrow through kolis-finalize-payment). Courier never sees the
// sender's price — only their own payout.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI, CourierParcel } from "../../services/courier";
import { drainScannedCodes } from "../../services/scanBridge";
import { DeliveryReceiptModal, DeliveryReceiptData } from "../../components/DeliveryReceiptModal";

const SIZE_EMOJI: Record<string, string> = { envelope: "✉️", small: "📦", large: "🧳" };

export default function Carrying() {
  const { t, lang } = useStrings();
  const fr = lang === "fr";
  const router = useRouter();
  const [list, setList] = useState<CourierParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [pcodes, setPcodes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DeliveryReceiptData | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    CourierAPI.carrying().then(setList).catch(() => {}).finally(() => setLoading(false));
  }, []);
  // On focus: reload, then drain any code the QR scanner stashed while in the
  // 100 m geofence and auto-fill the matching input. The driver never types it.
  useFocusEffect(useCallback(() => {
    load();
    const drained = drainScannedCodes();
    const p: Record<string, string> = {}, d: Record<string, string> = {};
    for (const [id, e] of Object.entries(drained)) {
      if (e.kind === "pickup") p[id] = e.code; else d[id] = e.code;
    }
    if (Object.keys(p).length) setPcodes((c) => ({ ...c, ...p }));
    if (Object.keys(d).length) setCodes((c) => ({ ...c, ...d }));
  }, [load]));

  // Open the platform maps app with turn-by-turn directions to an address.
  const openDirections = async (addr: string) => {
    const dst = encodeURIComponent(addr);
    const web = `https://www.google.com/maps/dir/?api=1&destination=${dst}`;
    const nativeUrl = Platform.select({
      ios: `http://maps.apple.com/?daddr=${dst}&dirflg=d`,
      android: `google.navigation:q=${dst}`,
      default: web,
    })!;
    try {
      const ok = await Linking.canOpenURL(nativeUrl);
      await Linking.openURL(ok ? nativeUrl : web);
    } catch {
      try { await Linking.openURL(web); } catch { Alert.alert("Kolis", addr); }
    }
  };

  const pickup = async (p: CourierParcel) => {
    const code = (pcodes[p.id] || "").trim();
    if (code.length < 4) return;
    setBusyId(p.id);
    const res = await CourierAPI.markPickedUp(p.id, code);
    setBusyId(null);
    if (res !== "ok") { Alert.alert("Kolis", res === "bad_code" ? t("badPickupCode") : t("badCode")); return; }
    setPcodes((c) => ({ ...c, [p.id]: "" }));
    load();
  };

  const deliver = async (p: CourierParcel) => {
    const code = (codes[p.id] || "").trim();
    if (code.length < 4) return;
    setBusyId(p.id);
    const { ok, error } = await CourierAPI.deliver(p.id, code);
    setBusyId(null);
    if (!ok) {
      const m = error === "bad_code" ? t("badCode")
        : error === "payment_not_captured" ? (fr ? "Paiement non encaissé pour ce colis — contactez la répartition avant de livrer." : "Payment not captured for this parcel — contact dispatch before delivering.")
        : (error || t("badCode"));
      Alert.alert("Kolis", m); return;
    }
    setCodes((c) => ({ ...c, [p.id]: "" }));
    // Walled receipt: courier branch returns payout only.
    const r = await CourierAPI.receipt(p.id).catch(() => null);
    if (r) {
      setReceipt({
        receiptId: r.code, fromCity: r.from_city, toCity: r.to_city, size: r.size,
        dropoffType: r.dropoff_type, amountLabel: t("yourPayout"), amountCents: r.payout_cents,
        dateISO: r.delivered_at || r.created_at,
      });
    } else {
      Alert.alert("Kolis", t("delivered"));
    }
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
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, flex: 1 }}>{t("carrying")}</Text>
          <Pressable onPress={() => router.push("/(app)/scan" as never)} style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#E11D6B", borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 }}>
            <Text style={{ fontSize: 15 }}>📷</Text><Text style={{ color: "#fff", fontWeight: "800", fontSize: 13.5 }}>Scan QR</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 13, color: Colors.t2, marginBottom: 18 }}>{t("carryingSub")}</Text>

        {!loading && list.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 40 }}>🚚</Text>
            <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, marginTop: 12 }}>{t("noneCarrying")}</Text>
          </View>
        )}

        {list.map((p) => {
          const isHub = p.dropoff_type === "hub";
          const gotIt = p.status !== "matched"; // picked_up / in_transit → possession confirmed
          const pickupWhere = isHub ? (p.pickup_hub_name || "") : (p.pickup_addr || "");
          return (
            <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 16, padding: 15, marginBottom: 14, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 22 }}>{SIZE_EMOJI[p.size] ?? "📦"}</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, flex: 1 }}>#{p.code} {t("forDest")} {p.to_city}</Text>
              </View>

              {/* STAGE 1 — before pickup: pickup address + tap-to-navigate + "I have it" */}
              {!gotIt && (
                <>
                  {pickupWhere ? (
                    <Pressable onPress={() => openDirections(pickupWhere)} style={{ backgroundColor: Colors.bg, borderRadius: 11, padding: 11, marginBottom: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{isHub ? t("pickupHub") : t("pickupDoor")}</Text>
                      <Text style={{ fontSize: 13.5, color: Colors.ink, fontWeight: "700" }}>{isHub ? "🏢 " : "🚪 "}{pickupWhere}</Text>
                      <Text style={{ fontSize: 11.5, color: Colors.accent, fontWeight: "800", marginTop: 4 }}>🧭 {t("directions")}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={{ fontSize: 11.5, color: Colors.t3, marginBottom: 12 }}>🔒 {t("recipientMasked")}</Text>
                  <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{fr ? "Code de ramassage" : "Pickup code"}</Text>
                  {(pcodes[p.id] || "").length >= 4 ? (
                    <View style={{ borderWidth: 1.5, borderColor: "#178a5e", borderRadius: 11, padding: 12, backgroundColor: "rgba(23,138,94,0.08)", marginBottom: 10 }}>
                      <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: Colors.ink }}>{pcodes[p.id]}</Text>
                      <Text style={{ fontSize: 10.5, color: "#178a5e", fontWeight: "700", textAlign: "center", marginTop: 4 }}>✅ {fr ? "Rempli par le scan" : "Filled by scan"}</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => router.push("/(app)/scan" as never)} style={{ borderWidth: 1.5, borderColor: Colors.accent, borderStyle: "dashed", borderRadius: 11, padding: 14, alignItems: "center", backgroundColor: Colors.bg, marginBottom: 10 }}>
                      <Text style={{ fontSize: 22 }}>📷</Text>
                      <Text style={{ fontSize: 12.5, color: Colors.accent, fontWeight: "800", marginTop: 4, textAlign: "center" }}>{fr ? "Scannez le QR à moins de 100 m pour remplir le code" : "Scan the QR within 100 m to fill the code"}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => pickup(p)} disabled={busyId === p.id || (pcodes[p.id] || "").trim().length < 4} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", opacity: (busyId === p.id || (pcodes[p.id] || "").trim().length < 4) ? 0.55 : 1 }}>
                    {busyId === p.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>📦 {t("confirmPickup")}</Text>}
                  </Pressable>
                </>
              )}

              {/* STAGE 2 — after pickup: delivery address + recipient + deliver code */}
              {gotIt && (
                <>
                  <Text style={{ fontSize: 11, color: "#178a5e", fontWeight: "700", marginBottom: 10 }}>✅ {t("pickedUpNote")}</Text>
                  {p.dropoff_addr ? (
                    <Pressable onPress={() => openDirections(p.dropoff_addr!)} style={{ backgroundColor: Colors.bg, borderRadius: 11, padding: 11, marginBottom: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("deliveryAddress")}</Text>
                      <Text style={{ fontSize: 13.5, color: Colors.ink, fontWeight: "700" }}>📍 {p.dropoff_addr}</Text>
                      <Text style={{ fontSize: 11.5, color: Colors.accent, fontWeight: "800", marginTop: 4 }}>🧭 {t("directions")}</Text>
                    </Pressable>
                  ) : null}
                  {(p.recipient_name || p.recipient_phone) ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("recipient")}</Text>
                        <Text style={{ fontSize: 13, color: Colors.ink, fontWeight: "700" }}>{p.recipient_name || "—"}</Text>
                      </View>
                      {p.recipient_phone ? (
                        <Pressable onPress={() => Linking.openURL(`tel:${p.recipient_phone}`)} style={{ borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                          <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12.5 }}>📞 {t("callRecipient")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{fr ? "Code de livraison" : "Delivery code"}</Text>
                  {(codes[p.id] || "").length >= 4 ? (
                    <View style={{ borderWidth: 1.5, borderColor: "#178a5e", borderRadius: 11, padding: 12, backgroundColor: "rgba(23,138,94,0.08)", marginBottom: 10 }}>
                      <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: Colors.ink }}>{codes[p.id]}</Text>
                      <Text style={{ fontSize: 10.5, color: "#178a5e", fontWeight: "700", textAlign: "center", marginTop: 4 }}>✅ {fr ? "Rempli par le scan" : "Filled by scan"}</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => router.push("/(app)/scan" as never)} style={{ borderWidth: 1.5, borderColor: Colors.accent, borderStyle: "dashed", borderRadius: 11, padding: 14, alignItems: "center", backgroundColor: Colors.bg, marginBottom: 10 }}>
                      <Text style={{ fontSize: 22 }}>📷</Text>
                      <Text style={{ fontSize: 12.5, color: Colors.accent, fontWeight: "800", marginTop: 4, textAlign: "center" }}>{fr ? "Scannez le QR à moins de 100 m pour remplir le code" : "Scan the QR within 100 m to fill the code"}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => deliver(p)} disabled={busyId === p.id || (codes[p.id] || "").trim().length < 4} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", opacity: (busyId === p.id || (codes[p.id] || "").trim().length < 4) ? 0.55 : 1 }}>
                    {busyId === p.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("markDelivered")}</Text>}
                  </Pressable>
                  <Text style={{ color: "#178a5e", fontSize: 11.5, textAlign: "center", marginTop: 8, fontWeight: "700" }}>+C${payout(p)} {t("released")}</Text>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
      <DeliveryReceiptModal visible={!!receipt} data={receipt} onClose={() => setReceipt(null)} />
    </SafeAreaView>
  );
}
