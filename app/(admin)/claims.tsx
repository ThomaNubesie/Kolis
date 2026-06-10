// Insurance claims — approve (Stripe refund, policy-capped) or deny.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, TextInput, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AdminAPI, AdminClaim } from "../../services/admin";

export default function AdminClaims() {
  const router = useRouter();
  const [status, setStatus] = useState("open");
  const [list, setList] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<AdminClaim | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"card" | "interac">("card");
  const [busy, setBusy] = useState(false);

  const load = useCallback((s = status) => {
    setLoading(true);
    AdminAPI.claims(s).then(setList).catch(() => {}).finally(() => setLoading(false));
  }, [status]);
  useFocusEffect(useCallback(() => { load(); }, []));

  // Policy cap: insured → declared value; declined → shipping fee.
  const cap = (c: AdminClaim) => c.insured ? (c.declared_value_cents ?? 0) : c.price_cents;
  const open = (c: AdminClaim) => { setActive(c); setAmount((cap(c) / 100).toFixed(2)); setMethod("card"); };

  const approve = async () => {
    if (!active) return;
    const cents = Math.min(Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100), cap(active));
    setBusy(true);
    const r = await AdminAPI.refund({ parcel_id: active.parcel_id, claim_id: active.id, action: "claim", amount_cents: cents, method });
    setBusy(false);
    if (r.error) { Alert.alert("Admin", r.error); return; }
    setActive(null); Alert.alert("Admin", "Approved & refunded"); load();
  };
  const deny = async () => {
    if (!active) return;
    setBusy(true);
    try { await AdminAPI.denyClaim(active.id); } catch (e: any) { Alert.alert("Admin", e?.message || "Error"); }
    setBusy(false); setActive(null); Alert.alert("Admin", "Denied"); load();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>←</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Insurance claims</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
          {[["open", "Open"], ["approved", "Approved"], ["denied", "Denied"]].map(([s, l]) => {
            const on = status === s;
            return <Pressable key={s} onPress={() => { setStatus(s); load(s); }} style={{ borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff" }}><Text style={{ fontSize: 11.5, fontWeight: "700", color: on ? "#fff" : Colors.t2 }}>{l}</Text></Pressable>;
          })}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={Colors.accent} />}>
        {!loading && list.length === 0 && <Text style={{ color: Colors.t3, textAlign: "center", marginTop: 40 }}>No {status} claims.</Text>}
        {list.map((c) => (
          <Pressable key={c.id} onPress={() => status === "open" ? open(c) : router.push({ pathname: "/(admin)/parcel", params: { id: c.parcel_id } })} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 9, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 13.5 }}>#{c.code} · {c.type}</Text>
              <Text style={{ fontWeight: "800", fontSize: 11, color: c.status === "approved" ? "#178a5e" : c.status === "denied" ? "#b91c1c" : Colors.accent }}>{c.status}</Text>
            </View>
            <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 3 }}>{c.from_city}→{c.to_city} · {c.insured ? `🛡️ value C$${Math.round((c.declared_value_cents ?? 0) / 100)}` : `⚠️ declined · cap C$${Math.round(c.price_cents / 100)}`}</Text>
            {c.refund_cents != null && <Text style={{ fontSize: 11, color: Colors.t3, marginTop: 1 }}>refunded C${(c.refund_cents / 100).toFixed(2)}</Text>}
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "center", padding: 24 }}>
          {active && (
            <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink }}>Claim #{active.code}</Text>
              <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 2, marginBottom: 10 }}>{active.type} · {active.from_city}→{active.to_city}</Text>
              <View style={{ backgroundColor: "#fff3da", borderWidth: 1, borderColor: "#e8cf8a", borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ fontSize: 11.5, color: "#7a5b12", lineHeight: 16 }}>{active.insured ? `Insured → refund up to the declared value (max C$${Math.round((active.declared_value_cents ?? 0) / 100)}).` : `Insurance declined → cap is the shipping fee (C$${Math.round(active.price_cents / 100)}).`}</Text>
              </View>
              <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, fontWeight: "700" }}>Refund amount</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 11, fontSize: 16, fontWeight: "700", color: Colors.ink, marginBottom: 9 }} />
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {(["card", "interac"] as const).map((m) => <Pressable key={m} onPress={() => setMethod(m)} style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: method === m ? Colors.accent : Colors.line, backgroundColor: method === m ? "#fdeef4" : "#fff" }}><Text style={{ fontSize: 12, fontWeight: "700", color: method === m ? Colors.accentDk : Colors.t2 }}>{m === "card" ? "Original card" : "Interac"}</Text></Pressable>)}
              </View>
              {busy ? <ActivityIndicator color={Colors.accent} /> : (
                <View style={{ gap: 8 }}>
                  <Pressable onPress={approve} style={{ backgroundColor: Colors.green, borderRadius: 11, padding: 13, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>Approve & refund</Text></Pressable>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={() => setActive(null)} style={{ flex: 1, padding: 11, alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11 }}><Text style={{ color: Colors.t2, fontWeight: "700" }}>Close</Text></Pressable>
                    <Pressable onPress={deny} style={{ flex: 1, padding: 11, alignItems: "center", borderWidth: 1.5, borderColor: "#e8a0a0", borderRadius: 11 }}><Text style={{ color: Colors.red, fontWeight: "700" }}>Deny</Text></Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
