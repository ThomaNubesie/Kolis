// Shipping details — security + insurance form. Sender info auto-fills (read
// only); recipient + structured address + contents + insurance + liability
// agreement are required before payment. Carried forward as a JSON param.
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, KeyboardTypeOptions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ProfileAPI } from "../../services/profile";
import { supabase } from "../../services/supabase";
import { AddressFields, Address, emptyAddress, formatAddress, isAddressComplete } from "../../components/AddressFields";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react-native";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

// Module-level so they keep a stable identity — defining these inside the screen
// remounts every input on each keystroke and drops the keyboard.
function Mono({ children }: { children: string }) {
  return <Text style={{ fontSize: 10.5, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7, marginTop: 6, fontWeight: "700" }}>{children}</Text>;
}
function Field({ label, value, onChange, ph, req, keyboardType, multiline, autoCap }: {
  label: string; value: string; onChange: (v: string) => void; ph?: string; req?: boolean;
  keyboardType?: KeyboardTypeOptions; multiline?: boolean; autoCap?: "none" | "words" | "sentences" | "characters";
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11.5, color: Colors.t2, marginBottom: 4, fontWeight: "600" }}>{label}{req ? <Text style={{ color: Colors.accent }}> *</Text> : null}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={ph} placeholderTextColor={Colors.t3}
        keyboardType={keyboardType} multiline={multiline} autoCapitalize={autoCap}
        style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.ink, backgroundColor: "#fff", minHeight: multiline ? 64 : undefined, textAlignVertical: multiline ? "top" : "center" }}
      />
    </View>
  );
}

