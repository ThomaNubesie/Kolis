// Parcels this courier is carrying + deliver via the recipient's 4-digit code
// (captures the escrow through kolis-finalize-payment). Courier never sees the
// sender's price — only their own payout.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator, Linking, Platform, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI, CourierParcel, Journey } from "../../services/courier";
import { watchLocation, Coords } from "../../services/location";
import { PickupFallbacks } from "../../components/PickupFallbacks";
import { CourierJourney, kmBetween } from "../../components/CourierJourney";

// Within this distance of the drop-off the parcel opens on the delivery flow;
// farther out it shows the journey timeline. The courier can switch either way.
const DELIVERY_SWITCH_KM = 25;
import { drainScannedCodes } from "../../services/scanBridge";
import * as ImagePicker from "expo-image-picker";
import { DeliveryReceiptModal, DeliveryReceiptData } from "../../components/DeliveryReceiptModal";
import { Package, Mail, Luggage, Camera, Truck, Building2, DoorOpen, Navigation, Lock, CheckCircle2, MapPin, Phone } from "lucide-react-native";

const SizeIcon = ({ size, px = 22, color = Colors.ink }: { size: string; px?: number; color?: string }) => {
  if (size === "envelope") return <Mail size={px} color={color} strokeWidth={2} />;
  if (size === "large") return <Luggage size={px} color={color} strokeWidth={2} />;
  return <Package size={px} color={color} strokeWidth={2} />;
};


// Scan fills the code automatically — but a parcel can turn up with no label on it,
// or the QR won't take, and then the courier was stranded: the confirm button stays
// disabled and there was no other way to fill the field. The RPCs have always
// accepted a typed code (kolis_courier_pickup / kolis-finalize-payment check it
// server-side), so offer manual entry alongside the scan.
const CodeEntry = ({ value, onChange, onScan, fr }: {
  value: string; onChange: (v: string) => void; onScan: () => void; fr: boolean;
}) => (
  <>
    <Pressable onPress={onScan} style={{ borderWidth: 1.5, borderColor: Colors.accent, borderStyle: "dashed", borderRadius: 11, padding: 14, alignItems: "center", backgroundColor: Colors.bg, marginBottom: 10 }}>
      <Camera size={22} color={Colors.accent} strokeWidth={1.8} />
      <Text style={{ fontSize: 12.5, color: Colors.accent, fontWeight: "800", marginTop: 4, textAlign: "center" }}>
        {fr ? "Scannez le QR (étiquette ou écran de l'expéditeur) à moins de 1000 m" : "Scan the QR (label or sender's screen) within 1000 m"}
      </Text>
    </Pressable>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: Colors.line }} />
      <Text style={{ fontSize: 11, color: Colors.t3, fontWeight: "700" }}>{fr ? "ou" : "or"}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: Colors.line }} />
    </View>
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 4))}
      keyboardType="number-pad"
      maxLength={4}
      placeholder={fr ? "Entrez le code à 4 chiffres" : "Enter the 4-digit code"}
      placeholderTextColor={Colors.t3}
      style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 12, marginBottom: 10, fontSize: 18, fontWeight: "800", letterSpacing: 6, textAlign: "center", color: Colors.ink, backgroundColor: Colors.card }}
    />
    <Text style={{ fontSize: 10.5, color: Colors.t3, textAlign: "center", marginTop: -4, marginBottom: 10 }}>
      {fr ? "Le code est vérifié par le serveur." : "The code is checked by the server."}
    </Text>
  </>
);

