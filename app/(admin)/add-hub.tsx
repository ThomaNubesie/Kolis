import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { HubsAPI } from "../../services/hubs";
import { AddressAutocomplete } from "../../components/AddressAutocomplete";

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Module-scope so the TextInput keeps a stable identity across renders.
// (Defining this INSIDE the screen remounted it each keystroke → the keyboard
// dismissed after a single character.)
function Field({ label, value, onChange, ph }: { label: string; value: string; onChange: (s: string) => void; ph?: string }) {
  return (
    <>
      <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={ph} placeholderTextColor={Colors.t3}
        style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 12, padding: 12, fontWeight: "700", fontSize: 15, color: Colors.ink, backgroundColor: "#fff", marginBottom: 12 }} />
    </>
  );
}

// Geocode a free-typed address to coordinates (fallback when the admin didn't
// pick a Places suggestion). Hubs need lat/lng so the directions map renders.
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!GMAPS_KEY || !address.trim()) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_KEY}`);
    const j = await r.json();
    const loc = j?.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch { return null; }
}

export default function AddHub() {
  const { t } = useStrings();
  const router = useRouter();
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("Open daily 7am – 9pm");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!city.trim() || !name.trim()) { Alert.alert(t("addHub"), `${t("fCity")} · ${t("fHubName")}`); return; }
    setBusy(true);
    // Use the coordinates from the picked place; otherwise geocode the typed
    // address so the hub still gets a map pin.
    const loc = coords ?? (await geocode(address.trim() || `${name.trim()}, ${city.trim()}`));
    const { error } = await HubsAPI.create({
      city: city.trim(), name: name.trim(),
      address: address.trim() || undefined, hours: hours.trim() || undefined,
      latitude: loc?.lat, longitude: loc?.lng,
    });
    setBusy(false);
    if (error) { Alert.alert("Error", error); return; }
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("adminHubs")}</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.ink, marginBottom: 14 }}>{t("addHub")}</Text>

        <Field label={t("fCity")} value={city} onChange={setCity} ph="Québec City" />
        <Field label={t("fHubName")} value={name} onChange={setName} ph="Québec drop-off hub" />

        {/* Address with Google Places autocomplete — picking a suggestion also
            captures the hub's coordinates (for the directions map). */}
        <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{t("fAddress")}</Text>
        <AddressAutocomplete
          value={address}
          onChange={(v) => { setAddress(v); setCoords(null); }}
          onPlace={(pl) => { setAddress(pl.formatted_address); setCoords({ lat: pl.lat, lng: pl.lng }); }}
          placeholder="Gare du Palais · Bay 1"
          country="ca"
        />
        {coords ? <Text style={{ fontSize: 11, color: Colors.green, marginTop: -4, marginBottom: 10, fontWeight: "700" }}>📍 Location set ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})</Text> : null}

        <Field label={t("fHours")} value={hours} onChange={setHours} />

        <Pressable onPress={save} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 6, opacity: busy ? 0.7 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("saveHub")}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
