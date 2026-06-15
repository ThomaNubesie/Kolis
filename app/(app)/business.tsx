import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { OrgsAPI, MyOrg } from "../../services/orgs";
import { ParcelsAPI, Parcel } from "../../services/parcels";

const money = (c: number) => "$" + Math.round((c || 0) / 100);

export default function Business() {
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [ov, setOv] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toCity, setToCity] = useState("");
  const [size, setSize] = useState("small");
  const [rcpt, setRcpt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { await OrgsAPI.acceptInvites(); } catch {}
    const list = await OrgsAPI.myOrgs().catch(() => [] as MyOrg[]);
    setOrgs(list);
    const stored = await OrgsAPI.getActiveOrgId();
    const active = list.find((o) => o.org_id === stored)?.org_id ?? null;
    setActiveId(active);
    const { parcels } = await ParcelsAPI.listMine();
    setParcels(parcels);
    setOv(active ? await OrgsAPI.overview(active).catch(() => null) : null);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const switchOrg = async (id: string | null) => { await OrgsAPI.setActiveOrgId(id); await load(); };
  const activeOrg = orgs.find((o) => o.org_id === activeId) || null;
  const canShip = !!activeOrg && (activeOrg.type === "shipper" || activeOrg.type === "both")
    && ["owner", "admin", "shipper"].includes(activeOrg.role);

  const create = async () => {
    if (!activeId || !toCity.trim()) { Alert.alert("Missing info", "Choose a business account and a destination city."); return; }
    setBusy(true);
    try {
      const r = await OrgsAPI.createShipment(activeId, {
        p_dropoff_type: "door", p_size: size, p_from_city: "Ottawa", p_to_city: toCity.trim(),
        p_recipient_name: rcpt || null,
      });
      Alert.alert("Shipment created", r?.code || "Added to your invoice cycle.");
      setToCity(""); setRcpt(""); await load();
    } catch (e: any) { Alert.alert("Error", e?.message || "Failed to create shipment."); }
    setBusy(false);
  };

  const OrgChip = ({ o }: { o: MyOrg | null }) => {
    const id = o?.org_id ?? null;
    const on = activeId === id;
    return (
      <Pressable onPress={() => switchOrg(id)}
        style={{ borderWidth: 1.5, borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff",
          borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, marginRight: 8 }}>
        <Text style={{ color: on ? "#fff" : Colors.t2, fontWeight: "800", fontSize: 12.5 }}>{o ? o.name : "Personal"}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 10 }}>Business</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <OrgChip o={null} />
          {orgs.map((o) => <OrgChip key={o.org_id} o={o} />)}
        </ScrollView>

        {!activeOrg && <Text style={{ color: Colors.t2 }}>Select a business account to manage its shipments, or use Personal for your own parcels.</Text>}

        {activeOrg && (
          <>
            {ov && (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: Colors.t3 }}>In transit</Text><Text style={{ fontSize: 20, fontWeight: "800" }}>{ov.in_transit ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: Colors.t3 }}>Accrued</Text><Text style={{ fontSize: 20, fontWeight: "800" }}>{money(ov.accrued_cents)}</Text>
                </View>
              </View>
            )}

            {canShip && (
              <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <Text style={{ fontWeight: "800", marginBottom: 8 }}>New shipment</Text>
                <TextInput value={toCity} onChangeText={setToCity} placeholder="Destination city (e.g. Montréal)"
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, marginBottom: 8 }} />
                <TextInput value={rcpt} onChangeText={setRcpt} placeholder="Recipient name"
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, marginBottom: 8 }} />
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  {["envelope", "small", "large"].map((s) => (
                    <Pressable key={s} onPress={() => setSize(s)}
                      style={{ flex: 1, borderWidth: 1.5, borderColor: size === s ? Colors.accent : Colors.line, borderRadius: 999, paddingVertical: 8, alignItems: "center" }}>
                      <Text style={{ fontWeight: "700", fontSize: 12, color: size === s ? Colors.accent : Colors.t2 }}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={create} disabled={busy}
                  style={{ backgroundColor: Colors.accent, borderRadius: 11, padding: 13, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>{busy ? "Creating…" : "Create shipment"}</Text>
                </Pressable>
                <Text style={{ fontSize: 11, color: Colors.t3, marginTop: 8 }}>🔒 Billed to {activeOrg.name} on invoice — no card charged per shipment.</Text>
              </View>
            )}
          </>
        )}

        <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.t3, textTransform: "uppercase", marginBottom: 8 }}>
          {activeOrg ? `${activeOrg.name} shipments` : "Personal parcels"}
        </Text>
        {parcels.length === 0 && <Text style={{ color: Colors.t2 }}>No shipments yet.</Text>}
        {parcels.map((p) => (
          <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 12, marginBottom: 8, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "800", color: Colors.ink }}>{p.from_city} → {p.to_city}</Text>
              <Text style={{ fontWeight: "800", color: p.status === "delivered" ? Colors.green : Colors.accent, fontSize: 12 }}>{p.status.replace(/_/g, " ")}</Text>
            </View>
            <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{p.size} · #{p.code}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
