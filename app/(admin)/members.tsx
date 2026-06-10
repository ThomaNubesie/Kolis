// Members CRM — list, filter, search, suspend/reinstate.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, RefreshControl, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AdminAPI, AdminMember } from "../../services/admin";

const FILTERS = [["all", "All"], ["couriers", "Couriers"], ["senders", "Senders"], ["unverified", "Unverified"], ["founding", "Founding"]] as const;

export default function AdminMembers() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((f = filter, s = search) => {
    setLoading(true);
    AdminAPI.members(f, s.trim() || null).then(setList).catch(() => {}).finally(() => setLoading(false));
  }, [filter, search]);
  useFocusEffect(useCallback(() => { load(); }, []));

  const toggleSuspend = (m: AdminMember) => Alert.alert(m.suspended ? "Reinstate member?" : "Suspend member?", m.full_name || m.email || "",
    [{ text: "Cancel", style: "cancel" }, { text: m.suspended ? "Reinstate" : "Suspend", style: m.suspended ? "default" : "destructive", onPress: async () => { try { await AdminAPI.suspend(m.id, !m.suspended); } catch (e: any) { Alert.alert("Admin", e?.message || "Error"); } load(); } }]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>←</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Members</Text>
        <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => load()} placeholder="🔍 name, email…" placeholderTextColor={Colors.t3} returnKeyType="search" autoCapitalize="none"
          style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 10, fontSize: 13, color: Colors.ink, backgroundColor: "#fff", marginBottom: 9 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {FILTERS.map(([f, label]) => {
            const on = filter === f;
            return <Pressable key={f} onPress={() => { setFilter(f); load(f, search); }} style={{ borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff" }}><Text style={{ fontSize: 11.5, fontWeight: "700", color: on ? "#fff" : Colors.t2 }}>{label}</Text></Pressable>;
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={Colors.accent} />}>
        {!loading && list.length === 0 && <Text style={{ color: Colors.t3, textAlign: "center", marginTop: 40 }}>No members.</Text>}
        {list.map((m) => (
          <Pressable key={m.id} onLongPress={() => toggleSuspend(m)} style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 9, backgroundColor: "#fff", opacity: m.suspended ? 0.55 : 1 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>{(m.full_name || m.email || "?")[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 13.5 }}>{m.full_name || m.email || "—"}</Text>
              <Text style={{ color: Colors.t3, fontSize: 11, marginTop: 1 }}>
                {m.role || "—"} · {m.identity_verified ? "✓ verified" : "⏳ unverified"}{m.is_founding && m.founding_number ? ` · Founding #${m.founding_number}` : ""}{m.suspended ? " · SUSPENDED" : ""}
              </Text>
            </View>
            <Text style={{ color: Colors.t3, fontSize: 10 }}>hold</Text>
          </Pressable>
        ))}
        {list.length > 0 && <Text style={{ fontSize: 10.5, color: Colors.t3, textAlign: "center", marginTop: 4 }}>Long-press a member to suspend / reinstate.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
