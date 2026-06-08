import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AuthAPI } from "../../services/auth";
import { AdminAPI } from "../../services/admin";

export default function Profile() {
  const router = useRouter();
  const { t, lang, setLang } = useStrings();
  const [isAdmin, setIsAdmin] = useState(false);

  useFocusEffect(useCallback(() => { AdminAPI.isAdmin().then(setIsAdmin); }, []));

  const signOut = async () => {
    await AuthAPI.signOut();
    router.replace("/(auth)/language");
  };

  const Row = ({ icon, label, value, onPress, danger }: { icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean }) => (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.line }}>
      <Text style={{ fontSize: 17, marginRight: 12 }}>{icon}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: "600", color: danger ? Colors.accentDk : Colors.ink }}>{label}</Text>
      {value ? <Text style={{ marginLeft: "auto", color: Colors.t3, fontWeight: "600", fontSize: 13 }}>{value}</Text> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ padding: 18 }}>
        <View style={{ alignItems: "center", paddingVertical: 10 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 26 }}>K</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.ink, marginTop: 8 }}>{t("tabProfile")}</Text>
        </View>
        <Row icon="🌐" label={t("chooseLanguage")} value={lang === "en" ? "English" : "Français"} onPress={() => setLang(lang === "en" ? "fr" : "en")} />
        {isAdmin && <Row icon="🛠️" label={t("admin")} onPress={() => router.push("/(admin)")} />}
        <Row icon="↩︎" label="Sign out" onPress={signOut} danger />
        <Text style={{ textAlign: "center", color: Colors.t3, fontSize: 12, marginTop: 16 }}>Kolis · {t("partOf")}</Text>
      </View>
    </SafeAreaView>
  );
}
