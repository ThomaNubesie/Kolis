// Admin parcels — all parcels, filterable + searchable. Admin sees all amounts.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AdminAPI, AdminParcel } from "../../services/admin";

const FILTERS = [["all", "All"], ["awaiting", "Awaiting"], ["hub", "At hub"], ["transit", "In transit"], ["delivered", "Delivered"], ["issues", "Issues"]] as const;
const STATUS_TONE: Record<string, [string, string]> = {
  requested: ["rgba(225,29,107,0.12)", "#B81558"], received_at_hub: ["#F0ECE2", "#5A6B63"],
  matched: ["rgba(59,110,165,0.14)", "#2b5580"], dispatched: ["rgba(59,110,165,0.14)", "#2b5580"],
  picked_up: ["rgba(59,110,165,0.14)", "#2b5580"], in_transit: ["rgba(59,110,165,0.14)", "#2b5580"],
  delivered: ["rgba(46,204,143,0.16)", "#178a5e"], cancelled: ["rgba(220,38,38,0.12)", "#b91c1c"],
};

export default function AdminParcels() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<AdminParcel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((f = filter, s = search) => {
    setLoading(true);
    AdminAPI.parcels(f, s.trim() || null).then(setList).catch(() => {}).finally(() => setLoading(false));
  }, [filter, search]);
  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>←</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Parcels</Text>
        <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => load()} placeholder="🔍 code, city, recipient…" placeholderTextColor={Colors.t3} returnKeyType="search"
          style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 10, fontSize: 13, color: Colors.ink, backgroundColor: "#fff", marginBottom: 9 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {FILTERS.map(([f, label]) => {
            const on = filter === f;
            return (
              <Pressable key={f} onPress={() => { setFilter(f); load(f, search); }} style={{ borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff" }}>
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: on ? "#fff" : Colors.t2 }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={Colors.accent} />}>
        {!loading && list.length === 0 && <Text style={{ color: Colors.t3, textAlign: "center", marginTop: 40 }}>No parcels.</Text>}
        {list.map((p) => {
          const [bg, fg] = STATUS_TONE[p.status] ?? ["#F0ECE2", "#5A6B63"];
          return (
            <Pressable key={p.id} onPress={() => router.push({ pathname: "/(admin)/parcel", params: { id: p.id } })} style={{ borderWidth: 1.5, borderColor: p.has_open_claim ? "#e8a0a0" : Colors.line, borderRadius: 13, padding: 12, marginBottom: 9, backgroundColor: "#fff" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: Colors.ink }}>#{p.code} · {p.from_city}→{p.to_city}</Text>
                <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: fg, fontWeight: "800", fontSize: 10 }}>{p.has_open_claim ? "Claim" : p.status.replace(/_/g, " ")}</Text></View>
              </View>
              <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 3 }}>{p.size} · {p.insured ? `🛡️ C$${Math.round((p.declared_value_cents ?? 0) / 100)}` : "⚠️ no ins."} · {p.driver_name || "unassigned"}</Text>
              <Text style={{ fontSize: 10.5, color: Colors.t3, marginTop: 1 }}>paid C${(p.price_cents / 100).toFixed(2)} · payout C${Math.round((p.driver_payout_cents ?? 0) / 100)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
