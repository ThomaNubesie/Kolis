import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator, Alert, Linking, Platform, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStripe } from "@stripe/stripe-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { HubsAPI, Hub } from "../../services/hubs";
import { ParcelsAPI } from "../../services/parcels";
import { PaymentsAPI } from "../../services/payments";
import { SizeKey } from "../../constants/pricing";
import { watchLocation } from "../../services/location";
import { haversineKm, kmLabel } from "../../constants/distance";

const ARRIVE_KM = 0.15; // ~150 m geofence
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Real photo of the hub: Street View if imagery exists there, else a map tile.
const streetViewUrl = (lat: number, lng: number) =>
  `https://maps.googleapis.com/maps/api/streetview?size=640x400&location=${lat},${lng}&fov=80&pitch=8&key=${GMAPS_KEY}`;
const staticMapUrl = (lat: number, lng: number) =>
  `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=640x400&scale=2&markers=color:0xE11D6B%7C${lat},${lng}&key=${GMAPS_KEY}`;

export default function Directions() {
  const { t } = useStrings();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const p = useLocalSearchParams<{ size: string; from: string; to: string; price: string; pickup_hub: string; hubName: string; hubAddr: string; form?: string }>();
  const price = Number(p.price ?? 0);
  const form = p.form ? JSON.parse(p.form) : {};
  const premium = form?.insured && form?.declared_value ? Number(form.declared_value) * 0.05 : 0;
  const total = price + premium;

  const [hub, setHub] = useState<Hub | null>(null);
  const [hubImg, setHubImg] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    HubsAPI.listActive().then(({ hubs }) => setHub(hubs.find((h) => h.id === p.pickup_hub) ?? null));
  }, [p.pickup_hub]);

  // Resolve a real picture of the hub: Street View where available, else a map.
  useEffect(() => {
    if (!GMAPS_KEY || !hub || hub.latitude == null || hub.longitude == null) return;
    const lat = hub.latitude, lng = hub.longitude;
    let cancelled = false;
    fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${GMAPS_KEY}`)
      .then((r) => r.json())
      .then((m) => { if (!cancelled) setHubImg(m?.status === "OK" ? streetViewUrl(lat, lng) : staticMapUrl(lat, lng)); })
      .catch(() => { if (!cancelled) setHubImg(staticMapUrl(lat, lng)); });
    return () => { cancelled = true; };
  }, [hub]);

  // Live distance to the hub; auto-arrive within the geofence.
  useEffect(() => {
    if (!hub || hub.latitude == null || hub.longitude == null) return;
    let stop = () => {};
    watchLocation((c) => {
      const d = haversineKm(c.lat, c.lng, hub.latitude as number, hub.longitude as number);
      setDistance(d);
      if (d <= ARRIVE_KM) setArrived(true);
    }).then((fn) => { stop = fn; });
    return () => stop();
  }, [hub]);

  const openMaps = () => {
    const dest = hub && hub.latitude != null ? `${hub.latitude},${hub.longitude}` : encodeURIComponent(p.hubAddr || p.hubName || "");
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${dest}&dirflg=d`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
    })!;
    Linking.openURL(url).catch(() => {});
  };

  const pay = async () => {
    setBusy(true);
    const { parcel, error } = await ParcelsAPI.create({
      dropoff_type: "hub",
      size: (p.size as SizeKey) ?? "small",
      from_city: p.from ?? "",
      to_city: p.to ?? "",
      pickup_hub: p.pickup_hub,
      price,
      ...form,
    });
    if (error || !parcel) { setBusy(false); Alert.alert("Kolis", error ?? t("paymentError")); return; }
    const { clientSecret, error: pErr } = await PaymentsAPI.createIntent(parcel.id);
    if (pErr || !clientSecret) { setBusy(false); Alert.alert(t("payment"), pErr ?? t("paymentError")); return; }
    const init = await initPaymentSheet({ merchantDisplayName: "Kolis", paymentIntentClientSecret: clientSecret, allowsDelayedPaymentMethods: false });
    if (init.error) { setBusy(false); Alert.alert(t("payment"), init.error.message); return; }
    const res = await presentPaymentSheet();
    setBusy(false);
    if (res.error) {
      if (res.error.code !== "Canceled") Alert.alert(t("payment"), res.error.message || t("paymentError"));
      return;
    }
    // Paid + dropped at hub → propose to Kolis-member drivers heading to the city.
    ParcelsAPI.notifyDrivers(parcel.id);
    router.replace({ pathname: "/(app)/request", params: { id: parcel.id, to: p.to ?? "", drop: "hub", where: p.hubName ?? "" } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      {/* Real hub backdrop (Street View / map) with a soft scrim, else paper. */}
      {hubImg ? (
        <Image source={{ uri: hubImg }} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#e9e6dd" }} />
      )}
      {hubImg ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(247,245,239,0.35)" }} /> : null}
      <View style={{ padding: 16 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 10 }}>← {t("back")}</Text></Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#fff", borderRadius: 14, padding: 12, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
          <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 17 }}>🏢</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.ink }}>{p.hubName}</Text>
            <Text style={{ fontSize: 11, color: Colors.t2 }}>{p.hubAddr || (hub?.address ?? "")}{distance != null ? `  ·  ${kmLabel(distance)} km` : ""}</Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {!hubImg && <Text style={{ fontSize: 54 }}>🗺️</Text>}
        <View style={{ backgroundColor: hubImg ? "rgba(15,26,23,0.78)" : "transparent", borderRadius: 999, paddingHorizontal: hubImg ? 14 : 0, paddingVertical: hubImg ? 8 : 0, marginTop: hubImg ? 0 : 8 }}>
          <Text style={{ color: hubImg ? "#fff" : Colors.t2, fontSize: 13, paddingHorizontal: 8, textAlign: "center", fontWeight: hubImg ? "700" : "400" }}>
            📍 {distance != null ? t("hubDistanceAway", { km: kmLabel(distance) }) : t("headToHub")}
          </Text>
        </View>
      </View>

      <View style={{ padding: 16, paddingBottom: 26 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 14, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: Colors.t2 }}>{t("payAtHubNote")}{premium > 0 ? ` · +C$${premium.toFixed(2)} ${t("insuranceSection").toLowerCase()}` : ""}</Text>
            <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.ink }}>C${total.toFixed(2)}</Text>
          </View>
          <Pressable onPress={openMaps} style={{ backgroundColor: Colors.ink, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 9 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>🧭 {t("openInMaps")}</Text>
          </Pressable>
          <Pressable onPress={() => setArrived(true)} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t("iveArrived")}</Text>
          </Pressable>
        </View>
      </View>

      {/* arrival payment sheet */}
      <Modal visible={arrived} transparent animationType="fade" onRequestClose={() => !busy && setArrived(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "center", padding: 26 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 30 }}>📍</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink, marginTop: 8 }}>{t("atTheHub")}</Text>
            <Text style={{ fontSize: 12, color: Colors.t2, textAlign: "center", marginTop: 4, marginBottom: 16, lineHeight: 17 }}>{t("payToDrop", { hub: p.hubName ?? "" })}</Text>
            <View style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: 12, marginBottom: 14 }}>
              <Text style={{ fontWeight: "800", color: Colors.ink }}>{t("payNow")}</Text>
              <Text style={{ fontWeight: "800", color: Colors.ink }}>C${total.toFixed(2)}</Text>
            </View>
            <Pressable onPress={pay} disabled={busy} style={{ alignSelf: "stretch", backgroundColor: Colors.accent, borderRadius: 13, padding: 15, alignItems: "center" }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("payAndDrop", { amount: total.toFixed(2) })}</Text>}
            </Pressable>
            {!busy && (
              <Pressable onPress={() => setArrived(false)} style={{ padding: 10, marginTop: 4 }}>
                <Text style={{ color: Colors.t3, fontSize: 12.5 }}>{t("notYet")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
