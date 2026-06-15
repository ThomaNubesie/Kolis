// Wallet & payments (mockup A2): pay-for-parcels (card entered at checkout),
// courier Interac payout email, and membership status.
import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI } from "../../services/courier";
import { ProfileAPI, KolisProfile } from "../../services/profile";

// Module-scope so children (incl. the Interac email TextInput) keep a stable
// identity across renders. Defined inside the screen, Card remounted every
// keystroke → the keyboard dismissed after one character.
const Mono = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7, marginTop: 14, fontWeight: "700" }}>{children}</Text>
);
const Card = ({ children }: { children: React.ReactNode }) => (
  <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 14, backgroundColor: "#fff" }}>{children}</View>
);

export default function Wallet() {
  const { t } = useStrings();
  const router = useRouter();
  const [prof, setProf] = useState<KolisProfile | null>(null);
  const [interac, setInterac] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(() => {
    ProfileAPI.get().then(setProf);
    CourierAPI.getInterac().then((v) => setInterac(v ?? "")).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isCourier = prof?.role === "courier" || prof?.role === "both";
  const isSender = prof?.role === "sender" || prof?.role === "both" || !prof?.role;

  const saveInterac = async () => {
    setSaving(true);
    const { error } = await CourierAPI.setInterac(interac.trim());
    setSaving(false);
    if (!error) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("wallet")}</Text>

        {isSender && (
          <>
            <Mono>{t("payForParcels")}</Mono>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <Text style={{ fontSize: 18 }}>💳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: "700", color: Colors.ink }}>{t("addCard")}</Text>
                  <Text style={{ fontSize: 11, color: Colors.t3, marginTop: 1 }}>🔒 Entered securely at checkout</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {isCourier && (
          <>
            <Mono>{t("getPaidCourier")}</Mono>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
                <Text style={{ fontSize: 16 }}>⚡</Text>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: Colors.ink }}>{t("interacEmail")}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput value={interac} onChangeText={setInterac} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={Colors.t3}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 11, padding: 11, color: Colors.ink, fontSize: 14, backgroundColor: Colors.bg }} />
                <Pressable onPress={saveInterac} disabled={saving} style={{ backgroundColor: Colors.accent, borderRadius: 11, paddingHorizontal: 16, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>{savedFlash ? t("saved") : t("savePayout")}</Text>}
                </Pressable>
              </View>
              <Text style={{ fontSize: 10.5, color: Colors.t3, marginTop: 8 }}>{t("payoutHint")}</Text>
            </Card>
          </>
        )}

        <Mono>{t("membership")}</Mono>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "800", fontSize: 13, color: Colors.ink }}>{prof?.is_founding ? t("foundingMember") : "Kolis"}</Text>
            {prof?.is_founding ? <View style={{ backgroundColor: "rgba(232,185,49,0.18)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: "#8a6d12", fontWeight: "800", fontSize: 11 }}>{t("freeYr1")}</Text></View> : null}
          </View>
          <Text style={{ fontSize: 10.5, color: Colors.t3, marginTop: 4 }}>{t("renewsNote")}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
