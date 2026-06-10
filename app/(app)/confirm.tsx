import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStripe } from "@stripe/stripe-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI } from "../../services/parcels";
import { PaymentsAPI } from "../../services/payments";
import { SizeKey, DropType } from "../../constants/pricing";

export default function Confirm() {
  const { t } = useStrings();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const p = useLocalSearchParams<{ drop: string; size: string; from: string; to: string; price: string; pickup_zone?: string; pickup_hub?: string; pickup_addr?: string; zoneName?: string; hubName?: string; preferred_driver_name?: string; preferred_driver_id?: string; form?: string }>();
  const [busy, setBusy] = useState(false);
  const price = Number(p.price ?? 0);
  const drop = (p.drop as DropType) ?? "zone";
  const form = p.form ? JSON.parse(p.form) : {};

  const request = async () => {
    setBusy(true);
    const { parcel, error } = await ParcelsAPI.create({
      dropoff_type: drop,
      size: (p.size as SizeKey) ?? "small",
      from_city: p.from ?? "",
      to_city: p.to ?? "",
      pickup_zone: p.pickup_zone ?? null,
      pickup_hub: p.pickup_hub ?? null,
      pickup_addr: p.pickup_addr ?? null,
      price,
      preferred_driver_id: p.preferred_driver_id || null,
      ...form,
    });
    if (error || !parcel) { setBusy(false); Alert.alert("Error", error ?? "Could not create the request."); return; }

    // Escrow hold via Stripe (manual-capture PaymentIntent), then PaymentSheet.
    const { clientSecret, error: pErr } = await PaymentsAPI.createIntent(parcel.id);
    if (pErr || !clientSecret) { setBusy(false); Alert.alert(t("payment"), pErr ?? t("paymentError")); return; }

    const init = await initPaymentSheet({ merchantDisplayName: "Kolis", paymentIntentClientSecret: clientSecret, allowsDelayedPaymentMethods: false });
    if (init.error) { setBusy(false); Alert.alert(t("payment"), init.error.message); return; }

    const res = await presentPaymentSheet();
    setBusy(false);
    if (res.error) {
      if (res.error.code !== "Canceled") Alert.alert(t("payment"), res.error.message || t("paymentError"));
      return; // parcel stays pending/unpaid; sender can retry
    }
    // Authorized & held — funds captured on delivery. Ping queued drivers.
    if (drop === "door") ParcelsAPI.notifyDrivers(parcel.id);
    router.replace({ pathname: "/(app)/request", params: { id: parcel.id, to: p.to ?? "", drop, where: p.hubName || p.zoneName || "" } });
  };

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 10 }}>{children}</View>
  );

  const dropLine = drop === "hub"
    ? `${t("dropAtHub")} ${p.hubName ?? ""}`
    : drop === "zone"
      ? `${t("dropAt")} ${p.zoneName ?? ""}`
      : t("doorToDoor");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink, marginBottom: 14 }}>{t("confirmPay")}</Text>

        <Card>
          <Text style={{ fontWeight: "800", fontSize: 16, color: Colors.ink }}>{p.from} → {p.to}</Text>
          <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 6 }}>{dropLine}</Text>
          {p.preferred_driver_name ? (
            <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 4 }}>🚗 {t("driverLabel")}: <Text style={{ fontWeight: "800", color: Colors.ink }}>{p.preferred_driver_name}</Text></Text>
          ) : null}
        </Card>

        <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 4, fontWeight: "600" }}>{t("payment")}</Text>
        <Card><Text style={{ fontWeight: "700", color: Colors.ink }}>💳 Visa •••• 4242</Text></Card>
        <Card><Text style={{ fontWeight: "700", color: Colors.t2 }}>＋ {t("addCard")}</Text></Card>

        <View style={{ backgroundColor: Colors.ink, borderRadius: 15, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 10, color: "#fff", opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("totalEscrow")}</Text>
            <Text style={{ fontSize: 24, fontWeight: "800", color: "#ff7eb0" }}>C${price.toFixed(2)}</Text>
          </View>
          <Text style={{ fontSize: 11, color: "#fff", opacity: 0.75, maxWidth: 120, textAlign: "right" }}>{t("releasedOnDelivery")}</Text>
        </View>
        <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 14 }}>🔒 {t("chargedWhenDispatched")}</Text>

        <Pressable onPress={request} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: busy ? 0.7 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("holdRequest", { amount: price })}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
