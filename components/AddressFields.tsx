// Structured address: street (with Google Places autocomplete) + city + postal/
// ZIP + province/state. Labels adapt to the country. Picking a suggestion calls
// Place Details and auto-fills every field. Degrades to plain manual entry when
// no Google key is configured. All inputs are stable (no inline subcomponents),
// so the keyboard never drops focus.
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Colors } from "../constants/colors";
import { useStrings } from "../hooks/useStrings";

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export type Address = { street: string; city: string; postal: string; region: string };
export const emptyAddress: Address = { street: "", city: "", postal: "", region: "" };
export const formatAddress = (a: Address) =>
  [a.street, a.city, [a.region, a.postal].filter(Boolean).join(" ")].filter((s) => s && s.trim()).join(", ");
export const isAddressComplete = (a: Address) => !!(a.street.trim() && a.city.trim());

type Suggestion = { description: string; place_id: string };

export function AddressFields({ value, onChange, country }: { value: Address; onChange: (a: Address) => void; country?: string }) {
  const { t } = useStrings();
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skipNext = useRef(false);

  const cc = (country || "CA").toUpperCase();
  const postalLabel = cc === "US" ? t("addrZip") : t("addrPostal");
  const regionLabel = cc === "US" ? t("addrState") : cc === "CA" ? t("addrProvince") : t("addrRegion");

  // Autocomplete on the street line.
  useEffect(() => {
    if (!KEY) return;
    if (skipNext.current) { skipNext.current = false; return; }
    const q = value.street.trim();
    if (q.length < 3) { setSugs([]); setOpen(false); return; }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ input: q, key: KEY, types: "address" });
        if (country) params.append("components", `country:${country.toLowerCase()}`);
        const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
        const j = await r.json();
        setSugs((j?.predictions ?? []).slice(0, 5).map((p: any) => ({ description: p.description, place_id: p.place_id })));
        setOpen(true);
      } catch { setSugs([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(id);
  }, [value.street, country]);

  const pick = async (s: Suggestion) => {
    skipNext.current = true;
    setSugs([]); setOpen(false);
    if (!KEY) { onChange({ ...value, street: s.description }); return; }
    try {
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${s.place_id}&fields=address_component&key=${KEY}`);
      const j = await r.json();
      const comps: any[] = j?.result?.address_components ?? [];
      const get = (type: string, short = false) => {
        const c = comps.find((x) => x.types.includes(type));
        return c ? (short ? c.short_name : c.long_name) : "";
      };
      const streetNo = get("street_number");
      const route = get("route");
      onChange({
        street: [streetNo, route].filter(Boolean).join(" ") || s.description,
        city: get("locality") || get("postal_town") || get("sublocality") || value.city,
        postal: get("postal_code") || value.postal,
        region: get("administrative_area_level_1", true) || value.region,
      });
    } catch {
      onChange({ ...value, street: s.description });
    }
  };

  const Label = ({ children, req }: { children: string; req?: boolean }) => (
    <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 4, fontWeight: "600" }}>{children}{req ? <Text style={{ color: Colors.accent }}> *</Text> : null}</Text>
  );
  const inputStyle = { borderWidth: 1.5 as const, borderColor: Colors.line, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.ink, backgroundColor: "#fff" };

  return (
    <View>
      {/* Street + autocomplete */}
      <Label req>{t("addrStreet")}</Label>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, backgroundColor: "#fff", paddingRight: 10 }}>
        <TextInput
          value={value.street} onChangeText={(v) => onChange({ ...value, street: v })}
          placeholder={t("addrSearchPh")} placeholderTextColor={Colors.t3} autoCapitalize="words"
          style={{ flex: 1, padding: 12, fontSize: 14, color: Colors.ink }}
        />
        {loading ? <ActivityIndicator size="small" color={Colors.t3} /> : null}
      </View>
      {open && sugs.length > 0 ? (
        <View style={{ borderWidth: 1, borderColor: Colors.line, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: "#fff", overflow: "hidden", marginBottom: 8 }}>
          {sugs.map((s) => (
            <Pressable key={s.place_id} onPress={() => pick(s)} style={{ paddingVertical: 11, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.line }}>
              <Text style={{ fontSize: 12.5, color: Colors.ink }}>📍 {s.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : <View style={{ height: 8 }} />}

      <Label req>{t("addrCity")}</Label>
      <TextInput value={value.city} onChangeText={(v) => onChange({ ...value, city: v })} placeholderTextColor={Colors.t3} autoCapitalize="words" style={{ ...inputStyle, marginBottom: 8 }} />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Label>{regionLabel}</Label>
          <TextInput value={value.region} onChangeText={(v) => onChange({ ...value, region: v })} placeholderTextColor={Colors.t3} autoCapitalize="characters" style={{ ...inputStyle, marginBottom: 8 }} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>{postalLabel}</Label>
          <TextInput value={value.postal} onChangeText={(v) => onChange({ ...value, postal: v })} placeholderTextColor={Colors.t3} autoCapitalize="characters" style={{ ...inputStyle, marginBottom: 8 }} />
        </View>
      </View>
      {!KEY ? <Text style={{ fontSize: 10.5, color: Colors.t3, marginBottom: 2 }}>{t("addrManualHint")}</Text> : null}
    </View>
  );
}