export default function Carrying() {
  const { t, lang } = useStrings();
  const fr = lang === "fr";
  const router = useRouter();
  const [list, setList] = useState<CourierParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [pcodes, setPcodes] = useState<Record<string, string>>({});
  // "<parcel id>:pickup" / "<parcel id>:delivery" whose code came from the scanner
  // (vs typed by hand) — keyed per stage, since one parcel has both.
  const [scanned, setScanned] = useState<Record<string, boolean>>({});
  // parcel whose delivery card to show once the payout receipt is dismissed
  const [cardFor, setCardFor] = useState<{ id: string; who: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DeliveryReceiptData | null>(null);
  // Picked-up parcels: their journey (events + drop-off coords), the courier's
  // position, and a manual journey/deliver choice that overrides the 25 km rule.
  const [journeys, setJourneys] = useState<Record<string, Journey>>({});
  const [pos, setPos] = useState<Coords | null>(null);
  const [view, setView] = useState<Record<string, "journey" | "deliver">>({});

  const load = useCallback(() => {
    setLoading(true);
    CourierAPI.carrying().then(async (l) => {
      setList(l);
      const moving = l.filter((x) => x.status !== "matched");
      const js = await Promise.all(moving.map((x) => CourierAPI.journey(x.id).catch(() => null)));
      setJourneys(Object.fromEntries(moving.map((x, i) => [x.id, js[i]]).filter(([, j]) => !!j)) as Record<string, Journey>);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Live position while this screen is open, for the 25 km switch.
  useFocusEffect(useCallback(() => {
    let stop: (() => void) | null = null, gone = false;
    watchLocation(setPos).then((u) => { if (gone) u(); else stop = u; });
    return () => { gone = true; stop?.(); };
  }, []));
  // On focus: reload, then drain any code the QR scanner stashed while in the
  // 1000 m geofence and auto-fill the matching input. The driver never types it.
  useFocusEffect(useCallback(() => {
    load();
    const drained = drainScannedCodes();
    const p: Record<string, string> = {}, d: Record<string, string> = {};
    for (const [id, e] of Object.entries(drained)) {
      if (e.kind === "pickup") p[id] = e.code; else d[id] = e.code;
    }
    if (Object.keys(p).length) setPcodes((c) => ({ ...c, ...p }));
    if (Object.keys(d).length) setCodes((c) => ({ ...c, ...d }));
    const scannedKeys = [...Object.keys(p).map((k) => `${k}:pickup`), ...Object.keys(d).map((k) => `${k}:delivery`)];
    if (scannedKeys.length) setScanned((c) => ({ ...c, ...Object.fromEntries(scannedKeys.map((k) => [k, true])) }));
  }, [load]));

  // Open the platform maps app with turn-by-turn directions to an address.
  const openDirections = async (addr: string) => {
    const dst = encodeURIComponent(addr);
    const web = `https://www.google.com/maps/dir/?api=1&destination=${dst}`;
    const nativeUrl = Platform.select({
      ios: `http://maps.apple.com/?daddr=${dst}&dirflg=d`,
      android: `google.navigation:q=${dst}`,
      default: web,
    })!;
    try {
      const ok = await Linking.canOpenURL(nativeUrl);
      await Linking.openURL(ok ? nativeUrl : web);
    } catch {
      try { await Linking.openURL(web); } catch { Alert.alert("Kolis", addr); }
    }
  };

  const pickup = async (p: CourierParcel) => {
    const code = (pcodes[p.id] || "").trim();
    if (code.length < 4) return;
    setBusyId(p.id);
    const res = await CourierAPI.markPickedUp(p.id, code);
    setBusyId(null);
    if (res !== "ok") { Alert.alert("Kolis", res === "bad_code" ? t("badPickupCode") : t("badCode")); return; }
    setPcodes((c) => ({ ...c, [p.id]: "" }));
    await afterPickup(p);
  };

  // Pickup photo: it goes on the pickup card the recipient receives. Same rule as
  // the drop-off shot — asked, never blocking. Runs after any way of picking up
  // (code, scan, sender-confirmed handover).
  const afterPickup = async (p: CourierParcel) => {
    const took = await captureProof(p, "picked_up");
    load();
    if (took) router.push(`/(app)/card?parcel=${p.id}&kind=picked_up&recipient=${encodeURIComponent(p.recipient_name || "")}` as never);
  };

  // Camera prompt for the pickup / drop-off shot. Returns true once a photo is
  // stored, false if the courier declined twice or the camera failed.
  const captureProof = async (p: CourierParcel, kind: "picked_up" | "delivered"): Promise<boolean> => {
    const atPickup = kind === "picked_up";
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, exif: false });
        if (!shot.canceled && shot.assets?.[0]?.uri) {
          const url = await CourierAPI.uploadProof(p.id, p.code, shot.assets[0].uri, kind);
          if (!url) Alert.alert("Kolis", fr ? `Photo non envoyée — ${atPickup ? "le ramassage" : "la livraison"} reste enregistré${atPickup ? "" : "e"}.` : `Photo upload failed — the ${atPickup ? "pickup" : "delivery"} is still recorded.`);
          return !!url;
        }
        if (attempt === 0) {
          Alert.alert("Kolis", atPickup
            ? (fr ? "Une photo du colis ramassé est demandée — elle figure sur la carte envoyée au destinataire." : "A photo of the parcel you picked up is requested — it goes on the card sent to the recipient.")
            : (fr ? "Une photo du colis livré est demandée comme preuve de livraison." : "A photo of the delivered parcel is required as proof of delivery."));
        }
      }
    } catch { /* a camera failure must never block a completed pickup / delivery */ }
    return false;
  };

  const deliver = async (p: CourierParcel) => {
    const code = (codes[p.id] || "").trim();
    if (code.length < 4) return;
    setBusyId(p.id);
    const { ok, error } = await CourierAPI.deliver(p.id, code);
    setBusyId(null);
    if (!ok) {
      const m = error === "bad_code" ? t("badCode")
        : error === "payment_not_captured" ? (fr ? "Paiement non encaissé pour ce colis — contactez la répartition avant de livrer." : "Payment not captured for this parcel — contact dispatch before delivering.")
        : (error || t("badCode"));
      Alert.alert("Kolis", m); return;
    }
    setCodes((c) => ({ ...c, [p.id]: "" }));
    // Proof of delivery, right after the delivery is accepted: the photo is what the
    // sender and recipient get on their delivered card, and the only evidence if the
    // drop is ever disputed. Asked twice, but never blocking — the parcel is already
    // delivered at this point and a camera problem must not strand the courier.
    await captureProof(p, "delivered");
    setCardFor({ id: p.id, who: p.recipient_name || "" });
    // Walled receipt: courier branch returns payout only.
    const r = await CourierAPI.receipt(p.id).catch(() => null);
    if (r) {
      setReceipt({
        receiptId: r.code, fromCity: r.from_city, toCity: r.to_city, size: r.size,
        dropoffType: r.dropoff_type, amountLabel: t("yourPayout"), amountCents: r.payout_cents,
        dateISO: r.delivered_at || r.created_at,
      });
    } else {
      Alert.alert("Kolis", t("delivered"));
    }
    load();
  };

  const payout = (p: CourierParcel) => Math.round((p.driver_payout_cents ?? 0) / 100);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}
      >
        <Pressable onPress={() => router.push("/(app)/delivered" as never)}
          style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.accentDk }}>{fr ? "Mes livraisons" : "My deliveries"}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, flex: 1 }}>{t("carrying")}</Text>
          <Pressable onPress={() => router.push("/(app)/scan" as never)} style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#E11D6B", borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 }}>
            <Camera size={15} color="#fff" strokeWidth={2.2} /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 13.5 }}>Scan QR</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 13, color: Colors.t2, marginBottom: 18 }}>{t("carryingSub")}</Text>

        {!loading && list.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Truck size={40} color={Colors.ink} strokeWidth={1.8} />
            <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, marginTop: 12 }}>{t("noneCarrying")}</Text>
          </View>
        )}

        {list.map((p) => {
          const isHub = p.dropoff_type === "hub";
          const gotIt = p.status !== "matched"; // picked_up / in_transit → possession confirmed
          const pickupWhere = isHub ? (p.pickup_hub_name || "") : (p.pickup_addr || "");
          return (
            <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 16, padding: 15, marginBottom: 14, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <SizeIcon size={p.size} px={22} color={Colors.ink} />
                <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.ink, flex: 1 }}>#{p.code} {t("forDest")} {p.to_city}</Text>
              </View>

              {/* STAGE 1 — before pickup: pickup address + tap-to-navigate + "I have it" */}
              {!gotIt && (
                <>
                  {pickupWhere ? (
                    <Pressable onPress={() => openDirections(pickupWhere)} style={{ backgroundColor: Colors.bg, borderRadius: 11, padding: 11, marginBottom: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{isHub ? t("pickupHub") : t("pickupDoor")}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {isHub ? <Building2 size={13.5} color={Colors.ink} strokeWidth={2.2} /> : <DoorOpen size={13.5} color={Colors.ink} strokeWidth={2.2} />}
                        <Text style={{ fontSize: 13.5, color: Colors.ink, fontWeight: "700" }}>{pickupWhere}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Navigation size={11.5} color={Colors.accent} strokeWidth={2.2} />
                        <Text style={{ fontSize: 11.5, color: Colors.accent, fontWeight: "800" }}>{t("directions")}</Text>
                      </View>
                    </Pressable>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <Lock size={11.5} color={Colors.t3} strokeWidth={2.2} />
                    <Text style={{ fontSize: 11.5, color: Colors.t3 }}>{t("recipientMasked")}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{fr ? "Code de ramassage" : "Pickup code"}</Text>
                  {scanned[`${p.id}:pickup`] && (pcodes[p.id] || "").length >= 4 ? (
                    <View style={{ borderWidth: 1.5, borderColor: "#178a5e", borderRadius: 11, padding: 12, backgroundColor: "rgba(23,138,94,0.08)", marginBottom: 10 }}>
                      <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: Colors.ink }}>{pcodes[p.id]}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
                        <CheckCircle2 size={10.5} color="#178a5e" strokeWidth={2.2} />
                        <Text style={{ fontSize: 10.5, color: "#178a5e", fontWeight: "700" }}>{fr ? "Rempli par le scan" : "Filled by scan"}</Text>
                      </View>
                    </View>
                  ) : (
                    <CodeEntry fr={fr} value={pcodes[p.id] || ""}
                      onChange={(v) => setPcodes((c) => ({ ...c, [p.id]: v }))}
                      onScan={() => router.push("/(app)/scan" as never)} />
                  )}
                  <Pressable onPress={() => pickup(p)} disabled={busyId === p.id || (pcodes[p.id] || "").trim().length < 4} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, backgroundColor: Colors.accent, borderRadius: 12, padding: 14, opacity: (busyId === p.id || (pcodes[p.id] || "").trim().length < 4) ? 0.55 : 1 }}>
                    {busyId === p.id ? <ActivityIndicator color="#fff" /> : <><Package size={14} color="#fff" strokeWidth={2.2} /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("confirmPickup")}</Text></>}
                  </Pressable>
                  <PickupFallbacks parcelId={p.id} code={p.code} fr={fr}
                    onCode={(code) => { setPcodes((c) => ({ ...c, [p.id]: code })); setScanned((c) => ({ ...c, [`${p.id}:pickup`]: true })); }}
                    onPickedUp={() => afterPickup(p)} />
                </>
              )}

              {/* STAGE 2 — after pickup: delivery address + recipient + deliver code */}
              {gotIt && (() => {
                const j = journeys[p.id];
                const dist = pos && j ? kmBetween(pos, j.dropoff) : null;
                const auto = dist == null || dist <= DELIVERY_SWITCH_KM ? "deliver" : "journey";
                const mode = view[p.id] ?? auto;
                if (mode === "journey" && j) return (
                  <CourierJourney j={j} fr={fr} distanceKm={dist}
                    onDeliver={() => setView((v) => ({ ...v, [p.id]: "deliver" }))}
                    onDirections={() => p.dropoff_addr && openDirections(p.dropoff_addr)} />
                );
                return (
                <>
                  {j ? (
                    <Pressable onPress={() => setView((v) => ({ ...v, [p.id]: "journey" }))} hitSlop={8} style={{ alignSelf: "flex-start", marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.accentDk }}>‹ {fr ? "Voir le trajet" : "View the trip"}</Text>
                    </Pressable>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <CheckCircle2 size={11} color="#178a5e" strokeWidth={2.2} />
                    <Text style={{ fontSize: 11, color: "#178a5e", fontWeight: "700" }}>{t("pickedUpNote")}</Text>
                  </View>
                  {p.dropoff_addr ? (
                    <Pressable onPress={() => openDirections(p.dropoff_addr!)} style={{ backgroundColor: Colors.bg, borderRadius: 11, padding: 11, marginBottom: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{t("deliveryAddress")}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <MapPin size={13.5} color={Colors.ink} strokeWidth={2.2} />
                        <Text style={{ fontSize: 13.5, color: Colors.ink, fontWeight: "700", flex: 1 }}>{p.dropoff_addr}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Navigation size={11.5} color={Colors.accent} strokeWidth={2.2} />
                        <Text style={{ fontSize: 11.5, color: Colors.accent, fontWeight: "800" }}>{t("directions")}</Text>
                      </View>
                    </Pressable>
                  ) : null}
                  {(p.recipient_name || p.recipient_phone) ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("recipient")}</Text>
                        <Text style={{ fontSize: 13, color: Colors.ink, fontWeight: "700" }}>{p.recipient_name || "—"}</Text>
                      </View>
                      {p.recipient_phone ? (
                        <Pressable onPress={() => Linking.openURL(`tel:${p.recipient_phone}`)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                          <Phone size={12.5} color={Colors.accent} strokeWidth={2.2} />
                          <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12.5 }}>{t("callRecipient")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{fr ? "Code de livraison" : "Delivery code"}</Text>
                  {scanned[`${p.id}:delivery`] && (codes[p.id] || "").length >= 4 ? (
                    <View style={{ borderWidth: 1.5, borderColor: "#178a5e", borderRadius: 11, padding: 12, backgroundColor: "rgba(23,138,94,0.08)", marginBottom: 10 }}>
                      <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: Colors.ink }}>{codes[p.id]}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
                        <CheckCircle2 size={10.5} color="#178a5e" strokeWidth={2.2} />
                        <Text style={{ fontSize: 10.5, color: "#178a5e", fontWeight: "700" }}>{fr ? "Rempli par le scan" : "Filled by scan"}</Text>
                      </View>
                    </View>
                  ) : (
                    <CodeEntry fr={fr} value={codes[p.id] || ""}
                      onChange={(v) => setCodes((c) => ({ ...c, [p.id]: v }))}
                      onScan={() => router.push("/(app)/scan" as never)} />
                  )}
                  <Pressable onPress={() => deliver(p)} disabled={busyId === p.id || (codes[p.id] || "").trim().length < 4} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center", opacity: (busyId === p.id || (codes[p.id] || "").trim().length < 4) ? 0.55 : 1 }}>
                    {busyId === p.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("markDelivered")}</Text>}
                  </Pressable>
                  <Text style={{ color: "#178a5e", fontSize: 11.5, textAlign: "center", marginTop: 8, fontWeight: "700" }}>+C${payout(p)} {t("released")}</Text>
                </>
                );
              })()}
            </View>
          );
        })}
      </ScrollView>
      <DeliveryReceiptModal visible={!!receipt} data={receipt} onClose={() => {
        setReceipt(null);
        // The payout receipt is the courier's money; the card is the customer's proof.
        // Show the card right after, so they can pass it on while they're still there.
        if (cardFor) {
          const c = cardFor; setCardFor(null);
          router.push(`/(app)/card?parcel=${c.id}&kind=delivered&recipient=${encodeURIComponent(c.who)}` as never);
        }
      }} />
    </SafeAreaView>
  );
}
