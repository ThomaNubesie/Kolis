import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { LoadqAPI, AvailableDriver } from "../../services/loadq";
import { regionCode } from "../../constants/geo";
import { routeKm } from "../../constants/pricing";

export default function Drivers() {
  const { t } = useStrings();
  const router = useRouter();
  const p = useLocalSearchParams<{ drop: string; size: string; from: string; to: string; price: string; pickup_zone?: string; zoneName?: string }>();
  const destRegion = regionCode(p.to ?? "");
  const [list, setList] = useState<AvailableDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await LoadqAPI.availableDrivers(destRegion, p.pickup_zone ?? null);
    setList(d);
    setSel(d[0]?.driver_id ?? null);
    setLoading(false);
  }, [destRegion, p.pickup_zone]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const km = routeKm(p.from ?? "", p.to ?? "");
  const hours = Math.max(2, Math.round(km / 90));
  const price = Number(p.price ?? 0);

  const toConfirm = (driver?: AvailableDriver) => {
    router.push({
      pathname: "/(app)/confirm",
      params: {
        drop: p.drop ?? "zone", size: p.size ?? "small", from: p.from ?? "", to: p.to ?? "", price: String(price),
        pickup_zone: p.pickup_zone ?? "", zoneName: p.zoneName ?? "",
        preferred_driver_id: driver?.driver_id ?? "", preferred_driver_name: driver?.display_name ?? "",
      },
    });
  };

  const selected = list.find((d) => d.driver_id === sel);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {p.from} → {p.to}</Text></Pressable>
        <Text style={{ fontSize: 23, fontWeight: "800", color: Colors.ink }}>{t("availableDrivers")}</Text>
        <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 3, marginBottom: 16 }}>
          {loading ? "…" : t("headingNow", { n: list.length, city: p.to ?? "" })}
        </Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 30 }} />
        ) : list.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 24 }}>
            <Text style={{ fontSize: 40 }}>🕓</Text>
            <Text style={{ color: Colors.ink, fontWeight: "800", fontSize: 15, marginTop: 10, textAlign: "center" }}>{t("noDriversYetTitle", { city: p.to ?? "" })}</Text>
            <Text style={{ color: Colors.t2, fontSize: 12.5, textAlign: "center", marginTop: 6, lineHeight: 18, paddingHorizontal: 10 }}>{t("noDriversYetSub")}</Text>
            <Pressable onPress={() => toConfirm()} style={{ backgroundColor: Colors.accent, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 22, marginTop: 18 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("requestAnyway")}</Text>
            </Pressable>
          </View>
        ) : (
          list.map((d) => {
            const on = d.driver_id === sel;
            const initial = (d.display_name || "D").trim().charAt(0).toUpperCase();
            return (
              <Pressable key={d.driver_id} onPress={() => setSel(d.driver_id)}
                style={{ borderWidth: 1.5, borderColor: on ? Colors.accent : Colors.line, borderRadius: 15, padding: 12, marginBottom: 10, backgroundColor: "#fff" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {d.avatar_url ? (
                    <Image source={{ uri: d.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{initial}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.ink }}>
                      {d.display_name}
                      {d.verified ? <Text style={{ fontSize: 11, color: Colors.green }}>  ✓ {t("verified")}</Text> : null}
                    </Text>
                    {d.trust_score != null && (
                      <Text style={{ fontSize: 11, color: Colors.t2 }}>★ {(d.trust_score / 20).toFixed(1)}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink }}>~{hours}h</Text>
                    <Text style={{ fontSize: 9, color: Colors.t3 }}>{t("tripTime")}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Text style={{ fontSize: 10, color: Colors.t2, backgroundColor: Colors.bg, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 7 }}>{t("queuedAgo", { m: d.queued_minutes })}</Text>
                  {d.seats_available > 0 && <Text style={{ fontSize: 10, color: Colors.t2, backgroundColor: Colors.bg, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 7 }}>{t("seatsFree", { n: d.seats_available })}</Text>}
                  {p.zoneName ? <Text style={{ fontSize: 10, color: Colors.t2, backgroundColor: Colors.bg, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 7 }} numberOfLines={1}>📍 {p.zoneName}</Text> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {!loading && list.length > 0 && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.line }}>
          <Pressable onPress={() => toConfirm(selected)} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("requestDriver", { name: selected?.display_name ?? "", amount: price })}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
