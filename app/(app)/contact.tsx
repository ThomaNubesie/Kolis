// Add/update the member's contact email & phone — applied only after admin approval.
import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ProfileAPI } from "../../services/profile";

const inp = { backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 12, padding: 13, fontSize: 15, marginTop: 6, color: Colors.ink } as const;

export default function Contact() {
  const router = useRouter();
  const { lang } = useStrings();
  const T = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<any | null>(null);

  const load = useCallback(() => {
    ProfileAPI.get().then((p) => { if (p) { setEmail(p.email || ""); setPhone((p as any).phone || ""); } });
    ProfileAPI.myContactRequest().then((r) => setPending(r && r.status === "pending" ? r : null));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    const { error } = await ProfileAPI.requestContactUpdate(email.trim() || null, phone.trim() || null);
    setBusy(false);
    if (error) { Alert.alert("Kolis", error === "nothing_to_update" ? T("Enter an email or phone.", "Entrez un courriel ou un téléphone.") : error); return; }
    Alert.alert("Kolis", T("Submitted for admin approval.", "Soumis pour approbation par l'administrateur."));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: Colors.ink }}>{T("Contact info", "Coordonnées")}</Text>
        <Text style={{ fontSize: 13, color: Colors.t2, marginTop: 6, marginBottom: 18 }}>
          {T("Add or update your email and phone. Changes are applied after an admin approves them.", "Ajoutez ou modifiez votre courriel et votre téléphone. Les modifications sont appliquées après approbation par un administrateur.")}
        </Text>

        {pending ? (
          <View style={{ backgroundColor: "#fdf6e6", borderWidth: 1, borderColor: "#e8b54a88", borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: "#8a6d2a", fontSize: 12.5 }}>⏳ {T("You have a change pending admin approval.", "Vous avez une modification en attente d'approbation.")}</Text>
          </View>
        ) : null}

        <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.t3 }}>{T("EMAIL", "COURRIEL")}</Text>
        <TextInput style={inp} value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />

        <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.t3, marginTop: 14 }}>{T("PHONE", "TÉLÉPHONE")}</Text>
        <TextInput style={inp} value={phone} onChangeText={setPhone} placeholder="+1 613 555 0192" keyboardType="phone-pad" />

        <Pressable onPress={submit} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22, opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{busy ? "…" : T("Submit for approval", "Soumettre pour approbation")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
