// Kolis signup wizard — mirrors the ConcordXpress onboarding screens.
// welcome → language → country → name → contact (email + phone, sequential
// verify) → summary. Role / identity-verify / payment come in later stages.
// (Theme step from CX is omitted — Kolis is a single light theme.)
import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AuthAPI } from "../../services/auth";
import { ProfileAPI, KolisRole } from "../../services/profile";
import { COUNTRIES, PHONE_RULES, countryByCode } from "../../constants/countries";
import type { Lang } from "../../constants/i18n";

type Step = "welcome" | "language" | "country" | "name" | "contact" | "otp" | "summary" | "role";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Onboarding() {
  const router = useRouter();
  const { setLang } = useStrings();

  const [step, setStep] = useState<Step>("welcome");
  const [lang, setLangLocal] = useState<Lang>("en");
  const [country, setCountry] = useState("CA");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailOk, setEmailOk] = useState(false);
  const [phoneOk, setPhoneOk] = useState(false);
  const [otpMode, setOtpMode] = useState<"email" | "phone">("email");
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [role, setRole] = useState<KolisRole>("sender");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cty = countryByCode(country);
  const rule = PHONE_RULES[country] || PHONE_RULES.CA;
  const e164 = `${cty.dial}${phone.replace(/\D/g, "")}`;

  const Header = ({ title, sub }: { title: string; sub?: string }) => (
    <View style={{ marginBottom: 18 }}>
      <View style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 19 }}>Ko</Text>
      </View>
      <Text style={{ fontSize: 23, fontWeight: "900", color: Colors.ink }}>{title}</Text>
      {sub ? <Text style={{ fontSize: 13, color: Colors.t2, marginTop: 5, lineHeight: 19 }}>{sub}</Text> : null}
    </View>
  );
  const Label = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 10.5, fontWeight: "800", color: Colors.t3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>{children}</Text>
  );
  const Primary = ({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 16, alignItems: "center", opacity: disabled || loading ? 0.4 : 1 }}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );

  // ── send / verify OTP ──────────────────────────────────────────────────────
  const sendEmail = async () => {
    if (!EMAIL_RE.test(email.trim())) { setErr("Enter a valid email address"); return; }
    setErr(""); setBusy(true);
    const res = await AuthAPI.sendEmailOTP(email.trim());
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setDevOtp(res.dev_otp || ""); setOtp(""); setOtpErr(""); setOtpMode("email"); setStep("otp");
  };
  const sendPhone = async () => {
    if (!rule.regex.test(phone.replace(/\D/g, ""))) { setErr(`Enter a valid ${cty.name} number`); return; }
    setErr(""); setBusy(true);
    const res = await AuthAPI.sendOTP(e164);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setDevOtp(""); setOtp(""); setOtpErr(""); setOtpMode("phone"); setStep("otp");
  };
  const verifyOtp = async (code: string) => {
    if (code.length < 6) return;
    setBusy(true); setOtpErr("");
    if (otpMode === "email") {
      const r = await AuthAPI.verifyEmailOTP(email.trim(), code);
      setBusy(false);
      if (!r.ok) { setOtpErr(r.error || "Wrong code. Try again."); return; }
      setEmailOk(true); setStep("contact");
    } else {
      const r = await AuthAPI.verifyOTP(e164, code);
      setBusy(false);
      if (r.error) { setOtpErr(r.error); return; }
      setPhoneOk(true); setStep("contact");
    }
  };

  const finish = async () => {
    // Phone OTP created the auth session; persist the full profile (incl. role).
    setBusy(true);
    await ProfileAPI.save({
      role,
      full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      email: email.trim(),
      country,
    });
    try {
      await AsyncStorage.multiSet([
        ["onboarded", "true"],
        ["userRole", role],
        ["userCountry", country],
        ["userName", `${firstName.trim()} ${lastName.trim()}`.trim()],
        ["userEmail", email.trim()],
      ]);
      await setLang(lang);
    } catch {}
    setBusy(false);
    // Identity verify → payment come next (later stages). For now, into the app.
    router.replace("/(app)/send");
  };

  // ── WELCOME ────────────────────────────────────────────────────────────────
  if (step === "welcome") return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 64, height: 64, borderRadius: 17, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 26 }}>Ko</Text>
        </View>
        <Text style={{ fontSize: 32, fontWeight: "900", color: Colors.ink, textAlign: "center" }}>Parcels,</Text>
        <Text style={{ fontSize: 32, fontWeight: "900", color: Colors.accent, fontStyle: "italic", textAlign: "center", marginBottom: 12 }}>in hours.</Text>
        <Text style={{ fontSize: 14, color: Colors.t2, textAlign: "center", lineHeight: 21, paddingHorizontal: 12 }}>A driver already heading to your city carries it — on the Concord network.</Text>
      </View>
      <View style={{ padding: 24 }}>
        <Primary label="Get started" onPress={() => setStep("language")} />
        <Pressable onPress={() => router.replace("/(auth)/sign-in")} style={{ padding: 14, alignItems: "center" }}>
          <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 14 }}>I already have an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {step !== "summary" && (
            <Pressable onPress={() => {
              const order: Step[] = ["welcome", "language", "country", "name", "contact", "summary", "role"];
              const i = order.indexOf(step === "otp" ? "contact" : step);
              if (i > 0) setStep(order[i - 1]);
            }} style={{ marginBottom: 6 }}>
              <Text style={{ color: Colors.t2, fontSize: 20 }}>←</Text>
            </Pressable>
          )}

          {/* LANGUAGE */}
          {step === "language" && (
            <>
              <Header title="Choose your language" sub="You can change this anytime." />
              {(["en", "fr"] as Lang[]).map((l) => (
                <Pressable key={l} onPress={() => setLangLocal(l)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 14, marginBottom: 9, backgroundColor: lang === l ? "#fdeef4" : "#fff", borderColor: lang === l ? Colors.accent : Colors.line }}>
                  <Text style={{ fontSize: 18 }}>{l === "en" ? "🇨🇦" : "🇫🇷"}</Text>
                  <Text style={{ flex: 1, fontWeight: "800", color: Colors.ink }}>{l === "en" ? "English" : "Français"}</Text>
                  {lang === l && <Text style={{ color: Colors.accent, fontWeight: "800" }}>✓</Text>}
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Primary label="Continue" onPress={() => { setLang(lang); setStep("country"); }} />
            </>
          )}

          {/* COUNTRY */}
          {step === "country" && (
            <>
              <Header title="Where are you?" sub="📍 Auto-selected from your device · sets currency & tax." />
              {COUNTRIES.map((c) => (
                <Pressable key={c.code} onPress={() => setCountry(c.code)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 13, marginBottom: 8, backgroundColor: country === c.code ? "#fdeef4" : "#fff", borderColor: country === c.code ? Colors.accent : Colors.line }}>
                  <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 14 }}>{c.name}</Text>
                    <Text style={{ fontSize: 11, color: Colors.t3 }}>{c.currency} · {c.dial}{country === c.code ? " · 📍 detected" : ""}</Text>
                  </View>
                  {country === c.code && <Text style={{ color: Colors.accent, fontWeight: "800" }}>✓</Text>}
                </Pressable>
              ))}
              <View style={{ height: 8 }} />
              <Primary label="Continue" onPress={() => setStep("name")} />
            </>
          )}

          {/* NAME */}
          {step === "name" && (
            <>
              <Header title="What's your legal name?" sub="Enter it exactly as it appears on your ID." />
              <Label>First name</Label>
              <TextInput value={firstName} onChangeText={setFirstName} placeholder="Marc" placeholderTextColor={Colors.t3}
                style={inputStyle} />
              <Label>Last name</Label>
              <TextInput value={lastName} onChangeText={setLastName} placeholder="Dubois" placeholderTextColor={Colors.t3}
                style={inputStyle} />
              <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 12, padding: 11, marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: Colors.t2, lineHeight: 16 }}>🪪 Must match the ID you'll verify next — we confirm it against your document.</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Primary label="Continue" disabled={!firstName.trim() || !lastName.trim()} onPress={() => setStep("contact")} />
            </>
          )}

          {/* CONTACT (sequential email then phone) */}
          {step === "contact" && (
            <>
              <Header title="Contact info" sub={emailOk ? "Now verify your phone." : "First, verify your email."} />
              {err ? <Text style={{ color: Colors.red, fontSize: 12.5, marginBottom: 10 }}>⚠️ {err}</Text> : null}

              <Label>Email address</Label>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                <TextInput value={email} onChangeText={(v) => { setEmail(v); setErr(""); }} editable={!emailOk}
                  placeholder="you@email.com" placeholderTextColor={Colors.t3} keyboardType="email-address" autoCapitalize="none"
                  style={[inputStyle, { flex: 1, marginBottom: 0, opacity: emailOk ? 0.6 : 1 }]} />
                {emailOk
                  ? <View style={verifiedBadge}><Text style={{ color: Colors.green, fontWeight: "800", fontSize: 12 }}>✓</Text></View>
                  : <Pressable onPress={sendEmail} disabled={busy} style={verifyBtn}><Text style={verifyBtnTxt}>Verify</Text></Pressable>}
              </View>
              {emailOk && <View style={{ backgroundColor: "#eafaf3", borderRadius: 10, padding: 9, marginBottom: 10 }}><Text style={{ color: "#178a5e", fontSize: 11.5, fontWeight: "700" }}>✅ Email verified — {email.trim()}</Text></View>}

              {emailOk && (
                <>
                  <Label>Phone number</Label>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <View style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 10 }}>
                      <Text style={{ fontWeight: "800", color: Colors.t2 }}>{cty.dial}</Text>
                    </View>
                    <TextInput value={phone} onChangeText={(v) => { setPhone(v); setErr(""); }} editable={!phoneOk}
                      placeholder={rule.placeholder} placeholderTextColor={Colors.t3} keyboardType="phone-pad"
                      style={[inputStyle, { flex: 1, marginBottom: 0, opacity: phoneOk ? 0.6 : 1 }]} />
                    {phoneOk
                      ? <View style={verifiedBadge}><Text style={{ color: Colors.green, fontWeight: "800", fontSize: 12 }}>✓</Text></View>
                      : <Pressable onPress={sendPhone} disabled={busy} style={verifyBtn}><Text style={verifyBtnTxt}>Verify</Text></Pressable>}
                  </View>
                  {phoneOk && <View style={{ backgroundColor: "#eafaf3", borderRadius: 10, padding: 9 }}><Text style={{ color: "#178a5e", fontSize: 11.5, fontWeight: "700" }}>✅ Phone verified</Text></View>}
                </>
              )}

              <View style={{ flex: 1, minHeight: 16 }} />
              <Primary label="Continue" disabled={!(emailOk && phoneOk)} onPress={() => setStep("summary")} />
            </>
          )}

          {/* OTP entry (email or phone) */}
          {step === "otp" && (
            <>
              <Header title={otpMode === "email" ? "Check your email" : "Check your texts"}
                sub={`We sent a 6-digit code to ${otpMode === "email" ? email.trim() : cty.dial + " " + phone}`} />
              <TextInput value={otp} onChangeText={(v) => { const d = v.replace(/\D/g, "").slice(0, 6); setOtp(d); setOtpErr(""); if (d.length === 6) verifyOtp(d); }}
                placeholder="••••••" placeholderTextColor={Colors.t3} keyboardType="number-pad" maxLength={6}
                style={{ borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 13, padding: 15, fontSize: 24, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: Colors.ink, backgroundColor: "#fff", marginBottom: 10 }} />
              {otpErr ? <Text style={{ color: Colors.red, fontSize: 12.5, textAlign: "center", marginBottom: 8 }}>{otpErr}</Text> : null}
              {devOtp ? <Text style={{ color: Colors.t3, fontSize: 11, textAlign: "center", marginBottom: 8 }}>dev code: {devOtp}</Text> : null}
              {otpMode === "email"
                ? <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 11, padding: 10, marginBottom: 10 }}><Text style={{ fontSize: 11, color: Colors.t2 }}>📬 Don't see it? Check Spam / Promotions and tap "Not spam."</Text></View>
                : <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 11, padding: 10, marginBottom: 10 }}><Text style={{ fontSize: 11, color: Colors.t2 }}>📩 No code yet? Texts can take a minute, then resend.</Text></View>}
              <Primary label="Verify" loading={busy} onPress={() => verifyOtp(otp)} />
              <Pressable onPress={otpMode === "email" ? sendEmail : sendPhone} style={{ padding: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 13 }}>Resend code</Text>
              </Pressable>
            </>
          )}

          {/* SUMMARY */}
          {step === "summary" && (
            <>
              <Header title="Looks good!" sub="Here's your profile." />
              {[["Name", `${firstName.trim()} ${lastName.trim()}`], ["Email", `${email.trim()} ✓`], ["Phone", `${cty.dial} ${phone} ✓`], ["Country", `${cty.flag} ${cty.name}`]].map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.line, borderRadius: 12, padding: 13, marginBottom: 9 }}>
                  <Text style={{ color: Colors.t3, fontSize: 12.5 }}>{k}</Text>
                  <Text style={{ color: Colors.ink, fontWeight: "700", fontSize: 12.5 }}>{v}</Text>
                </View>
              ))}
              <View style={{ flex: 1, minHeight: 16 }} />
              <Primary label="Continue" onPress={() => setStep("role")} />
            </>
          )}

          {/* ROLE */}
          {step === "role" && (
            <>
              <Header title="How will you use Kolis?" sub="You can do both — pick what fits. This sets up your verification." />
              {([
                ["sender", "📦", "Send parcels", "Ship things between cities"],
                ["courier", "🚗", "Deliver & earn", "Carry parcels on trips you take"],
                ["both", "🔁", "Both", "Send and deliver"],
              ] as [KolisRole, string, string, string][]).map(([r, icon, title, desc]) => (
                <Pressable key={r} onPress={() => setRole(r)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1.5, borderRadius: 13, padding: 13, marginBottom: 9, backgroundColor: role === r ? "#fdeef4" : "#fff", borderColor: role === r ? Colors.accent : Colors.line }}>
                  <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: Colors.cardAlt, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", color: Colors.ink, fontSize: 14 }}>{title}</Text>
                    <Text style={{ fontSize: 11, color: Colors.t3 }}>{desc}</Text>
                  </View>
                  {role === r && <Text style={{ color: Colors.accent, fontWeight: "800" }}>✓</Text>}
                </Pressable>
              ))}
              <View style={{ flex: 1, minHeight: 16 }} />
              <Primary label="Continue" loading={busy} onPress={finish} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const inputStyle = { borderWidth: 1.5, borderColor: Colors.line, borderRadius: 12, padding: 13, fontSize: 15, fontWeight: "600" as const, color: Colors.ink, backgroundColor: "#fff", marginBottom: 12 };
const verifyBtn = { backgroundColor: "#fdeef4", borderWidth: 1, borderColor: "#f3c2d5", borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" as const };
const verifyBtnTxt = { color: Colors.accentDk, fontWeight: "800" as const, fontSize: 12.5 };
const verifiedBadge = { width: 40, borderRadius: 10, backgroundColor: "#eafaf3", borderWidth: 1, borderColor: "#bdebd6", alignItems: "center" as const, justifyContent: "center" as const };
