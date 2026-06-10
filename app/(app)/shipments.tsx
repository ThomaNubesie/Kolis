import { useCallback, useState } from "react";
import { Text, Pressable, ScrollView, View, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI, Parcel } from "../../services/parcels";
import { DeliveryReceiptModal, DeliveryReceiptData } from "../../components/DeliveryReceiptModal";

export default function Shipments() {
  const { t } = useStrings();
  const router = useRouter();
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState<DeliveryReceiptData | null>(null);

  const openReceipt = async (id: string) => {
    const r = await ParcelsAPI.receipt(id).catch(() => null);
    if (!r) return;
    setReceipt({
      receiptId: r.code, fromCity: r.from_city, toCity: r.to_city, size: r.size,
      dropoffType: r.dropoff_type, amountLabel: t("totalPaid"), amountCents: r.price_cents,
      dateISO: r.delivered_at || r.created_at,
    });
  };

  const load = useCallback(() => {
    ParcelsAPI.listMine().then(({ parcels }) => setParcels(parcels));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = parcels.filter((p) => p.status !== "delivered" && p.status !== "cancelled");
  const done = parcels.filter((p) => p.status === "delivered");

  const statusLabel: Record<string, string> = {
    requested: t("statusPending"), received_at_hub: t("statusReceivedHub"), matched: t("statusMatched"),
    dispatched: t("statusDispatched"), picked_up: t("statusPickedUp"),
    in_transit: t("statusInTransit"), delivered: t("statusDelivered"),
  };

  const Item = ({ p }: { p: Parcel }) => (
    <Pressable onPress={() => router.push({ pathname: "/(app)/track", params: { id: p.id } })}
      style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 15, padding: 13, marginBottom: 9, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontWeight: "800", fontSize: 14, color: Colors.ink }}>{p.from_city} → {p.to_city}</Text>
          <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{p.size} · #{p.code}</Text>
        </View>
        <Text style={{ fontSize: 11.5, fontWeight: "800", color: p.status === "delivered" ? Colors.green : Colors.accent }}>{statusLabel[p.status] ?? p.status}</Text>
      </View>
      {p.status === "delivered" && (
        <Pressable onPress={() => openReceipt(p.id)} style={{ marginTop: 10, alignSelf: "flex-start", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: Colors.t2 }}>🧾 {t("viewReceipt")}</Text>
        </Pressable>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setRefreshing(false); }} />}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 6 }}>{t("tabShipments")}</Text>
        {parcels.length === 0 && <Text style={{ color: Colors.t2, marginTop: 40, textAlign: "center" }}>{t("noShipments")}</Text>}
        {active.length > 0 && <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.t3, textTransform: "uppercase", marginTop: 12, marginBottom: 8 }}>{t("active")}</Text>}
        {active.map((p) => <Item key={p.id} p={p} />)}
        {done.length > 0 && <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.t3, textTransform: "uppercase", marginTop: 12, marginBottom: 8 }}>{t("deliveredSec")}</Text>}
        {done.map((p) => <Item key={p.id} p={p} />)}
      </ScrollView>
      <DeliveryReceiptModal visible={!!receipt} data={receipt} onClose={() => setReceipt(null)} />
    </SafeAreaView>
  );
}
