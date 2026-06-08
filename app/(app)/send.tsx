import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { compare, SizeKey } from "../../constants/pricing";

type Mode = "zone" | "door";

export default function Send() {
  const { t } = useStrings();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("zone");
  const [size, setSize] = useState<SizeKey>("small");
  const [from, setFrom] = useState("Ottawa");
  const [to, setTo] = useState("Montréal");

  const cmp = compare(size, mode);

  const go = () => {
    const params = { mode, size, from, to, price: String(cmp.price) };
    if (mode === "zone") router.push({ pathname: "/(app)/zones", params });
    else router.push({ pathname: "/(app)/confirm", params });
  };

  const Mono = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{children}</Text>
  );

  const sizes: { key: SizeKey; emoji: string; label: string; weight: string }[] = [
    { key: "envelope", emoji: "✉️", label: t("envelope"), weight: "≤1 kg" },
    { key: "small", emoji: "📦", label: t("small"), weight: "≤5 kg" },
    { key: "large", emoji: "🧳", label: t("large"), weight: "≤20 kg" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 16 }}>{t("sendParcel")}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Mono>{t("from")}</Mono>
            <TextInput value={from} onChangeText={setFrom} placeholderTextColor={Colors.t3}
              style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 12, padding: 11, fontWeight: "700", fontSize: 15, color: Colors.ink, backgroundColor: "#fff" }} />
          </View>
          <View style={{ flex: 1 }}>
            <Mono>{t("to")}</Mono>
            <TextInput value={to} onChangeText={setTo} placeholderTextColor={Colors.t3}
              style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 12, padding: 11, fontWeight: "700", fontSize: 15, color: Colors.ink, backgroundColor: "#fff" }} />
          </View>
        </View>

        <Mono>{t("dropOff")}</Mono>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {([["zone", "🏁 " + t("loadqZone")], ["door", "🚪 " + t("doorToDoor")]] as [Mode, string][]).map(([m, label]) => (
            <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1, borderWidth: 1.5, borderRadius: 999, paddingVertical: 9, alignItems: "center", borderColor: mode === m ? Colors.accent : Colors.line, backgroundColor: mode === m ? Colors.accent : "#fff" }}>
              <Text style={{ fontWeight: "700", fontSize: 12.5, color: mode === m ? "#fff" : Colors.t2 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ fontSize: 11, color: Colors.t3, marginBottom: 14, lineHeight: 15 }}>{t("modeHint")}</Text>

        <Mono>{t("size")}</Mono>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {sizes.map((s) => (
            <Pressable key={s.key} onPress={() => setSize(s.key)} style={{ flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderColor: size === s.key ? Colors.accent : Colors.line, backgroundColor: "#fff" }}>
              <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: Colors.ink, marginTop: 3 }}>{s.label}</Text>
              <Text style={{ fontSize: 10, color: Colors.t3 }}>{s.weight}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ backgroundColor: Colors.ink, borderRadius: 15, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 10, color: "#fff", opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.6 }}>{t("estimatedPrice")}</Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: "#ff7eb0" }}>C${cmp.price}</Text>
          </View>
          <Text style={{ fontSize: 11, color: "#fff", opacity: 0.75, maxWidth: 120, textAlign: "right" }}>{t("payWhenMatched")}</Text>
        </View>

        {/* Cost saved + time gained vs express couriers */}
        <View style={{ backgroundColor: "rgba(46,204,143,0.12)", borderRadius: 12, padding: 11, marginBottom: 6 }}>
          <Text style={{ color: "#178a5e", fontWeight: "800", fontSize: 13 }}>💸 {t("saveVs", { amount: cmp.saved })}</Text>
        </View>
        <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 16 }}>⏱ {t("daysFaster", { days: cmp.courierDays })}</Text>

        <Pressable onPress={go} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("findDriver")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
