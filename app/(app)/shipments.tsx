import { useCallback, useState } from "react";
import { Text, Pressable, ScrollView, View, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI, Parcel } from "../../services/parcels";

export default function Shipments() {
  const { t } = useStrings();
  const router = useRouter();
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    ParcelsAPI.listMine().then(({ parcels }) => setParcels(parcels));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = parcels.filter((p) => p.status !== "delivered" && p.status !== "cancelled");
  const done = parcels.filter((p) => p.status === "delivered");

  const statusLabel: Record<string, string> = {
    requested: t("statusRequested"), matched: t("statusMatched"), picked_up: t("statusPickedUp"),
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
    </SafeAreaView>
  );
}
