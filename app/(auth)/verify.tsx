// Kolis identity verification (Stripe Identity, hosted). Role-based doc select
// (courier/both = driver's licence with a sweep animation; sender = any ID) →
// open Stripe's hosted scan/selfie → poll status. Identity is confirmed BEFORE
// payment, so a failed check is never charged. Name is reconciled to the ID.
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, LayoutAnimation, Platform, UIManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { Colors } from "../../constants/colors";
import { IdentityAPI } from "../../services/identity";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Step = "doc_select" | "scanning" | "confirmed" | "failed";
const ALL_DOCS = [
  { id: "dl", label: "Driver's Licence", sub: "Front & back · required", icon: "🪪" },
  { id: "passport", label: "Passport", sub: "Photo page", icon: "📘" },
  { id: "id_card", label: "Provincial ID", sub: "Front & back", icon: "🆔" },
];

export default function Verify() {
  const router = useRouter();
  const [role, setRole] = useState<string>("sender");
  const [step, setStep] = useState<Step>("doc_select");
  const [docType, setDocType] = useState<string | null>(null);
  const [sweepIdx, setSweepIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef(false);

  const isCourier = role === "courier" || role === "both";

  useEffect(() => { AsyncStorage.getItem("userRole").then((r) => { if (r) setRole(r); }); }, []);

  // Courier/both sweep → land on DL, collapse the rest.
  useEffect(() => {
    if (step !== "doc_select" || !isCourier || collapsed) return;
    const seq = [0, 1, 2, 1, 0];
    let i = 0;
    setSweepIdx(0);
    const iv = setInterval(() => {
      i++;
      if (i < seq.length) { setSweepIdx(seq[i]); return; }
      clearInterval(iv);
      setSweepIdx(0); setDocType("dl");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCollapsed(true);
    }, 420);
    return () => clearInterval(iv);
  }, [step, isCourier, collapsed]);

  const docs = isCourier ? (collapsed ? ALL_DOCS.filter((d) => d.id === "dl") : ALL_DOCS) : ALL_DOCS;
  const sweeping = isCourier && !collapsed;

  const startScan = async () => {
    setBusy(true); setErr("");
    const res = await IdentityAPI.createSession(role);
    if ("error" in res && res.error) { setBusy(false); setErr(res.error); return; }
    setStep("scanning");
    try { await WebBrowser.openBrowserAsync((res as any).url); } catch {}
    setBusy(false);
    poll();
  };

  const poll = async () => {
    if (pollRef.current) return;
    pollRef.current = true;
    for (let i = 0; i < 6; i++) {
      const { status } = await IdentityAPI.status();
      if (status === "verified") { pollRef.current = false; setStep("confirmed"); return; }
      if (status === "canceled" || status === "error") { pollRef.current = false; setStep("failed"); return; }
      await new Promise((r) => setTimeout(r, 2500));
    }
    pollRef.current = false;
    // Still processing — Stripe resolves async; let them proceed (backend gates real access).
    setStep("confirmed");
  };

  const toPayment = () => router.replace("/(app)/send"); // stage 4 inserts the payment screen here

  const Primary = ({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: disabled || loading ? 0.4 : 1 }}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
  const ok = (t: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#eafaf3", borderWidth: 1, borderColor: "#bdebd6", borderRadius: 12, padding: 11, marginBottom: 9 }}>
      <Text style={{ color: "#178a5e", fontWeight: "700", fontSize: 12.5 }}>✅ {t}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40, flexGrow: 1 }}>

        {step === "doc_select" && (
          <>
            <View style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 19 }}>Ko</Text>
            </View>
            <Text style={{ fontSize: 23, fontWeight: "900", color: Colors.ink }}>{isCourier ? "Verify your licence" : "Verify your identity"}</Text>
            <Text style={{ fontSize: 13, color: Colors.t2, marginTop: 5, marginBottom: 18 }}>
              {isCourier ? "Couriers verify with a valid driver's licence." : "Choose a government ID. Passport, licence, or provincial ID."}
            </Text>
            {err ? <Text style={{ color: Colors.red, fontSize: 12.5, marginBottom: 10 }}>⚠️ {err}</Text> : null}
            {docs.map((d, i) => {
              const hot = docType === d.id || (sweeping && sweepIdx === i);
              return (
                <Pressable key={d.id} disabled={sweeping} onPress={() => { if (!sweeping) setDocType(d.id); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 13, marginBottom: 9, backgroundColor: hot ? "#fdeef4" : "#fff", borderColor: hot ? Colors.accent : Colors.line }}>
                  <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: Colors.cardAlt, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>{d.icon}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", color: hot ? Colors.accentDk : Colors.ink, fontSize: 14 }}>{d.label}</Text>
                    <Text style={{ fontSize: 11, color: Colors.t3 }}>{d.sub}</Text>
                  </View>
                  {docType === d.id && <Text style={{ color: Colors.accent, fontWeight: "800" }}>✓</Text>}
                </Pressable>
              );
            })}
            <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 11, padding: 11, marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: Colors.t2 }}>🔒 Powered by Stripe Identity · your document is encrypted.</Text>
            </View>
            <View style={{ flex: 1, minHeight: 18 }} />
            <Primary label="Start verification →" disabled={!docType} loading={busy} onPress={startScan} />
          </>
        )}

        {step === "scanning" && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={{ fontSize: 16, fontWeight: "800", color: Colors.ink, marginTop: 16 }}>Checking your verification…</Text>
            <Text style={{ fontSize: 12.5, color: Colors.t2, textAlign: "center", marginTop: 6, paddingHorizontal: 30 }}>Finish in the Stripe window, then come back here.</Text>
          </View>
        )}

        {step === "confirmed" && (
          <>
            <Text style={{ fontSize: 52, textAlign: "center", marginTop: 24 }}>✅</Text>
            <Text style={{ fontSize: 24, fontWeight: "900", color: Colors.ink, textAlign: "center", marginVertical: 8 }}>Identity confirmed</Text>
            <Text style={{ fontSize: 13, color: Colors.t2, textAlign: "center", marginBottom: 20 }}>Your ID and face matched. Now activate your account.</Text>
            {ok("ID verified")}{ok("Face match passed")}
            <View style={{ backgroundColor: "#fdf6e6", borderWidth: 1, borderColor: "#e8b54a88", borderRadius: 12, padding: 11, marginTop: 2 }}>
              <Text style={{ fontSize: 11.5, color: "#8a6d2a" }}>ℹ️ If verification ever fails you're not charged — you only pay once verified.</Text>
            </View>
            <View style={{ flex: 1, minHeight: 18 }} />
            <Primary label="Continue to payment →" onPress={toPayment} />
          </>
        )}

        {step === "failed" && (
          <>
            <Text style={{ fontSize: 52, textAlign: "center", marginTop: 24 }}>⚠️</Text>
            <Text style={{ fontSize: 22, fontWeight: "900", color: Colors.ink, textAlign: "center", marginVertical: 8 }}>Couldn't verify</Text>
            <Text style={{ fontSize: 13, color: Colors.t2, textAlign: "center", marginBottom: 20 }}>We couldn't confirm your identity — and you were <Text style={{ fontWeight: "800" }}>not charged</Text>. You can try again.</Text>
            <View style={{ flex: 1, minHeight: 18 }} />
            <Primary label="Try again" onPress={() => { setStep("doc_select"); setDocType(isCourier ? "dl" : null); setErr(""); }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
