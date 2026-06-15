import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { OrgsAPI, MyOrg } from "../../services/orgs";

const money = (c: number) => "+$" + Math.round((c || 0) / 100);
const nextStatus = (s: string) =>
  s === "matched" || s === "dispatched" ? "picked_up" : s === "picked_up" ? "in_transit" : s === "in_transit" ? "delivered" : null;

export default function Fleet() {
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = (await OrgsAPI.myOrgs().catch(() => [] as MyOrg[])).filter((o) => o.type === "carrier" || o.type === "both");
    setOrgs(list);
    const stored = await OrgsAPI.getActiveOrgId();
    const active = list.find((o) => o.org_id === stored)?.org_id ?? list[0]?.org_id ?? null;
    setActiveId(active);
    if (active) {
      setBoard(await OrgsAPI.board(active).catch(() => []));
      setDrivers(await OrgsAPI.drivers(active).catch(() => []));
    } else { setBoard([]); setDrivers([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeOrg = orgs.find((o) => o.org_id === activeId) || null;
  const canDispatch = !!activeOrg && ["owner", "admin", "dispatcher"].includes(activeOrg.role);
  const eligible = drivers.filter((d) => d.identity_verified && (d.kolis_role === "courier" || d.kolis_role === "both"));

  const assign = async (parcel: string, driver: string) => {
    setBusy(parcel);
    try { const ok = await OrgsAPI.assign(activeId!, parcel, driver); if (!ok) Alert.alert("Unavailable", "That parcel was already taken."); await load(); }
    catch (e: any) { Alert.alert("Error", e?.message || "Assign failed."); }
    setBusy(null);
  };
  const advance = async (parcel: string, to: string) => {
    setBusy(parcel);
    try { await OrgsAPI.advance(activeId!, parcel, to); await load(); }
    catch (e: any) { Alert.alert("Error", e?.message || "Failed."); }
    setBusy(null);
  };

  const offered = board.filter((p) => !p.mine);
  const mine = board.filter((p) => p.mine);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 2 }}>Fleet dispatch</Text>
        <Text style={{ color: Colors.t2, fontSize: 13, marginBottom: 14 }}>{activeOrg ? `${activeOrg.name} · ${eligible.length} eligible driver(s)` : "No fleet account"}</Text>

        <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.t3, textTransform: "uppercase", marginBottom: 8 }}>Offered ({offered.length})</Text>
        {offered.map((p) => (
          <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 8, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "800" }}>{p.code} → {p.to_city}</Text>
              <Text style={{ fontWeight: "800", color: Colors.green }}>{money(p.driver_payout_cents)}</Text>
            </View>
            <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{p.size} · {p.from_city} → {p.to_city}</Text>
            {canDispatch && eligible.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {eligible.map((d) => (
                  <Pressable key={d.user_id} disabled={busy === p.id} onPress={() => assign(p.id, d.user_id)}
                    style={{ backgroundColor: Colors.accent, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7, marginRight: 6 }}>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>→ {d.full_name || "Driver"}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ))}
        {offered.length === 0 && <Text style={{ color: Colors.t2, marginBottom: 6 }}>No open offers.</Text>}

        <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.t3, textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>Assigned ({mine.length})</Text>
        {mine.map((p) => {
          const nx = nextStatus(p.status);
          return (
            <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 8, backgroundColor: "#fff" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "800" }}>{p.code} → {p.to_city}</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.accent }}>{p.status.replace(/_/g, " ")}</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{p.driver_name || "—"}</Text>
              {canDispatch && nx && (
                <Pressable disabled={busy === p.id} onPress={() => advance(p.id, nx)}
                  style={{ marginTop: 8, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 9, paddingVertical: 8, alignItems: "center" }}>
                  <Text style={{ fontWeight: "800", color: Colors.t2, fontSize: 12 }}>Mark {nx.replace(/_/g, " ")}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {mine.length === 0 && <Text style={{ color: Colors.t2 }}>Nothing assigned yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
