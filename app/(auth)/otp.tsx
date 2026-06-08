import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AuthAPI } from "../../services/auth";

export default function Otp() {
  const router = useRouter();
  const { t } = useStrings();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (code.length < 6 || !phone) return;
    setBusy(true);
    const { session, error } = await AuthAPI.verifyOTP(phone, code);
    setBusy(false);
    if (error) { Alert.alert("Error", error); return; }
    if (session) router.replace("/(app)/send");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, padding: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginTop: 20 }}>{t("enterCode")}</Text>
      <Text style={{ fontSize: 13, color: Colors.t2, marginTop: 6 }}>{t("codeSentTo")}</Text>
      <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.ink, marginBottom: 20 }}>{phone}</Text>
      <TextInput value={code} onChangeText={setCode} placeholder="••••••" keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" placeholderTextColor={Colors.t3}
        style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 13, padding: 16, fontSize: 24, fontWeight: "800", letterSpacing: 8, textAlign: "center", color: Colors.ink, backgroundColor: "#fff", marginBottom: 16 }} />
      <Pressable onPress={verify} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: busy ? 0.7 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("verify")}</Text>}
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignItems: "center" }}>
        <Text style={{ color: Colors.t3, fontSize: 13 }}>{t("wrongNumber")}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
