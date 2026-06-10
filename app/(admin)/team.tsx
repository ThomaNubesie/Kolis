// Team & access (owner only): staff roles, email invites, hashed API keys.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, TextInput, RefreshControl, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AdminAPI, StaffMember, AccessKey } from "../../services/admin";

const ROLES = ["admin", "dispatcher", "finance", "support"] as const;

export default function AdminTeam() {
  const router = useRouter();
  const [team, setTeam] = useState<StaffMember[]>([]);
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("dispatcher");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyModal, setKeyModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    AdminAPI.team().then(setTeam).catch(() => {});
    AdminAPI.keys().then(setKeys).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendInvite = async () => {
    if (!email.trim()) return;
    try { const r = await AdminAPI.invite(email.trim(), role); setInvite(false); setEmail(""); Alert.alert("Team", r === "granted" ? "Access granted" : "Invite sent (pending sign-in)"); load(); }
    catch (e: any) { Alert.alert("Team", e?.message || "Error"); }
  };
  const remove = (m: StaffMember) => { if (!m.user_id) return; Alert.alert("Remove staff?", m.name || m.email || "", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { try { await AdminAPI.removeStaff(m.user_id!); } catch (e: any) { Alert.alert("Team", e?.message || "Error"); } load(); } }]); };
  const createKey = async () => {
    if (!keyName.trim()) return;
    try { const r = await AdminAPI.createKey(keyName.trim(), ["read_parcels"]); setKeyModal(false); setKeyName(""); setNewKey(r.key); load(); }
    catch (e: any) { Alert.alert("Team", e?.message || "Error"); }
  };
  const revoke = (k: AccessKey) => Alert.alert("Revoke key?", k.name, [{ text: "Cancel", style: "cancel" }, { text: "Revoke", style: "destructive", onPress: async () => { try { await AdminAPI.revokeKey(k.id); } catch {} load(); } }]);

  const roleTone: Record<string, [string, string]> = { owner: ["rgba(225,29,107,0.12)", "#B81558"], admin: ["rgba(225,29,107,0.12)", "#B81558"], dispatcher: ["rgba(59,110,165,0.14)", "#2b5580"], finance: ["rgba(232,185,49,0.2)", "#8a6d12"], support: ["#F0ECE2", "#5A6B63"] };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>←</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>Team & access</Text>
        <Text style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: "800", color: Colors.accentDk, backgroundColor: "rgba(225,29,107,0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6, marginBottom: 12, overflow: "hidden" }}>🔒 Owner only</Text>

        <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, fontWeight: "700" }}>Staff</Text>
        {team.map((m, i) => {
          const [bg, fg] = roleTone[m.role] ?? ["#F0ECE2", "#5A6B63"];
          return (
            <Pressable key={(m.user_id ?? m.email ?? "") + i} onLongPress={() => remove(m)} style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 8, backgroundColor: "#fff" }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.ink, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>{(m.name || m.email || "?")[0]?.toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 13.5 }}>{m.name || m.email}{m.pending ? "  ·  pending" : ""}</Text>
                <Text style={{ color: Colors.t3, fontSize: 11 }}>{m.email}</Text>
              </View>
              <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ color: fg, fontWeight: "800", fontSize: 10 }}>{m.role}</Text></View>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setInvite(true)} style={{ backgroundColor: Colors.ink, borderRadius: 12, padding: 13, alignItems: "center", marginTop: 4 }}><Text style={{ color: "#fff", fontWeight: "800" }}>＋ Invite staff</Text></Pressable>

        <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 18, marginBottom: 6, fontWeight: "700" }}>API access keys</Text>
        {keys.map((k) => (
          <Pressable key={k.id} onLongPress={() => !k.revoked_at && revoke(k)} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 8, backgroundColor: "#fff", opacity: k.revoked_at ? 0.5 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 13 }}>{k.name}</Text>
              <Text style={{ fontWeight: "800", fontSize: 10.5, color: k.revoked_at ? "#b91c1c" : "#178a5e" }}>{k.revoked_at ? "revoked" : "active"}</Text>
            </View>
            <Text style={{ fontFamily: "Courier", fontSize: 11, color: Colors.t3, marginTop: 2 }}>{k.prefix}••••  ·  {k.scopes.join(", ")}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setKeyModal(true)} style={{ borderWidth: 1.5, borderColor: Colors.line, borderStyle: "dashed", borderRadius: 12, padding: 13, alignItems: "center", marginTop: 4 }}><Text style={{ color: Colors.t2, fontWeight: "700" }}>＋ Create access key</Text></Pressable>
        <Text style={{ fontSize: 10.5, color: Colors.t3, marginTop: 8 }}>Long-press a row to remove a staff member or revoke a key.</Text>
      </ScrollView>

      {/* Invite */}
      <Modal visible={invite} transparent animationType="fade" onRequestClose={() => setInvite(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Invite staff</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="name@kolis.ca" placeholderTextColor={Colors.t3} keyboardType="email-address" autoCapitalize="none" style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 11, fontSize: 14, color: Colors.ink, marginBottom: 10 }} />
            {ROLES.map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: role === r ? Colors.accent : Colors.line, borderRadius: 11, padding: 11, marginBottom: 7, backgroundColor: role === r ? "#fdeef4" : "#fff" }}>
                <Text style={{ flex: 1, fontWeight: "700", color: Colors.ink, textTransform: "capitalize" }}>{r}</Text>
                <Text style={{ color: role === r ? Colors.accent : Colors.t3, fontWeight: "800" }}>{role === r ? "●" : "○"}</Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable onPress={() => setInvite(false)} style={{ flex: 1, padding: 12, alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11 }}><Text style={{ color: Colors.t2, fontWeight: "700" }}>Cancel</Text></Pressable>
              <Pressable onPress={sendInvite} style={{ flex: 1, padding: 12, alignItems: "center", backgroundColor: Colors.accent, borderRadius: 11 }}><Text style={{ color: "#fff", fontWeight: "800" }}>Send invite</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create key */}
      <Modal visible={keyModal} transparent animationType="fade" onRequestClose={() => setKeyModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>New access key</Text>
            <TextInput value={keyName} onChangeText={setKeyName} placeholder="e.g. ops-integration" placeholderTextColor={Colors.t3} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 11, fontSize: 14, color: Colors.ink, marginBottom: 10 }} />
            <Text style={{ fontSize: 11, color: Colors.t3, marginBottom: 12 }}>Scope: read parcels. The key is shown once on creation.</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setKeyModal(false)} style={{ flex: 1, padding: 12, alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11 }}><Text style={{ color: Colors.t2, fontWeight: "700" }}>Cancel</Text></Pressable>
              <Pressable onPress={createKey} style={{ flex: 1, padding: 12, alignItems: "center", backgroundColor: Colors.accent, borderRadius: 11 }}><Text style={{ color: "#fff", fontWeight: "800" }}>Create</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Show key once */}
      <Modal visible={!!newKey} transparent animationType="fade" onRequestClose={() => setNewKey(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.6)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink, marginBottom: 4 }}>🔑 Copy your key now</Text>
            <Text style={{ fontSize: 12, color: Colors.t2, marginBottom: 12 }}>It won't be shown again.</Text>
            <Text selectable style={{ fontFamily: "Courier", fontSize: 12.5, color: Colors.ink, backgroundColor: Colors.bg, padding: 12, borderRadius: 10, marginBottom: 12 }}>{newKey}</Text>
            <Pressable onPress={() => setNewKey(null)} style={{ backgroundColor: Colors.ink, borderRadius: 11, padding: 13, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>Done</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
