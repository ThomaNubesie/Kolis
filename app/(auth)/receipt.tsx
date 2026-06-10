// Kolis onboarding receipt — Email / Save / Both, then into the app.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ReceiptAPI } from "../../services/verification";
import { formatCurrency, COUNTRY_CURRENCY, CountryCode } from "../../constants/currency";

export default function Receipt() {
  const router = useRouter();
  const { t } = useStrings();
  const p = useLocalSearchParams<{ receiptId: string; country: string; founding: string; verify: string; membership: string; subtotal: string; tax: string; total: string }>();
  const [channel, setChannel] = useState<"email" | "save" | "both">("both");
  const [busy, setBusy] = useState(false);

  const country = (p.country as CountryCode) || "CA";
  const currency = COUNTRY_CURRENCY[country] || "CAD";
  const fmt = (cents?: string) => formatCurrency((Number(cents) || 0) / 100, currency);
  const founding = p.founding === "1";
  const totalStr = founding ? fmt("0") : fmt(p.total);

  const lines = founding
    ? [{ label: t("rcptIdentityVerification"), amount: t("rcptFree") }, { label: t("rcptAnnualMembership"), amount: t("rcptFree") }]
    : [
        { label: t("rcptIdentityVerification"), amount: fmt(p.verify) },
        { label: t("rcptAnnualMembership"), amount: fmt(p.membership) },
        ...((Number(p.tax) || 0) > 0 ? [{ label: country === "CA" ? t("rcptTax") : t("rcptVat"), amount: fmt(p.tax) }] : []),
      ];

  const finish = async () => {
    setBusy(true);
    const receipt = { receiptId: p.receiptId || "", lines, total: totalStr, date: new Date().toISOString().slice(0, 10) };
    if (channel === "save" || channel === "both") {
      try {
        const raw = await AsyncStorage.getItem("kolis_receipts");
        const list = raw ? JSON.parse(raw) : [];
        list.unshift({ ...receipt, savedAt: Date.now() });
        await AsyncStorage.setItem("kolis_receipts", JSON.stringify(list.slice(0, 50)));
      } catch {}
    }
    if (channel === "email" || channel === "both") {
      try { await ReceiptAPI.email(receipt); } catch {}
    }
    router.replace("/(app)/send");
  };

  const opt = (key: "email" | "save" | "both", label: string) => (
    <Pressable key={key} onPress={() => setChannel(key)}
      style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: channel === key ? Colors.accent : Colors.line, backgroundColor: channel === key ? "#fdeef4" : "#fff" }}>
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: channel === key ? Colors.accentDk : Colors.t2 }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40, flexGrow: 1 }}>
        <Text style={{ fontSize: 50, textAlign: "center", marginTop: 24 }}>🎉</Text>
        <Text style={{ fontSize: 24, fontWeight: "900", color: Colors.ink, textAlign: "center", marginVertical: 8 }}>{t("rcptVerified")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, textAlign: "center", marginBottom: 20 }}>{t("rcptReceiptLine", { id: p.receiptId, total: totalStr })}</Text>

        <View style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 14, marginBottom: 18 }}>
          {lines.map((l) => (
            <View key={l.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
              <Text style={{ color: Colors.t2, fontSize: 13 }}>{l.label}</Text>
              <Text style={{ color: l.amount === t("rcptFree") ? Colors.gold : Colors.ink, fontSize: 13, fontWeight: "600" }}>{l.amount}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.line, marginTop: 5, paddingTop: 9 }}>
            <Text style={{ fontWeight: "900", fontSize: 15, color: Colors.ink }}>{t("rcptTotal")}</Text>
            <Text style={{ fontWeight: "900", fontSize: 15, color: Colors.accent }}>{totalStr}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 10.5, fontWeight: "800", color: Colors.t3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>{t("rcptKeepReceipt")}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
          {opt("email", t("rcptEmail"))}
          {opt("save", t("rcptSave"))}
          {opt("both", t("rcptBoth"))}
        </View>

        <View style={{ flex: 1, minHeight: 8 }} />
        <Pressable onPress={finish} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("rcptStartUsing")}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
