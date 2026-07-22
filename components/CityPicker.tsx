import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { X, Check } from "lucide-react-native";
import { Colors } from "../constants/colors";
import { CITIES } from "../constants/cities";

// A dropdown that picks a city label (e.g. "Ottawa"). Stores/returns the label
// so it stays compatible with pricing/regionCode helpers.
export function CityPicker({
  label,
  value,
  onChange,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (cityLabel: string) => void;
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const options = CITIES.filter((c) => c.label !== exclude);

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{label}</Text>
      <Pressable onPress={() => setOpen(true)}
        style={{ borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 11, backgroundColor: "#fff", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontWeight: "700", fontSize: 15, color: Colors.ink }} numberOfLines={1}>{value}</Text>
        <Text style={{ color: Colors.t3, fontSize: 12 }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.45)", justifyContent: "center", padding: 28 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#fff", borderRadius: 18, maxHeight: "70%", overflow: "hidden" }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} style={{ position: "absolute", top: 12, right: 12, zIndex: 1 }}>
              <X size={22} color={Colors.t3} strokeWidth={2} />
            </Pressable>
            <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.ink, padding: 15, paddingBottom: 8 }}>{label}</Text>
            <ScrollView>
              {options.map((c) => {
                const on = c.label === value;
                return (
                  <Pressable key={c.code} onPress={() => { onChange(c.label); setOpen(false); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: on ? "rgba(225,29,107,0.05)" : "#fff" }}>
                    <Text style={{ fontSize: 15, fontWeight: on ? "800" : "600", color: on ? Colors.accent : Colors.ink }}>{c.label}</Text>
                    {on && <Check size={16} color={Colors.accent} strokeWidth={2.5} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
