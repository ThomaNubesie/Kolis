// Address field with Google Places autocomplete. Suggestions populate as the
// user types (uses EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, Places API enabled). Falls
// back to a plain text field when no key is configured.
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Colors } from "../constants/colors";

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
type Suggestion = { description: string; place_id: string };

export type PlacePick = { description: string; formatted_address: string; lat: number; lng: number };

export function AddressAutocomplete({
  label, value, onChange, onPlace, placeholder, required, country,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  // When provided, picking a suggestion also resolves its coordinates via Place
  // Details (geometry) and calls back — used to geocode hubs/addresses.
  onPlace?: (place: PlacePick) => void;
  placeholder?: string;
  required?: boolean;
  country?: string; // optional ISO code to bias results (e.g. "ca")
}) {
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skipNext = useRef(false); // don't re-query right after a pick

  useEffect(() => {
    if (!KEY) return;
    if (skipNext.current) { skipNext.current = false; return; }
    const q = value.trim();
    if (q.length < 3) { setSugs([]); setOpen(false); return; }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ input: q, key: KEY, types: "address" });
        if (country) params.append("components", `country:${country}`);
        const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
        const j = await r.json();
        setSugs((j?.predictions ?? []).slice(0, 5).map((p: any) => ({ description: p.description, place_id: p.place_id })));
        setOpen(true);
      } catch { setSugs([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(id);
  }, [value, country]);

  const pick = async (s: Suggestion) => {
    skipNext.current = true;
    onChange(s.description);
    setSugs([]); setOpen(false);
    if (onPlace && KEY) {
      try {
        const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${s.place_id}&fields=geometry,formatted_address&key=${KEY}`);
        const j = await r.json();
        const loc = j?.result?.geometry?.location;
        if (loc) onPlace({ description: s.description, formatted_address: j.result.formatted_address ?? s.description, lat: loc.lat, lng: loc.lng });
      } catch { /* keep the typed text; coords stay unset */ }
    }
  };

  return (
    <View style={{ marginBottom: 10 }}>
      {label ? (
        <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 4, fontWeight: "600" }}>
          {label}{required ? <Text style={{ color: Colors.accent }}> *</Text> : null}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, backgroundColor: "#fff", paddingRight: 10 }}>
        <TextInput
          value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.t3}
          autoCapitalize="words"
          style={{ flex: 1, padding: 12, fontSize: 14, color: Colors.ink }}
        />
        {loading ? <ActivityIndicator size="small" color={Colors.t3} /> : null}
      </View>
      {open && sugs.length > 0 ? (
        <View style={{ borderWidth: 1, borderColor: Colors.line, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: "#fff", overflow: "hidden" }}>
          {sugs.map((s) => (
            <Pressable key={s.place_id} onPress={() => pick(s)} style={{ paddingVertical: 11, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.line }}>
              <Text style={{ fontSize: 12.5, color: Colors.ink }}>📍 {s.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
