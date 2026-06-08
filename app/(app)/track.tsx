import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI, Parcel, ParcelStatus } from "../../services/parcels";

const ORDER_DEFAULT: ParcelStatus[] = ["requested", "matched", "picked_up", "in_transit", "delivered"];
const ORDER_HUB: ParcelStatus[] = ["received_at_hub", "dispatched", "in_transit", "delivered"];

export default function Track() {
  const { t } = useStrings();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    ParcelsAPI.get(id).then(({ parcel }) => { setParcel(parcel); setLoading(false); });
  }, [id]);

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} /></SafeAreaView>;
  }
  if (!parcel) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><Text style={{ color: Colors.t2 }}>—</Text></SafeAreaView>;
  }

  const labels: Record<ParcelStatus, string> = {
    requested: t("statusPending"), received_at_hub: t("statusReceivedHub"), matched: t("statusMatched"),
    dispatched: t("statusDispatched"), picked_up: t("statusPickedUp"), in_transit: t("statusInTransit"),
    delivered: t("statusDelivered"), cancelled: "—",
  };
  const order = parcel.dropoff_type === "hub" ? ORDER_HUB : ORDER_DEFAULT;
  const cur = order.indexOf(parcel.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.replace("/(app)/shipments")}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("tabShipments")}</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.ink }}>{parcel.from_city} → {parcel.to_city}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t3, marginBottom: 20 }}>#{parcel.code}</Text>

        <View style={{ marginBottom: 18 }}>
          {order.map((s, i) => {
            const done = cur >= 0 && i <= cur;
            const now = i === cur;
            return (
              <View key={s} style={{ flexDirection: "row", gap: 11, alignItems: "flex-start", marginBottom: 16 }}>
                <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: done ? Colors.accent : "#fff", borderWidth: 2, borderColor: done ? Colors.accent : Colors.line, marginTop: 1 }} />
                <Text style={{ fontSize: 14, fontWeight: now ? "800" : done ? "600" : "500", color: done ? Colors.ink : Colors.t3 }}>{labels[s]}</Text>
              </View>
            );
          })}
        </View>

        <Text style={{ fontSize: 11.5, color: Colors.t3, textAlign: "center" }}>{t("safetyNote", { city: parcel.to_city })}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
