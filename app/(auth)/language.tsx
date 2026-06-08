import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { setLang } from "../../hooks/useStrings";
import { Lang } from "../../constants/i18n";

export default function Language() {
  const router = useRouter();
  const pick = async (l: Lang) => {
    await setLang(l);
    router.replace("/(auth)/sign-in");
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, padding: 24, justifyContent: "center" }}>
      <View style={{ alignItems: "center", marginBottom: 36 }}>
        <View style={{ width: 56, height: 56, borderRadius: 15, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 24 }}>Ko</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.ink }}>Choose your language</Text>
        <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.t2 }}>Choisissez votre langue</Text>
      </View>
      {(["en", "fr"] as Lang[]).map((l) => (
        <Pressable key={l} onPress={() => pick(l)}
          style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 14, padding: 16, marginBottom: 12, backgroundColor: "#fff", flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 22, marginRight: 12 }}>{l === "en" ? "🇬🇧" : "🇫🇷"}</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.ink }}>{l === "en" ? "English" : "Français"}</Text>
        </Pressable>
      ))}
    </SafeAreaView>
  );
}
