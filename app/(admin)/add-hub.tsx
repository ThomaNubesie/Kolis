import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { HubsAPI } from "../../services/hubs";

export default function AddHub() {
  const { t } = useStrings();
  const router = useRouter();
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("Open daily 7am – 9pm");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!city.trim() || !name.trim()) { Alert.alert(t("addHub"), `${t("fCity")} · ${t("fHubName")}`); return; }
    setBusy(true);
    const { error } = await HubsAPI.create({ city: city.trim(), name: name.trim(), address: address.trim() || undefined, hours: hours.trim() || undefined });
    setBusy(false);
    if (error) { Alert.alert("Error", error); return; }
    router.back();
  };

  const Field = ({ label, value, onChange, ph }: { label: string; value: string; onChange: (s: string) => void; ph?: string }) => (
    <>
      <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={ph} placeholderTextColor={Colors.t3}
        style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 12, padding: 12, fontWeight: "700", fontSize: 15, color: Colors.ink, backgroundColor: "#fff", marginBottom: 12 }} />
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("adminHubs")}</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.ink, marginBottom: 14 }}>{t("addHub")}</Text>
        <Field label={t("fCity")} value={city} onChange={setCity} ph="Québec City" />
        <Field label={t("fHubName")} value={name} onChange={setName} ph="Québec drop-off hub" />
        <Field label={t("fAddress")} value={address} onChange={setAddress} ph="Gare du Palais · Bay 1" />
        <Field label={t("fHours")} value={hours} onChange={setHours} />
        <Pressable onPress={save} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 6, opacity: busy ? 0.7 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("saveHub")}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
