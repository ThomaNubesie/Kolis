// Kolis onboarding payment — runs AFTER identity is confirmed. First 100 members
// per role are free; everyone else pays the verification + membership fee in
// their local currency with multi-country tax, via Stripe PaymentSheet.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStripe } from "@stripe/stripe-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { VerificationAPI, FeeQuote } from "../../services/verification";
import { formatCurrency, COUNTRY_CURRENCY, CountryCode } from "../../constants/currency";

export default function Pay() {
  const router = useRouter();
  const { t } = useStrings();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"founding" | "pay">("pay");
  const [q, setQ] = useState<FeeQuote>({});
  const [country, setCountry] = useState<CountryCode>("CA");
  const [busy, setBusy] = useState(false);

  const currency = COUNTRY_CURRENCY[country] || "CAD";
  const fmt = (cents?: number) => formatCurrency((cents ?? 0) / 100, currency);

  useEffect(() => {
    (async () => {
      const c = ((await AsyncStorage.getItem("userCountry")) as CountryCode) || "CA";
      setCountry(c);
      const res = await VerificationAPI.quote();
      if (!("error" in res) || !res.error) {
        if (res.already_paid) { router.replace("/(app)/send"); return; }
        setQ(res);
        setMode(res.founding ? "founding" : "pay");
      }
      setLoading(false);
    })();
  }, []);

  const toReceipt = (params: Record<string, string>) =>
    router.replace({ pathname: "/(auth)/receipt", params: { country, ...params } });

  const activateFree = async () => {
    setBusy(true);
    const r = await VerificationAPI.activateFree();
    setBusy(false);
    if (r.ok) { toReceipt({ receiptId: `KL-${String(Date.now()).slice(-6)}`, founding: "1", total: "0" }); return; }
    if (r.founding === false) {
      // Last spot was taken while we were here — switch to paying.
      const res = await VerificationAPI.quote();
      if (!("error" in res) || !res.error) setQ(res);
      setMode("pay");
      return;
    }
    Alert.alert("Kolis", r.error || t("payCouldNotActivate"));
  };

  const pay = async () => {
    setBusy(true);
    const res = await VerificationAPI.createIntent();
    if (res.error || !res.client_secret) { setBusy(false); Alert.alert("Kolis", res.error || t("payCouldNotStart")); return; }
    const init = await initPaymentSheet({ merchantDisplayName: "Kolis", paymentIntentClientSecret: res.client_secret, allowsDelayedPaymentMethods: false });
    if (init.error) { setBusy(false); Alert.alert("Kolis", init.error.message); return; }
    const pres = await presentPaymentSheet();
    if (pres.error) {
      setBusy(false);
      if (pres.error.code !== "Canceled") Alert.alert("Kolis", pres.error.message);
      return;
    }
    await VerificationAPI.finalize(res.payment_intent_id!);
    setBusy(false);
    toReceipt({
      receiptId: res.payment_intent_id!, founding: "0",
      verify: String(res.verify ?? 399), membership: String(res.membership ?? 1000),
      subtotal: String(res.subtotal ?? 1399), tax: String(res.tax ?? 0), total: String(res.total ?? 0),
    });
  };

  const Primary = ({ label, onPress, loading: l }: { label: string; onPress: () => void; loading?: boolean }) => (
    <Pressable onPress={onPress} disabled={l} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: l ? 0.5 : 1 }}>
      {l ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
  const Line = ({ label, value, muted, total }: { label: string; value: string; muted?: boolean; total?: boolean }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: total ? 9 : 5, borderTopWidth: total ? 1 : 0, borderTopColor: Colors.line, marginTop: total ? 5 : 0 }}>
      <Text style={{ fontSize: total ? 15 : 13, fontWeight: total ? "900" : "600", color: muted ? Colors.t2 : Colors.ink }}>{label}</Text>
      <Text style={{ fontSize: total ? 15 : 13, fontWeight: total ? "900" : "600", color: muted ? Colors.t2 : Colors.ink }}>{value}</Text>
    </View>
  );

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={Colors.accent} size="large" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40, flexGrow: 1 }}>
        <View style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 19 }}>Ko</Text>
        </View>

        {mode === "founding" ? (
          <>
            <Text style={{ fontSize: 23, fontWeight: "900", color: Colors.ink, marginBottom: 14 }}>{t("payAlmostThere")}</Text>
            <View style={{ backgroundColor: "#fdf6e6", borderWidth: 1, borderColor: "#e8b54a88", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 28 }}>🏅</Text>
              <Text style={{ fontWeight: "900", fontSize: 15, color: "#b5862a", marginTop: 4 }}>{q.founding_number ? t("payFoundingNumber", { n: q.founding_number }) : t("payFoundingMember")}</Text>
              <Text style={{ fontSize: 11.5, color: "#a98c52", marginTop: 3, textAlign: "center" }}>{t("payFoundingNote")}</Text>
            </View>
            <View style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 14 }}>
              <Line label={t("payIdentityVerification")} value={t("payFree")} muted />
              <Line label={t("payAnnualMembership")} value={t("payFree")} muted />
              <Line label={t("payTotalToday")} value={fmt(0)} total />
            </View>
            <View style={{ flex: 1, minHeight: 18 }} />
            <Primary label={t("payActivateFree")} loading={busy} onPress={activateFree} />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 23, fontWeight: "900", color: Colors.ink, marginBottom: 14 }}>{t("payAlmostThere")}</Text>
            <View style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 14 }}>
              <Line label={t("payIdentityVerification")} value={fmt(q.verify)} muted />
              <Line label={t("payAnnualMembership")} value={fmt(q.membership)} muted />
              <Line label={t("paySubtotal")} value={fmt(q.subtotal)} muted total />
              {(q.tax ?? 0) > 0 && <Line label={country === "CA" ? t("payTax") : t("payVat")} value={fmt(q.tax)} muted />}
              <Line label={t("payTotalToday")} value={fmt(q.total)} total />
            </View>
            <Text style={{ fontSize: 10.5, color: Colors.t3, textAlign: "center", marginTop: 8 }}>
              {t("payTaxNote", { currencyNote: currency !== "CAD" ? t("payShownIn", { currency }) : "" })}
            </Text>
            <View style={{ flex: 1, minHeight: 18 }} />
            <Primary label={t("payPayActivate", { total: fmt(q.total) })} loading={busy} onPress={pay} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