export default function Details() {
  const { t } = useStrings();
  const router = useRouter();
  const p = useLocalSearchParams<{ drop: string; size: string; from: string; to: string; price: string; pickup_hub?: string; hubName?: string; hubAddr?: string; pickup_addr?: string }>();

  const [sender, setSender] = useState<{ name: string; email: string; phone: string }>({ name: "", email: "", phone: "" });
  const [senderEmail, setSenderEmail] = useState("");
  const [country, setCountry] = useState("CA");
  // Sender pickup address (door mode): prefilled from the send screen, editable here.
  const [pickupAddr, setPickupAddr] = useState<string>(p.pickup_addr ?? "");
  const [pickupObj, setPickupObj] = useState<Address>(emptyAddress);
  const [editPickup, setEditPickup] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [addr, setAddr] = useState<Address>(emptyAddress);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contents, setContents] = useState("");
  const [value, setValue] = useState("");
  const [insured, setInsured] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    (async () => {
      const prof = await ProfileAPI.get();
      const { data: { user } } = await supabase.auth.getUser();
      setSender({ name: (prof as any)?.verified_name || prof?.full_name || "", email: prof?.email || "", phone: user?.phone || "" });
      setSenderEmail(prof?.email || "");
      if (prof?.country) setCountry(prof.country);
    })();
  }, []);

  const valNum = Number(value.replace(/[^0-9.]/g, ""));
  const shipPrice = Number(p.price ?? 0);
  const premium = insured && valNum > 0 ? valNum * 0.05 : 0;
  const total = shipPrice + premium;
  // Sender + recipient email AND phone are all required — both channels feed the
  // HUB drop-off scheduling invites (SMS + email) sent to each party.
  const ready =
    !!first.trim() && !!last.trim() && isAddressComplete(addr) &&
    phone.trim().length >= 6 && emailOk(email) &&
    emailOk(senderEmail) && sender.phone.trim().length >= 6 &&
    (p.drop !== "door" || pickupAddr.trim().length > 3) &&
    contents.trim().length > 1 &&
    valNum > 0 && insured !== null && agreed;

  const go = async () => {
    if (!ready) { Alert.alert("Kolis", t("fillRequired")); return; }
    // Persist the sender's email to their profile so the scheduling link reaches them.
    if (senderEmail.trim() && senderEmail.trim() !== (sender.email || "")) {
      await ProfileAPI.save({ email: senderEmail.trim() });
    }
    const form = JSON.stringify({
      recipient_name: `${first.trim()} ${last.trim()}`,
      recipient_phone: phone.trim(),
      recipient_email: email.trim(),
      dropoff_addr: formatAddress(addr),
      contents_description: contents.trim(),
      declared_value: valNum,
      insured,
      terms_accepted: true,
    });
    const base = { size: p.size, from: p.from, to: p.to, price: p.price, form };
    if (p.drop === "hub") {
      router.push({ pathname: "/(app)/directions", params: { ...base, pickup_hub: p.pickup_hub, hubName: p.hubName, hubAddr: p.hubAddr } });
    } else {
      router.push({ pathname: "/(app)/confirm", params: { ...base, drop: "door", pickup_addr: pickupAddr } });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("back")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("shipDetails")}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t2, marginBottom: 8 }}>{t("shipSub")}</Text>

        {/* Sender — name/phone auto-filled; email required for the scheduling link */}
        <Mono>{t("senderSection")}</Mono>
        <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 13, backgroundColor: Colors.cardAlt, marginBottom: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.ink }}>{sender.name || "—"}</Text>
          <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 2 }}>{sender.phone || "—"}</Text>
          <Text style={{ fontSize: 10, color: Colors.t3, marginTop: 6 }}>{p.from} → {p.to}</Text>
        </View>
        <Field label={t("yourEmail")} value={senderEmail} onChange={setSenderEmail} req keyboardType="email-address" autoCap="none" ph="name@email.com" />
        <Text style={{ fontSize: 11, color: Colors.t3, marginTop: -4, marginBottom: 6 }}>{t("yourEmailNote")}</Text>

        {/* Sender pickup address (door mode) — full address, editable with country-aware autocomplete */}
        {p.drop === "door" && (!editPickup ? (
          <Pressable onPress={() => setEditPickup(true)} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 13, marginBottom: 10, backgroundColor: "#fff" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11.5, color: Colors.t2, fontWeight: "600" }}>{t("pickupAddress")}<Text style={{ color: Colors.accent }}> *</Text></Text>
              <Text style={{ fontSize: 13.5, color: pickupAddr ? Colors.ink : Colors.t3, fontWeight: pickupAddr ? "700" : "400", marginTop: 3 }}>{pickupAddr || t("addAddress")}</Text>
            </View>
            <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 12 }}>{pickupAddr ? t("change") : t("add")}</Text>
          </Pressable>
        ) : (
          <View style={{ marginBottom: 10 }}>
            <Mono>{t("pickupAddress")}</Mono>
            <AddressFields value={pickupObj} onChange={(a) => { setPickupObj(a); if (isAddressComplete(a)) setPickupAddr(formatAddress(a)); }} country={country} />
            <Pressable onPress={() => setEditPickup(false)} style={{ alignSelf: "flex-end", paddingVertical: 6, paddingHorizontal: 4 }}>
              <Text style={{ color: Colors.accent, fontWeight: "800", fontSize: 13 }}>{t("done")}</Text>
            </Pressable>
          </View>
        ))}

        {/* Recipient */}
        <Mono>{t("recipientSection")}</Mono>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Field label={t("firstName")} value={first} onChange={setFirst} req autoCap="words" /></View>
          <View style={{ flex: 1 }}><Field label={t("lastName")} value={last} onChange={setLast} req autoCap="words" /></View>
        </View>
        <Field label={t("recipientPhone")} value={phone} onChange={setPhone} req keyboardType="phone-pad" />
        <Field label={t("recipientEmail")} value={email} onChange={setEmail} req keyboardType="email-address" autoCap="none" ph="name@email.com" />

        {/* Structured destination address */}
        <Mono>{t("destAddress")}</Mono>
        <AddressFields value={addr} onChange={setAddr} country={country} />

        {/* Contents */}
        <Mono>{t("contentsSection")}</Mono>
        <Field label={t("contentsDesc")} value={contents} onChange={setContents} req multiline ph={t("contentsPh")} autoCap="sentences" />
        <Field label={t("declaredValue")} value={value} onChange={setValue} req keyboardType="decimal-pad" ph="0.00" />

        {/* Insurance */}
        <Mono>{t("insuranceSection")}</Mono>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
          {[[true, t("insureAdd")], [false, t("insureDecline")]].map(([v, label]) => {
            const on = insured === v;
            return (
              <Pressable key={String(v)} onPress={() => setInsured(v as boolean)} style={{ flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, alignItems: "center", borderColor: on ? Colors.accent : Colors.line, backgroundColor: on ? "#fdeef4" : "#fff" }}>
                <Text style={{ fontWeight: "800", fontSize: 13, color: on ? Colors.accentDk : Colors.t2 }}>{label as string}</Text>
              </Pressable>
            );
          })}
        </View>
        {insured !== null && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
            {insured ? <ShieldCheck size={13} color="#178a5e" strokeWidth={2.2} style={{ marginTop: 1 }} /> : <AlertTriangle size={13} color={Colors.red} strokeWidth={2.2} style={{ marginTop: 1 }} />}
            <Text style={{ flex: 1, fontSize: 11.5, color: insured ? "#178a5e" : Colors.red, lineHeight: 16 }}>
              {insured ? t("insureAddNote") : t("insureDeclineNote")}
            </Text>
          </View>
        )}
        {premium > 0 && (
          <View style={{ backgroundColor: Colors.ink, borderRadius: 12, padding: 12, marginTop: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#fff", opacity: 0.8, fontSize: 12 }}>{t("insurePremiumLine", { amount: premium.toFixed(2) })}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{t("payTotalLine", { amount: total.toFixed(2) })}</Text>
            </View>
          </View>
        )}

        {/* Agreement */}
        <Mono>{t("agreementSection")}</Mono>
        <View style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, padding: 13, backgroundColor: "#fff", marginBottom: 10 }}>
          <Text style={{ fontSize: 11.5, color: Colors.t2, lineHeight: 17 }}>{t("agreementText")}</Text>
        </View>
        <Pressable onPress={() => setAgreed((a) => !a)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: agreed ? Colors.accent : Colors.t3, backgroundColor: agreed ? Colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
            {agreed ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: Colors.ink, fontWeight: "600" }}>{t("agreeCheckbox")}</Text>
        </Pressable>

        <Pressable onPress={go} disabled={!ready} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: ready ? 1 : 0.45 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("continueToPay")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
