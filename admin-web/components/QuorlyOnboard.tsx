"use client";
// Quorly onboarding — verify EMAIL, then verify PHONE, then create a profile (name).
// Used by both the /forms admin gate and the /join invite flow. Calls onDone(name)
// once the user has a session with a confirmed email + phone and a profile name.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cf } from "@/lib/cf";

const C = { paper: "#FAF8F4", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const L = (en: string, fr: string) => ({ en, fr });
type Step = "email" | "phone" | "name" | "done";

export default function QuorlyOnboard({ invitedEmail, invitedPhone, lang = "en", onDone }: { invitedEmail?: string; invitedPhone?: string; lang?: "en" | "fr"; onDone: (name: string) => void }) {
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(invitedEmail || "");
  const [phone, setPhone] = useState(invitedPhone || "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const e164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : d.length === 10 ? "+1" + d : "+" + d; };

  // Re-derive the correct step from the account's ACTUAL state — so a returning,
  // already-registered user is logged in and skipped straight to the app instead
  // of being forced to re-verify phone / re-enter name.
  async function evalStep(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const prof: any = user ? await cf.myProfile().catch(() => ({})) : {};
    if (user?.email) setEmail(user.email);
    if (user?.phone) setPhone(user.phone);
    if (prof?.name) setName(prof.name);
    if (user?.email && user?.phone && prof?.name) { onDone(prof.name); setStep("done"); }
    else if (user?.email && user?.phone) setStep("name");
    else if (user?.email) setStep("phone");
    else setStep("email");
  }

  useEffect(() => { evalStep().finally(() => setReady(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function restart() { await supabase.auth.signOut(); setSent(false); setCode(""); setPhone(""); setMsg(""); setStep("email"); }

  async function sendEmail() { setBusy(true); setMsg(""); const { error } = await supabase.auth.signInWithOtp({ email: email.trim() }); setBusy(false); if (error) setMsg(error.message); else setSent(true); }
  async function verifyEmail() { setBusy(true); setMsg(""); const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" }); if (error) { setBusy(false); setMsg(error.message); return; } setSent(false); setCode(""); await evalStep(); setBusy(false); }
  async function sendPhone() { setBusy(true); setMsg(""); const { error } = await supabase.auth.updateUser({ phone: e164(phone) }); setBusy(false); if (error) setMsg(/already|registered|exists|taken|in use/i.test(error.message) ? tr(L("This number is already linked to an account. Start over and sign in with that account's email.", "Ce numéro est déjà lié à un compte. Recommencez et connectez-vous avec le courriel de ce compte.")) : error.message); else setSent(true); }
  async function verifyPhone() { setBusy(true); setMsg(""); const { error } = await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: "phone_change" }); if (error) { setBusy(false); setMsg(error.message); return; } setSent(false); setCode(""); await evalStep(); setBusy(false); }
  async function saveName() { if (!name.trim()) return; setBusy(true); setMsg(""); try { await cf.setProfile(name.trim()); onDone(name.trim()); setStep("done"); } catch (e: any) { setMsg(e.message); } setBusy(false); }

  const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px", fontSize: 14, background: "#fff", color: C.ink, width: "100%", outline: "none" };
  const btn: any = { background: C.accent, color: "#fff", borderRadius: 9, padding: 12, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 };
  const stepNo = step === "email" ? 1 : step === "phone" ? 2 : 3;

  if (!ready) return <div style={{ background: "#2A2824", minHeight: "100vh" }} />;
  if (step === "done") return null;

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, display: "flex", alignItems: "flex-start", justifyContent: "center", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 400, width: "100%", margin: "40px auto 0", background: C.paper, borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,.4)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, marginRight: 9 }}>Q</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>Quorly</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>{[1, 2, 3].map((n) => <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= stepNo ? C.accent : C.line }} />)}</div>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint }}>{tr(L("Step", "Étape"))} {stepNo}/3</div>

          {step === "email" && <>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{tr(L("Verify your email", "Vérifiez votre courriel"))}</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr(L("Your email", "Votre courriel"))} style={inp} disabled={sent} />
            {!sent ? <div style={btn} onClick={sendEmail}>{tr(L("Send code", "Envoyer le code"))}</div> : <>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(L("6-digit code", "Code à 6 chiffres"))} style={inp} />
              <div style={btn} onClick={verifyEmail}>{tr(L("Verify email", "Vérifier le courriel"))}</div>
              <div onClick={sendEmail} style={{ fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{tr(L("Resend code", "Renvoyer le code"))}</div>
            </>}
          </>}

          {step === "phone" && <>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{tr(L("Verify your phone", "Vérifiez votre téléphone"))}</div>
            <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>✓ {email}</div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tr(L("Your mobile number", "Votre numéro mobile"))} style={inp} disabled={sent} />
            {!sent ? <div style={btn} onClick={sendPhone}>{tr(L("Send code", "Envoyer le code"))}</div> : <>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(L("6-digit code", "Code à 6 chiffres"))} style={inp} />
              <div style={btn} onClick={verifyPhone}>{tr(L("Verify phone", "Vérifier le téléphone"))}</div>
              <div onClick={sendPhone} style={{ fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{tr(L("Resend code", "Renvoyer le code"))}</div>
            </>}
          </>}

          {step === "name" && <>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{tr(L("Create your profile", "Créez votre profil"))}</div>
            <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>✓ {email} · ✓ {phone}</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(L("Your name", "Votre nom"))} style={inp} onKeyDown={(e) => e.key === "Enter" && saveName()} />
            <div style={{ ...btn, opacity: busy || !name.trim() ? .6 : 1 }} onClick={saveName}>{tr(L("Continue", "Continuer"))}</div>
          </>}

          {msg && <div style={{ color: "#B4531F", fontSize: 12.5 }}>{msg}</div>}
          {(step === "phone" || step === "name") && <div onClick={restart} style={{ fontSize: 11.5, color: C.ink2, fontWeight: 700, cursor: "pointer", textAlign: "center", marginTop: 2 }}>{tr(L("Use a different account", "Utiliser un autre compte"))}</div>}
        </div>
      </div>
    </div>
  );
}
