import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, RefreshControl, Linking, Modal, KeyboardAvoidingView, Platform } from "react-native";
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
  const [rEmail, setREmail] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [busy, setBusy] = useState(false);
  // edit modal
  const [editP, setEditP] = useState<Parcel | null>(null);
  const [ef, setEf] = useState<any>({});
  const [editBusy, setEditBusy] = useState(false);

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
  const canManage = !!activeOrg && ["owner", "admin", "finance"].includes(activeOrg.role);

  const openPortal = async () => {
    const url = "https://business.kolis.ca";
    try { await Linking.openURL(url); } catch { Alert.alert("Kolis", url); }
  };

  // Edit is org-only and allowed until a courier is assigned.
  const editable = (p: Parcel) => !!activeOrg && !p.driver_id && ["requested", "received_at_hub"].includes(p.status);
  const openEdit = (p: Parcel) => {
    setEf({
      p_recipient_name: p.recipient_name ?? "", p_recipient_phone: p.recipient_phone ?? "", p_recipient_email: p.recipient_email ?? "",
      p_dropoff_addr: p.dropoff_addr ?? "", p_to_city: p.to_city ?? "", p_dropoff_type: p.dropoff_type ?? "door", p_size: p.size ?? "small",
    });
    setEditP(p);
  };
  const eset = (k: string, v: string) => setEf((s: any) => ({ ...s, [k]: v }));
  const saveEdit = async () => {
    if (!editP || !activeId) return;
    setEditBusy(true);
    try {
      const r = await OrgsAPI.updateShipment(activeId, editP.id, ef);
      if (!r?.ok) {
        const m: Record<string, string> = {
          shipment_locked: "This shipment can no longer be edited — a courier has been assigned.",
          no_card: "The change raised the price, but there's no card on file to charge the difference.",
          payment_failed: "Couldn't charge the price difference — the card was declined.",
          not_found: "Shipment not found.",
        };
        Alert.alert("Kolis", m[r?.error || ""] || r?.error || "Failed.");
      } else {
        const a = r.adjustment || {};
        const note = a.charged_cents ? `Saved — charged +${money(a.charged_cents)} to the card.`
          : a.refunded_cents ? `Saved — refunded ${money(a.refunded_cents)}.` : "Saved.";
        setEditP(null); Alert.alert("Kolis", note); await load();
      }
    } catch (e: any) { Alert.alert("Kolis", e?.message || "Failed."); }
    setEditBusy(false);
  };
  const Seg = ({ val, opts, onPick }: { val: string; opts: [string, string][]; onPick: (v: string) => void }) => (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {opts.map(([v, label]) => (
        <Pressable key={v} onPress={() => onPick(v)}
          style={{ flex: 1, borderWidth: 1.5, borderColor: val === v ? Colors.accent : Colors.line, borderRadius: 999, paddingVertical: 8, alignItems: "center" }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: val === v ? Colors.accent : Colors.t2 }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const create = async () => {
    if (!activeId || !toCity.trim()) { Alert.alert("Missing info", "Choose a business account and a destination city."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rEmail.trim())) { Alert.alert("Recipient email required", "Enter a valid recipient email — we use it to notify them about the shipment."); return; }
    setBusy(true);
    try {
      const r = await OrgsAPI.createShipment(activeId, {
        p_dropoff_type: "door", p_size: size, p_from_city: "Ottawa", p_to_city: toCity.trim(),
        p_recipient_name: rcpt || null, p_recipient_email: rEmail.trim(), p_recipient_phone: rPhone.trim() || null,
      });
      Alert.alert("Shipment created", r?.code || "Added to your invoice cycle.");
      setToCity(""); setRcpt(""); setREmail(""); setRPhone(""); await load();
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

            {canManage && (
              <Pressable onPress={openPortal}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 12, padding: 13, marginBottom: 14 }}>
                <View>
                  <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 14 }}>Manage business account</Text>
                  <Text style={{ fontSize: 11.5, color: Colors.t3, marginTop: 2 }}>Billing, card on file, team, branding & invoices</Text>
                </View>
                <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 18 }}>→</Text>
              </Pressable>
            )}

            {canShip && (
              <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <Text style={{ fontWeight: "800", marginBottom: 8 }}>New shipment</Text>
                <TextInput value={toCity} onChangeText={setToCity} placeholder="Destination city (e.g. Montréal)"
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, marginBottom: 8 }} />
                <TextInput value={rcpt} onChangeText={setRcpt} placeholder="Recipient name"
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, marginBottom: 8 }} />
                <TextInput value={rEmail} onChangeText={setREmail} placeholder="Recipient email *" autoCapitalize="none" keyboardType="email-address"
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, marginBottom: 8 }} />
                <TextInput value={rPhone} onChangeText={setRPhone} placeholder="Recipient phone" keyboardType="phone-pad"
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, marginBottom: 8 }} />
                <Text style={{ fontSize: 11, color: Colors.t3, marginBottom: 8 }}>We email &amp; text the recipient when the shipment is created and as it moves.</Text>
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
                <Text style={{ fontSize: 11, color: Colors.t3, marginTop: 8 }}>🔒 Billed to {activeOrg.name}.</Text>
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
            <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{p.size} · {p.dropoff_type === "hub" ? "hub · " : ""}#{p.code}</Text>
            {editable(p) && (
              <Pressable onPress={() => openEdit(p)}
                style={{ marginTop: 8, alignSelf: "flex-start", borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12 }}>✏️ Edit</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Edit shipment modal (org shipments, editable until a courier is assigned) */}
      <Modal visible={!!editP} animationType="slide" transparent onRequestClose={() => !editBusy && setEditP(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" }}>
          <ScrollView style={{ maxHeight: "88%", backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.ink }}>Edit shipment{editP ? ` · ${editP.code}` : ""}</Text>
              <Pressable onPress={() => !editBusy && setEditP(null)}><Text style={{ fontSize: 22, color: Colors.t2 }}>✕</Text></Pressable>
            </View>
            <Text style={{ fontSize: 12.5, color: Colors.t2, marginBottom: 14 }}>
              Editable until a courier is assigned. Price updates automatically — any difference is charged or refunded to the card on file.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.t3, marginBottom: 6 }}>PICKUP TYPE</Text>
            <Seg val={ef.p_dropoff_type} onPick={(v) => eset("p_dropoff_type", v)} opts={[["door", "Door"], ["hub", "Hub"], ["zone", "Zone"]]} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.t3, marginTop: 14, marginBottom: 6 }}>SIZE</Text>
            <Seg val={ef.p_size} onPick={(v) => eset("p_size", v)} opts={[["envelope", "Envelope"], ["small", "Small"], ["large", "Large"]]} />

            {[["Destination city", "p_to_city", "Montréal"], ["Recipient name", "p_recipient_name", "Name"], ["Recipient phone", "p_recipient_phone", "(514) 555-0148"], ["Recipient email", "p_recipient_email", "name@email.com"], ["Delivery address", "p_dropoff_addr", "Street, unit, postal code"]].map(([label, key, ph]) => (
              <View key={key} style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.t3, marginBottom: 6 }}>{label.toUpperCase()}</Text>
                <TextInput value={ef[key] ?? ""} onChangeText={(v) => eset(key, v)} placeholder={ph}
                  autoCapitalize={key === "p_recipient_email" ? "none" : "sentences"} keyboardType={key === "p_recipient_phone" ? "phone-pad" : key === "p_recipient_email" ? "email-address" : "default"}
                  style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 10, padding: 11, backgroundColor: "#fff" }} />
              </View>
            ))}

            <Pressable onPress={saveEdit} disabled={editBusy}
              style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20, opacity: editBusy ? 0.6 : 1 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{editBusy ? "Saving…" : "Save changes"}</Text>
            </Pressable>
            <Pressable onPress={() => !editBusy && setEditP(null)} style={{ padding: 12, alignItems: "center", marginTop: 4 }}>
              <Text style={{ color: Colors.t2, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
