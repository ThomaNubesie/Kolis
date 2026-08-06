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
import { AddressFields, Address, emptyAddress, formatAddress, isAddressComplete } from "../../components/AddressFields";
import { ProfileAPI } from "../../services/profile";
import { NearbyPicker, NearbyChoice } from "../../components/NearbyPicker";
import { Building2, DoorOpen, Package, Mail, Luggage, Wallet, PiggyBank, Clock, Navigation } from "lucide-react-native";

const SizeIcon = ({ size, px = 20, color = Colors.ink }: { size: SizeKey; px?: number; color?: string }) => {
  if (size === "envelope") return <Mail size={px} color={color} strokeWidth={2} />;
  if (size === "large") return <Luggage size={px} color={color} strokeWidth={2} />;
  return <Package size={px} color={color} strokeWidth={2} />;
};

export default function Send() {
  const { t } = useStrings();
  const router = useRouter();
  const [drop, setDrop] = useState<DropType>("hub");
  const [size, setSize] = useState<SizeKey>("small");
  const [from, setFrom] = useState("Ottawa");
  const [to, setTo] = useState("Montréal");
  const [hubRegions, setHubRegions] = useState<Set<string>>(new Set());
  const [selHub, setSelHub] = useState<NearbyChoice | null>(null);
  const [addr, setAddr] = useState<Address>(emptyAddress); // door pickup address
  const [country, setCountry] = useState("CA");
  const [modal, setModal] = useState(false); // hub picker

  useEffect(() => {
    HubsAPI.listActive().then(({ hubs }) => setHubRegions(new Set(hubs.map((h) => regionCode(h.city)))));
    ProfileAPI.get().then((pr) => { if (pr?.country) setCountry(pr.country); });
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
      // Collect shipping/insurance details before payment.
      router.push({
        pathname: "/(app)/details",
        params: { drop: "hub", size, from, to, price: String(cmp.price), pickup_hub: selHub.id, hubName: selHub.name, hubAddr: selHub.address ?? "" },
      });
    } else {
      router.push({ pathname: "/(app)/details", params: { drop: "door", size, from, to, price: String(cmp.price), pickup_addr: formatAddress(addr) } });
    }
  };

  const Mono = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: "600" }}>{children}</Text>
  );

  const modes: [DropType, string][] = [["hub", t("mHub")], ["door", t("doorToWord")]];
  const sizes: { key: SizeKey; label: string; weight: string }[] = [
    { key: "envelope", label: t("envelope"), weight: "≤1 kg" },
    { key: "small", label: t("small"), weight: "≤5 kg" },
    { key: "large", label: t("large"), weight: "≤20 kg" },
  ];

  const isHub = drop === "hub";
  const doorReady = drop !== "door" || isAddressComplete(addr);
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
            const iconColor = on ? "#fff" : Colors.t2;
            return (
              <Pressable key={m} disabled={disabled} onPress={() => selectMode(m)} style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 9, borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? Colors.accent : "#fff", opacity: disabled ? 0.4 : 1 }}>
                {m === "hub" ? <Building2 size={12} color={iconColor} strokeWidth={2.2} /> : <DoorOpen size={12} color={iconColor} strokeWidth={2.2} />}
                <Text style={{ fontWeight: "700", fontSize: 12, color: on ? "#fff" : Colors.t2 }}>{label}</Text>
                {m === "door" ? <DoorOpen size={12} color={iconColor} strokeWidth={2.2} /> : null}
              </Pressable>
            );
          })}
        </View>

        {isHub && selHub ? (
          <Pressable onPress={() => setModal(true)} style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 13, padding: 11, marginBottom: 14, backgroundColor: "rgba(225,29,107,0.04)" }}>
            <Building2 size={16} color={Colors.ink} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 13.5, color: Colors.ink }}>{selHub.name}</Text>
              <Text style={{ fontSize: 10.5, color: Colors.t3 }}>{selHub.address || from}</Text>
              {selHub.hours ? <Text style={{ fontSize: 10.5, color: Colors.accent, fontWeight: "700", marginTop: 2 }}>🕐 {t("dropOffHours", { hours: selHub.hours })}</Text> : null}
            </View>
            <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12 }}>{t("change")}</Text>
          </Pressable>
        ) : drop === "door" ? (
          <View style={{ marginBottom: 14 }}>
            <Mono>{t("pickupAddress")}</Mono>
            <AddressFields value={addr} onChange={setAddr} country={country} />
            <Text style={{ fontSize: 10.5, color: Colors.t3, marginTop: 1, lineHeight: 14 }}>{t("pickupAddressHint")}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 11, color: Colors.t3, marginBottom: 14, lineHeight: 15 }}>{t("modeHint3")}</Text>
        )}

        <Mono>{t("size")}</Mono>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {sizes.map((s) => (
            <Pressable key={s.key} onPress={() => setSize(s.key)} style={{ flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderColor: size === s.key ? Colors.accent : Colors.line, backgroundColor: "#fff" }}>
              <SizeIcon size={s.key} px={20} color={Colors.ink} />
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, maxWidth: 124 }}>
            {isHub ? <Wallet size={13} color="#fff" strokeWidth={2.2} style={{ opacity: 0.8 }} /> : null}
            <Text style={{ fontSize: 11, color: "#fff", opacity: 0.8, textAlign: "right", flexShrink: 1 }}>{isHub ? t("payAtHub") : t("payWhenMatched")}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(46,204,143,0.12)", borderRadius: 12, padding: 11, marginBottom: 6 }}>
          <PiggyBank size={13} color="#178a5e" strokeWidth={2.2} />
          <Text style={{ color: "#178a5e", fontWeight: "800", fontSize: 13 }}>{t("saveVs", { amount: cmp.saved })}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <Clock size={11.5} color={Colors.t2} strokeWidth={2.2} />
          <Text style={{ fontSize: 11.5, color: Colors.t2 }}>{t("daysFaster", { days: cmp.courierDays })}</Text>
        </View>

        <Pressable onPress={go} disabled={!doorReady} style={{ backgroundColor: isHub && selHub ? Colors.ink : Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: doorReady ? 1 : 0.5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {isHub && selHub ? <Navigation size={15} color="#fff" strokeWidth={2.2} /> : null}
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{ctaLabel}</Text>
          </View>
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
