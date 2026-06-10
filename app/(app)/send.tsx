import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { compare, SizeKey, DropType } from "../../constants/pricing";
import { HubsAPI } from "../../services/hubs";
import { regionCode } from "../../constants/geo";
import { CityPicker } from "../../components/CityPicker";
import { NearbyPicker, NearbyChoice } from "../../components/NearbyPicker";

export default function Send() {
  const { t } = useStrings();
  const router = useRouter();
  const [drop, setDrop] = useState<DropType>("hub");
  const [size, setSize] = useState<SizeKey>("small");
  const [from, setFrom] = useState("Ottawa");
  const [to, setTo] = useState("Montréal");
  const [hubRegions, setHubRegions] = useState<Set<string>>(new Set());
  const [selHub, setSelHub] = useState<NearbyChoice | null>(null);
  const [modal, setModal] = useState(false); // hub picker

  useEffect(() => {
    HubsAPI.listActive().then(({ hubs }) => setHubRegions(new Set(hubs.map((h) => regionCode(h.city)))));
  }, []);
  const hubOk = hubRegions.has(regionCode(from));
  useEffect(() => { if (!hubOk && drop === "hub") setDrop("door"); }, [hubOk, drop]);
  // Selected hub no longer valid if the origin city changed.
  useEffect(() => { setSelHub(null); }, [from]);

  const cmp = compare(size, drop, from, to);

  const selectMode = (m: DropType) => {
    setDrop(m);
    if (m === "hub") setModal(true);
  };

  const onPick = (choice: NearbyChoice) => {
    setModal(false);
    setSelHub(choice); // stays on this screen; CTA becomes "Directions to hub"
  };

  const go = () => {
    if (drop === "hub") {
      if (!selHub) { setModal(true); return; }
      router.push({
        pathname: "/(app)/directions",
        params: { size, from, to, price: String(cmp.price), pickup_hub: selHub.id, hubName: selHub.name, hubAddr: selHub.address ?? "" },
      });
    } else {
      // Door-to-door: review & pay, then the parcel is proposed to drivers.
      router.push({ pathname: "/(app)/confirm", params: { drop: "door", size, from, to, price: String(cmp.price) } });
    }
  };

  const Mono = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{children}</Text>
  );

  const modes: [DropType, string][] = [["hub", "🏢 " + t("mHub")], ["door", "🚪 " + t("mDoor")]];
  const sizes: { key: SizeKey; emoji: string; label: string; weight: string }[] = [
    { key: "envelope", emoji: "✉️", label: t("envelope"), weight: "≤1 kg" },
    { key: "small", emoji: "📦", label: t("small"), weight: "≤5 kg" },
    { key: "large", emoji: "🧳", label: t("large"), weight: "≤20 kg" },
  ];

  const isHub = drop === "hub";
  const ctaLabel = isHub ? (selHub ? t("directionsToHub") : t("chooseHub")) : t("continue");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink, marginBottom: 16 }}>{t("sendParcel")}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <CityPicker label={t("from")} value={from} onChange={setFrom} exclude={to} />
          <CityPicker label={t("to")} value={to} onChange={setTo} exclude={from} />
        </View>

        <Mono>{t("dropOff")}</Mono>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {modes.map(([m, label]) => {
            const disabled = m === "hub" && !hubOk;
            const on = drop === m;
            return (
              <Pressable key={m} disabled={disabled} onPress={() => selectMode(m)} style={{ flex: 1, borderWidth: 1.5, borderRadius: 999, paddingVertical: 9, alignItems: "center", borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff", opacity: disabled ? 0.4 : 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 12, color: on ? "#fff" : Colors.t2 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {isHub && selHub ? (
          <Pressable onPress={() => setModal(true)} style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 13, padding: 11, marginBottom: 14, backgroundColor: "rgba(225,29,107,0.04)" }}>
            <Text style={{ fontSize: 16 }}>🏢</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 13.5, color: Colors.ink }}>{selHub.name}</Text>
              <Text style={{ fontSize: 10.5, color: Colors.t3 }}>{selHub.address || from}</Text>
            </View>
            <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12 }}>{t("change")}</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 11, color: Colors.t3, marginBottom: 14, lineHeight: 15 }}>{t("modeHint3")}</Text>
        )}

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
          <Text style={{ fontSize: 11, color: "#fff", opacity: 0.8, maxWidth: 124, textAlign: "right" }}>{isHub ? "💵 " + t("payAtHub") : t("payWhenMatched")}</Text>
        </View>

        <View style={{ backgroundColor: "rgba(46,204,143,0.12)", borderRadius: 12, padding: 11, marginBottom: 6 }}>
          <Text style={{ color: "#178a5e", fontWeight: "800", fontSize: 13 }}>💸 {t("saveVs", { amount: cmp.saved })}</Text>
        </View>
        <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 16 }}>⏱ {t("daysFaster", { days: cmp.courierDays })}</Text>

        <Pressable onPress={go} style={{ backgroundColor: isHub && selHub ? Colors.ink : Colors.accent, borderRadius: 13, padding: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{isHub && selHub ? "🧭 " : ""}{ctaLabel}</Text>
          {isHub && selHub ? <Text style={{ color: "#fff", opacity: 0.85, fontSize: 10.5, fontWeight: "600", marginTop: 2 }}>{t("payOnArrival")}</Text> : null}
        </Pressable>
      </ScrollView>

      <NearbyPicker
        visible={modal}
        mode="hub"
        originLabel={from}
        destLabel={to}
        ctaLabel={t("useThisHub")}
        onClose={() => setModal(false)}
        onPick={onPick}
      />
    </SafeAreaView>
  );
}
