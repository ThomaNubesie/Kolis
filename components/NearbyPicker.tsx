import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Colors } from "../constants/colors";
import { useStrings } from "../hooks/useStrings";
import { LoadqAPI } from "../services/loadq";
import { HubsAPI } from "../services/hubs";
import { regionCode } from "../constants/geo";
import { getMyLocation } from "../services/location";
import { haversineKm, kmLabel } from "../constants/distance";

export type NearbyChoice = { id: string; name: string; address: string | null; kind: "hub" | "zone" };

type Item = NearbyChoice & { km: number | null; drivers: number };

// Bottom-sheet listing the closest hubs (mode="hub") or loading zones
// (mode="zone") to the sender, sorted by distance. Zone mode also shows how
// many drivers are queued for the destination.
export function NearbyPicker({
  visible,
  mode,
  originLabel,
  destLabel,
  ctaLabel,
  onClose,
  onPick,
}: {
  visible: boolean;
  mode: "hub" | "zone";
  originLabel: string;
  destLabel: string;
  ctaLabel: string;
  onClose: () => void;
  onPick: (choice: NearbyChoice) => void;
}) {
  const { t } = useStrings();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const originRegion = regionCode(originLabel);
  const destRegion = regionCode(destLabel);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    setSel(null);
    (async () => {
      const me = await getMyLocation();
      let list: Item[] = [];
      if (mode === "hub") {
        const { hubs } = await HubsAPI.listActive();
        list = hubs
          .filter((h) => regionCode(h.city) === originRegion)
          .map((h) => ({
            id: h.id,
            name: h.name,
            address: h.address,
            kind: "hub" as const,
            km: me && h.latitude != null && h.longitude != null ? haversineKm(me.lat, me.lng, h.latitude, h.longitude) : null,
            drivers: 0,
          }));
      } else {
        const [{ zones }, avail, settings] = await Promise.all([
          LoadqAPI.zones(),
          LoadqAPI.availability(destRegion),
          LoadqAPI.zoneSettings(),
        ]);
        list = zones
          .filter((z) => z.region === originRegion && settings[z.id] !== false)
          .map((z) => ({
            id: z.id,
            name: z.name,
            address: z.address,
            kind: "zone" as const,
            km: me && z.latitude != null && z.longitude != null ? haversineKm(me.lat, me.lng, z.latitude, z.longitude) : null,
            drivers: avail[z.id] ?? 0,
          }));
      }
      // Sort: nearest first; unknown-distance last. Then drivers desc as tiebreak.
      list.sort((a, b) => {
        if (a.km == null && b.km == null) return b.drivers - a.drivers;
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      });
      if (!alive) return;
      setItems(list);
      setSel(list[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [visible, mode, originRegion, destRegion]);

  const pick = () => {
    const it = items.find((i) => i.id === sel);
    if (it) onPick({ id: it.id, name: it.name, address: it.address, kind: it.kind });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.45)", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24, maxHeight: "82%" }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: "#d8d3c7", alignSelf: "center", marginBottom: 12 }} />
          <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.ink }}>
            {mode === "hub" ? t("closestHubs") : t("closestZones")}
          </Text>
          <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 12 }}>
            {mode === "hub" ? t("sortedByDistance", { city: originLabel }) : t("sortedRoute", { from: originLabel, to: destLabel })}
          </Text>

          {loading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 30 }} />
          ) : items.length === 0 ? (
            <Text style={{ color: Colors.t2, textAlign: "center", marginVertical: 26 }}>
              {mode === "hub" ? t("noHubHere", { city: originLabel }) : t("noZoneHere", { city: originLabel })}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {items.map((it) => {
                const on = it.id === sel;
                return (
                  <Pressable key={it.id} onPress={() => setSel(it.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 11, marginBottom: 9, backgroundColor: on ? "rgba(225,29,107,0.04)" : "#fff", borderColor: on ? Colors.accent : Colors.line }}>
                    <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16 }}>{mode === "hub" ? "🏢" : "🏁"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: "700", color: Colors.ink }} numberOfLines={1}>{it.name}</Text>
                      <Text style={{ fontSize: 10.5, color: Colors.t3 }} numberOfLines={1}>{it.address || originLabel}</Text>
                      {mode === "zone" && (
                        <Text style={{ fontSize: 10.5, fontWeight: "700", color: it.drivers > 0 ? Colors.green : Colors.t3, marginTop: 1 }}>
                          {it.drivers > 0 ? t("driversToDest", { n: it.drivers, city: destLabel }) : t("noDriversYet")}
                        </Text>
                      )}
                    </View>
                    {it.km != null && (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.accent }}>{kmLabel(it.km)}</Text>
                        <Text style={{ fontSize: 8.5, color: Colors.t3, fontWeight: "600" }}>KM</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {items.length > 0 && !loading && (
            <Pressable onPress={pick} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 6 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{ctaLabel}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
