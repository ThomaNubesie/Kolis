// Courier's delivery history. Each past job keeps its proof photo and its card, so a
// dispute a week later is answerable without going through dispatch.
import { useCallback, useState } from "react";
import { View, Text, Pressable, Image, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, ImageOff } from "lucide-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI } from "../../services/courier";

const money = (c?: number | null) => `C$${((c ?? 0) / 100).toFixed(2)}`;

export default function Delivered() {
  const router = useRouter();
  const { lang } = useStrings();
  const fr = lang === "fr";
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    CourierAPI.delivered().then(setRows).catch(() => {}).finally(() => setBusy(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const when = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(fr ? "fr-CA" : "en-CA", { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString(fr ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 12, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} /></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: Colors.ink, marginRight: 22 }}>
          {fr ? "Mes livraisons" : "My deliveries"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={Colors.accent} />}>
        {rows.length === 0 && !busy ? (
          <Text style={{ fontSize: 13, color: Colors.t3, textAlign: "center", marginTop: 40 }}>
            {fr ? "Aucune livraison pour l'instant." : "No deliveries yet."}
          </Text>
        ) : null}

        {rows.map((p) => {
          const photo = p.delivery_proof?.url ?? null;
          return (
            <Pressable key={p.id} onPress={() => router.push(`/(app)/card?parcel=${p.id}` as never)}
              style={{ backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "800", color: Colors.ink }}>#{p.code}</Text>
                <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.accent }}>{money(p.driver_payout_cents)}</Text>
              </View>
              <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 4 }}>{p.from_city} → {p.to_city}</Text>
              <Text style={{ fontSize: 11.5, color: Colors.t3, marginTop: 2 }}>{when(p.delivered_at)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 46, height: 32, borderRadius: 6, backgroundColor: Colors.cardAlt }} />
                ) : (
                  <View style={{ width: 46, height: 32, borderRadius: 6, backgroundColor: Colors.cardAlt, alignItems: "center", justifyContent: "center" }}>
                    <ImageOff size={14} color={Colors.t3} strokeWidth={2} />
                  </View>
                )}
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: Colors.accentDk }}>
                  {photo ? (fr ? "Voir la carte de livraison" : "View delivery card")
                         : (fr ? "Aucune photo — voir la carte" : "No photo — view card")}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
