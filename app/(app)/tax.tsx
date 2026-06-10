// Courier tax documents — one per year of delivered earnings. Generated as a
// country-aware PDF (T4A / 1099-NEC / earnings statement) and emailed to the
// courier. Shows gross payouts only (their own money — not walled).
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI, TaxYear } from "../../services/courier";

export default function Tax() {
  const { t } = useStrings();
  const router = useRouter();
  const [years, setYears] = useState<TaxYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyYear, setBusyYear] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    CourierAPI.taxYears().then(setYears).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const emailDoc = async (year: number) => {
    setBusyYear(year);
    const r = await CourierAPI.taxDocument(year);
    setBusyYear(null);
    if (r.error) { Alert.alert("Kolis", r.error); return; }
    Alert.alert(
      `${r.doc_type ?? t("taxDocuments")} · ${year}`,
      r.emailed ? t("taxEmailedTo", { email: r.emailed_to ?? "" }) : t("taxNoEmail"),
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}
      >
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 8 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 4 }}>{t("taxDocuments")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginBottom: 18 }}>{t("taxSub")}</Text>

        {!loading && years.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Text style={{ fontSize: 40 }}>🧾</Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.ink, marginTop: 12 }}>{t("taxNone")}</Text>
            <Text style={{ fontSize: 12.5, color: Colors.t3, textAlign: "center", marginTop: 4, maxWidth: 250 }}>{t("taxNoneSub")}</Text>
          </View>
        )}

        {years.map((y) => (
          <View key={y.year} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 16, padding: 15, marginBottom: 12, backgroundColor: "#fff" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.ink }}>{y.year}</Text>
                <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 2 }}>{t("taxParcels", { n: y.parcels })}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("taxGross")}</Text>
                <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.accent }}>C${Math.round(y.total_payout_cents / 100)}</Text>
              </View>
            </View>
            <Pressable onPress={() => emailDoc(y.year)} disabled={busyYear === y.year} style={{ marginTop: 13, backgroundColor: Colors.ink, borderRadius: 12, padding: 13, alignItems: "center", opacity: busyYear === y.year ? 0.6 : 1 }}>
              {busyYear === y.year ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13.5 }}>📧 {t("taxEmailDoc")}</Text>}
            </Pressable>
          </View>
        ))}

        {years.length > 0 && (
          <View style={{ backgroundColor: Colors.cardAlt, borderRadius: 12, padding: 13, marginTop: 4 }}>
            <Text style={{ fontSize: 11.5, color: Colors.t2, lineHeight: 17 }}>🧾 {t("contractorNote")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
