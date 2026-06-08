import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AuthAPI } from "../../services/auth";
import { toE164, isValidE164 } from "../../constants/phone";

export default function SignIn() {
  const router = useRouter();
  const { t } = useStrings();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const e164 = toE164(phone);
    if (!isValidE164(e164)) { Alert.alert(t("phoneNumber"), t("phoneInvalid")); return; }
    setBusy(true);
    const { error } = await AuthAPI.sendOTP(e164);
    setBusy(false);
    if (error) { Alert.alert("Error", error); return; }
    router.push({ pathname: "/(auth)/otp", params: { phone: e164 } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, padding: 24 }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 26 }}>Ko</Text>
          </View>
          <Text style={{ fontSize: 34, fontWeight: "800", color: Colors.ink }}>{t("tagline1")}</Text>
          <Text style={{ fontSize: 34, fontWeight: "800", color: Colors.accent, fontStyle: "italic" }}>{t("tagline2")}</Text>
          <Text style={{ fontSize: 14, color: Colors.t2, textAlign: "center", marginTop: 12, paddingHorizontal: 16, lineHeight: 20 }}>{t("welcomeSub")}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 11, color: Colors.t3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t("phoneNumber")}</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="+1 613 555 0000" keyboardType="phone-pad" autoComplete="tel" placeholderTextColor={Colors.t3}
            style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 13, padding: 14, fontSize: 16, fontWeight: "700", color: Colors.ink, backgroundColor: "#fff", marginBottom: 12 }} />
          <Pressable onPress={send} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: busy ? 0.7 : 1 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("sendCode")}</Text>}
          </Pressable>
          <Text style={{ textAlign: "center", color: Colors.t3, fontSize: 12, marginTop: 14 }}>{t("partOf")}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
