// Courier earnings — pending vs paid Kolis payouts, Interac e-Transfer email,
// and the contractor (T4A) note. Shows payouts only, never sender prices.
import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI } from "../../services/courier";

export default function Earnings() {
  const { t } = useStrings();
  const router = useRouter();
  const [earn, setEarn] = useState({ paid: 0, pending: 0 });
  const [interac, setInterac] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      CourierAPI.earnings().then(setEarn).catch(() => {}),
      CourierAPI.getInterac().then((v) => setInterac(v ?? "")).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    setSaving(true);
    const { error } = await CourierAPI.setInterac(interac.trim());
    setSaving(false);
    if (!error) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}
      >
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 4 }}>{t("earnings")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginBottom: 18 }}>{t("earningsSub")}</Text>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 18 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(46,204,143,0.12)", borderWidth: 1, borderColor: "rgba(46,204,143,0.3)", borderRadius: 14, padding: 14 }}>
            <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("pending")}</Text>
            <Text style={{ color: "#178a5e", fontWeight: "800", fontSize: 24, marginTop: 4 }}>C${Math.round(earn.pending / 100)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 14, padding: 14 }}>
            <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("paid")}</Text>
            <Text style={{ color: Colors.ink, fontWeight: "800", fontSize: 24, marginTop: 4 }}>C${Math.round(earn.paid / 100)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{t("interacEmail")}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <TextInput
            value={interac} onChangeText={setInterac} placeholder="you@email.com"
            keyboardType="email-address" autoCapitalize="none" placeholderTextColor={Colors.t3}
            style={{ flex: 1, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 12, color: Colors.ink, backgroundColor: "#fff", fontSize: 14 }}
          />
          <Pressable onPress={save} disabled={saving} style={{ backgroundColor: Colors.accent, borderRadius: 11, paddingHorizontal: 18, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>{savedFlash ? t("saved") : t("savePayout")}</Text>}
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 20, lineHeight: 16 }}>{t("payoutHint")}</Text>

        <View style={{ backgroundColor: Colors.cardAlt, borderRadius: 12, padding: 13, marginBottom: 12 }}>
          <Text style={{ fontSize: 11.5, color: Colors.t2, lineHeight: 17 }}>🧾 {t("contractorNote")}</Text>
        </View>

        <Pressable onPress={() => router.push("/(app)/tax")} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 14, backgroundColor: "#fff" }}>
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: Colors.ink }}>🧾 {t("taxDocuments")}</Text>
          <Text style={{ fontSize: 16, color: Colors.t3 }}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
