// Admin parcel detail + ops: assign / change driver / unassign / reroute /
// cancel & refund / open claim. Gated by role (server enforces too).
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { AdminAPI, AdminRole, Candidate } from "../../services/admin";
import { CityPicker } from "../../components/CityPicker";
import { regionCode } from "../../constants/geo";

const c$ = (cents?: number | null) => `C$${((cents ?? 0) / 100).toFixed(2)}`;

export default function AdminParcel() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<any>(null);
  const [role, setRole] = useState<AdminRole>(null);
  const [busy, setBusy] = useState(false);
  const [drivers, setDrivers] = useState<Candidate[] | null>(null); // non-null = picker open
  const [reroute, setReroute] = useState(false);
  const [newCity, setNewCity] = useState("");

  const load = useCallback(() => {
    if (!id) return;
    AdminAPI.parcel(id).then((d) => { setP(d); setNewCity(d?.to_city ?? ""); }).catch(() => {});
    AdminAPI.role().then(setRole).catch(() => {});
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canOps = role === "owner" || role === "admin" || role === "dispatcher";
  const canMoney = role === "owner" || role === "admin" || role === "finance";

  const run = async (fn: () => Promise<any>, ok = "Done") => {
    setBusy(true);
    try { await fn(); Alert.alert("Admin", ok); load(); } catch (e: any) { Alert.alert("Admin", e?.message || "Error"); }
    setBusy(false);
  };

  const openDrivers = async () => { setDrivers(await AdminAPI.candidates(id!)); };
  const pickDriver = async (d: Candidate) => {
    const assigned = !!p?.driver_id;
    setDrivers(null);
    run(() => assigned ? AdminAPI.changeDriver(id!, d.driver_id) : AdminAPI.assign(id!, d.driver_id), assigned ? "Driver changed" : "Assigned");
  };
  const doReroute = () => { setReroute(false); run(() => AdminAPI.reroute(id!, newCity, regionCode(newCity)), "Rerouted"); };
  const doCancel = () => Alert.alert("Cancel & refund", "Refund the sender and cancel this parcel?", [
    { text: "No", style: "cancel" },
    { text: "Cancel & refund", style: "destructive", onPress: () => run(async () => { const r = await AdminAPI.refund({ parcel_id: id!, action: "cancel", method: "card" }); if (r.error) throw new Error(r.error); }, "Cancelled & refunded") },
  ]);
  const openClaim = () => Alert.alert("Open claim", "Type of issue?", [
    { text: "Lost", onPress: () => run(() => AdminAPI.openClaim(id!, "lost"), "Claim opened") },
    { text: "Damaged", onPress: () => run(() => AdminAPI.openClaim(id!, "damaged"), "Claim opened") },
    { text: "Cancel", style: "cancel" },
  ]);

  if (!p) return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} /></SafeAreaView>;

  const KV = ({ k, v }: { k: string; v: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}><Text style={{ color: Colors.t2, fontSize: 12.5 }}>{k}</Text><Text style={{ color: Colors.ink, fontSize: 12.5, fontWeight: "700", maxWidth: "62%", textAlign: "right" }}>{v}</Text></View>
  );
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, fontWeight: "700" }}>{title}</Text>
      <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, backgroundColor: "#fff" }}>{children}</View>
    </View>
  );
  const Btn = ({ label, onPress, tone = "dark", disabled }: { label: string; onPress: () => void; tone?: "dark" | "ghost" | "red" | "blue"; disabled?: boolean }) => {
    const styles: any = { dark: { bg: Colors.ink, fg: "#fff" }, blue: { bg: "#3B6EA5", fg: "#fff" }, red: { bg: Colors.red, fg: "#fff" }, ghost: { bg: "#fff", fg: Colors.t2, b: Colors.line } };
    const s = styles[tone];
    return <Pressable onPress={onPress} disabled={disabled || busy} style={{ flex: 1, backgroundColor: s.bg, borderWidth: s.b ? 1.5 : 0, borderColor: s.b, borderRadius: 11, padding: 12, alignItems: "center", opacity: disabled || busy ? 0.5 : 1 }}><Text style={{ color: s.fg, fontWeight: "800", fontSize: 12.5 }}>{label}</Text></Pressable>;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>←</Text></Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.ink }}>#{p.code}</Text>
          <View style={{ backgroundColor: "rgba(59,110,165,0.14)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ color: "#2b5580", fontWeight: "800", fontSize: 11 }}>{String(p.status).replace(/_/g, " ")}</Text></View>
        </View>

        <Card title="Route"><Text style={{ fontWeight: "800", color: Colors.ink }}>{p.from_city} → {p.to_city}</Text><Text style={{ color: Colors.t2, fontSize: 12, marginTop: 2 }}>{p.dropoff_type === "hub" ? "Hub" : "Door-to-door"} · {p.size}</Text></Card>
        <Card title="Sender → Recipient">
          <KV k="Sender" v={`${p.sender_name || "—"}`} />
          <KV k="Recipient" v={`${p.recipient_name || "—"}`} />
          <KV k="Phone" v={p.recipient_phone || "—"} />
          <KV k="Destination" v={p.dropoff_addr || p.pickup_hub_name || "—"} />
        </Card>
        <Card title="Contents & insurance">
          <KV k="Contents" v={p.contents_description || "—"} />
          <KV k="Declared value" v={c$(p.declared_value_cents)} />
          <KV k="Insured" v={p.insured ? `Yes (+${c$(p.insurance_premium_cents)})` : "Declined"} />
        </Card>
        <Card title="Money & driver (admin)">
          <KV k="Sender paid" v={c$(p.price_cents + (p.insurance_premium_cents ?? 0))} />
          <KV k="Courier payout" v={c$(p.driver_payout_cents)} />
          <KV k="Driver" v={p.driver_name || "unassigned"} />
          <KV k="Delivery code" v={p.delivery_code || "—"} />
        </Card>

        {canOps && (
          <>
            <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, fontWeight: "700" }}>Dispatch & route</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <Btn label={p.driver_id ? "Change driver" : "Assign driver"} tone="blue" onPress={openDrivers} />
              {p.driver_id ? <Btn label="Unassign" tone="ghost" onPress={() => run(() => AdminAPI.unassign(id!), "Unassigned")} /> : null}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              <Btn label="Reroute" tone="ghost" onPress={() => setReroute(true)} />
              <Btn label="Open claim" tone="ghost" onPress={openClaim} />
            </View>
          </>
        )}
        {canMoney && <Btn label="Cancel & refund" tone="red" onPress={doCancel} />}
      </ScrollView>

      {/* Driver picker */}
      <Modal visible={drivers !== null} transparent animationType="slide" onRequestClose={() => setDrivers(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "75%" }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Pick a courier → {p.to_city}</Text>
            <ScrollView>
              {(drivers ?? []).length === 0 && <Text style={{ color: Colors.t3, textAlign: "center", marginVertical: 20 }}>No candidates heading there.</Text>}
              {(drivers ?? []).map((d) => (
                <Pressable key={d.driver_id} onPress={() => pickDriver(d)} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: "#fff" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 13.5 }}>{d.name || "Courier"}</Text>
                    <Text style={{ color: Colors.t3, fontSize: 11 }}>{d.source === "queue" ? `LoadQ #${d.queue_pos ?? "?"}` : "Off-queue member"} · carrying {d.carrying}/3</Text>
                  </View>
                  <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12 }}>Pick</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setDrivers(null)} style={{ padding: 12, alignItems: "center" }}><Text style={{ color: Colors.t3 }}>Close</Text></Pressable>
          </View>
        </View>
      </Modal>

      {/* Reroute */}
      <Modal visible={reroute} transparent animationType="fade" onRequestClose={() => setReroute(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 18 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Reroute destination</Text>
            <CityPicker label="New destination" value={newCity} onChange={setNewCity} exclude={p.from_city} />
            <Text style={{ fontSize: 11, color: Colors.t3, marginVertical: 8 }}>Couriers + sender are re-notified; the delivery code stays valid.</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setReroute(false)} style={{ flex: 1, padding: 12, alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11 }}><Text style={{ color: Colors.t2, fontWeight: "700" }}>Cancel</Text></Pressable>
              <Pressable onPress={doReroute} style={{ flex: 1, padding: 12, alignItems: "center", backgroundColor: Colors.accent, borderRadius: 11 }}><Text style={{ color: "#fff", fontWeight: "800" }}>Reroute</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
