"use client";
// Quorly onboarding — verify EMAIL, then verify PHONE, then create a profile (name).
// Used by both the /forms admin gate and the /join invite flow. Calls onDone(name)
// once the user has a session with a confirmed email + phone and a profile name.
import { useEffect, useState } from "react";
import { quorly as supabase } from "@/lib/quorly";
import { cf } from "@/lib/cf";
import { useLang } from "@/lib/i18n";
import { useLoginBackdrop } from "@/lib/loginBackdrop";

const C = { paper: "#FAF8F4", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const L = (en: string, fr: string) => ({ en, fr });
type Step = "email" | "phone" | "name" | "done";

export default function QuorlyOnboard({ invitedEmail, invitedPhone, onDone }: { invitedEmail?: string; invitedPhone?: string; lang?: "en" | "fr"; onDone: (name: string) => void }) {
  const { lang, setLang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [ready, setReady] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const backdrop = useLoginBackdrop();
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 720); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(invitedEmail || "");
  const [phone, setPhone] = useState(invitedPhone || "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [phoneMode, setPhoneMode] = useState<"attach" | "login">("attach"); // "login" = the number already has an account; sign into it
  const [mode, setMode] = useState<"onboard" | "signin">("onboard");
  const [signinChan, setSigninChan] = useState<"email" | "phone">("email");

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
    // Loop-free: one verified identity (email OR phone) + a profile = done. A one-identity
    // account with no profile goes straight to the profile step — NEVER bounced to the other
    // identity (which may live on a different account, causing an infinite loop).
    if (prof?.name && (user?.email || user?.phone)) { onDone(prof.name); setStep("done"); }
    else if (user?.email || user?.phone) setStep("name");
    else setStep("email");
  }

  useEffect(() => { evalStep().finally(() => setReady(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function restart() { await supabase.auth.signOut({ scope: "local" }); setSent(false); setCode(""); setPhone(""); setMsg(""); setPhoneMode("attach"); setStep("email"); }

  async function sendEmail() { setBusy(true); setMsg(""); const { error } = await supabase.auth.signInWithOtp({ email: email.trim() }); setBusy(false); if (error) setMsg(error.message); else setSent(true); }
  async function verifyEmail() {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) { setBusy(false); setMsg(error.message); return; }
    setSent(false); setCode("");
    const prof: any = await cf.myProfile().catch(() => ({}));
    if (prof?.name) { onDone(prof.name); setStep("done"); } else setStep("phone"); // phone is optional next
    setBusy(false);
  }
  async function sendPhone() {
    setBusy(true); setMsg("");
    if (phoneMode === "attach") {
      const { error } = await supabase.auth.updateUser({ phone: e164(phone) });
      if (!error) { setSent(true); setBusy(false); return; }
      if (/already|registered|exists|taken|in use|duplicate/i.test(error.message)) {
        // The number already belongs to an account → sign into THAT account instead of attaching.
        setPhoneMode("login");
        await supabase.auth.signOut({ scope: "local" });
        const { error: e2 } = await supabase.auth.signInWithOtp({ phone: e164(phone) });
        setBusy(false);
        if (e2) setMsg(e2.message);
        else { setSent(true); setMsg(tr(L("This number already has a Quorly account — enter the code to sign in.", "Ce numéro a déjà un compte Quorly — entrez le code pour vous connecter."))); }
        return;
      }
      setBusy(false); setMsg(error.message); return;
    }
    // login mode: (re)send the sign-in code to the number
    await supabase.auth.signOut({ scope: "local" });
    const { error } = await supabase.auth.signInWithOtp({ phone: e164(phone) });
    setBusy(false); if (error) setMsg(error.message); else setSent(true);
  }
  async function verifyPhone() {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: phoneMode === "login" ? "sms" : "phone_change" });
    if (error) { setBusy(false); setMsg(error.message); return; }
    setSent(false); setCode(""); await evalStep(); setBusy(false);
  }
  async function saveName() { if (!name.trim()) return; setBusy(true); setMsg(""); try { await cf.setProfile(name.trim()); onDone(name.trim()); setStep("done"); } catch (e: any) { setMsg(e.message); } setBusy(false); }

  // Direct sign-in for returning users (email OR phone OTP). After verify, evalStep
  // routes: fully-onboarded → straight in; otherwise resume the remaining steps.
  async function signinSend() { setBusy(true); setMsg(""); const { error } = signinChan === "email" ? await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } }) : await supabase.auth.signInWithOtp({ phone: e164(phone), options: { shouldCreateUser: false } }); setBusy(false); if (error) setMsg(/not.*found|no.*user|signups?.*not|otp_disabled/i.test(error.message) ? tr(L("No account found for that. Create one below.", "Aucun compte trouvé. Créez-en un ci-dessous.")) : error.message); else setSent(true); }
  async function signinVerify() { setBusy(true); setMsg(""); const { error } = signinChan === "email" ? await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" }) : await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: "sms" }); if (error) { setBusy(false); setMsg(error.message); return; } setSent(false); setCode(""); setMode("onboard"); await evalStep(); setBusy(false); }
  async function pivotToPhoneLogin() { setBusy(true); setMsg(""); setPhoneMode("login"); await supabase.auth.signOut({ scope: "local" }); const { error } = await supabase.auth.signInWithOtp({ phone: e164(phone) }); setBusy(false); if (error) setMsg(error.message); else { setSent(true); setMsg(tr(L("Enter the code we texted to sign in.", "Entrez le code envoyé par SMS pour vous connecter."))); } }
  function toSignin() { setMode("signin"); setSent(false); setCode(""); setMsg(""); }
  function toOnboard() { setMode("onboard"); setSent(false); setCode(""); setMsg(""); setStep("email"); }

  // With a landmark behind it the card is glass: fills at 40% opacity, so the photo
  // reads strongly through it. Only when there IS a photo — over the plain dark field,
  // translucency would just look muddy. At this level the blur and the darker centre
  // band behind the card are what keep the text legible; fields stay near-opaque,
  // because what you are typing has to stay readable whatever is behind it.
  const glass = !!backdrop;
  const inp: any = { border: `1px solid ${glass ? "rgba(255,255,255,.5)" : C.line}`, borderRadius: 9, padding: "11px", fontSize: 14, background: glass ? "rgba(255,255,255,.80)" : "#fff", color: C.ink, width: "100%", outline: "none" };
  const btn: any = { background: C.accent, color: "#fff", borderRadius: 9, padding: 12, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 };
  const stepNo = step === "email" ? 1 : step === "phone" ? 2 : 3;

  if (!ready) return <div style={{ background: "#2A2824", minHeight: "100vh" }} />;
  if (step === "done") return null;

  return (
    <div style={{ position: "relative", background: "#2A2824", minHeight: "100vh", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      {/* A Canadian landmark, from the database, changing every two hours. The scrim is
          symmetric — darkest down the middle where the card sits, clearing toward both
          edges — so the landmark stays a photograph at the margins instead of wallpaper. */}
      {backdrop && <>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${backdrop.url}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: narrow
          ? "linear-gradient(180deg,rgba(20,19,26,.62),rgba(20,19,26,.76))"
          : "linear-gradient(180deg,rgba(20,19,26,.16),rgba(20,19,26,.30))" }} />
        {!narrow && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,rgba(20,19,26,0) 0%,rgba(20,19,26,.10) 24%,rgba(20,19,26,.46) 42%,rgba(20,19,26,.46) 58%,rgba(20,19,26,.10) 76%,rgba(20,19,26,0) 100%)" }} />}
        <div style={{ position: "absolute", left: 18, bottom: 13, color: "rgba(255,255,255,.78)", fontSize: 11.5, fontWeight: 600, letterSpacing: .2, textShadow: "0 1px 3px rgba(0,0,0,.55)" }}>
          {lang === "fr" ? backdrop.label_fr : backdrop.label_en}
        </div>
      </>}
      <div style={{ position: "relative", width: "100%", maxWidth: narrow ? 420 : 760, margin: "auto", background: glass ? "transparent" : C.paper, backdropFilter: glass ? "blur(18px)" : undefined, WebkitBackdropFilter: glass ? "blur(18px)" : undefined, border: glass ? "1px solid rgba(255,255,255,.22)" : undefined, borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.4)", overflow: "hidden", display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
        {/* Brand panel */}
        <div style={{ background: glass ? "linear-gradient(160deg,rgba(47,58,163,.40),rgba(32,36,94,.40))" : "linear-gradient(160deg,#2F3AA3,#20245e)", color: "#fff", padding: narrow ? "20px 20px 18px" : "26px 24px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.18)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>Q</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Quorly</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 3, paddingLeft: 43 }}>{["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"].map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "inline-flex", background: "rgba(255,255,255,.14)", borderRadius: 8, padding: 2 }}>
              {(["en", "fr"] as const).map((lg) => <span key={lg} onClick={() => setLang(lg)} style={{ padding: "3px 9px", fontSize: 11, fontWeight: 800, borderRadius: 6, cursor: "pointer", background: lang === lg ? "#fff" : "transparent", color: lang === lg ? C.accent : "#fff" }}>{lg.toUpperCase()}</span>)}
            </div>
          </div>
          <div style={{ fontSize: narrow ? 19 : 22, fontWeight: 900, lineHeight: 1.22, margin: narrow ? "14px 0 6px" : "auto 0 8px" }}>{tr(L("Decide together,", "Décidez ensemble,"))}<br />{tr(L("on the record.", "de façon officielle."))}</div>
          <div style={{ color: "#C9CBEC", fontSize: 12.5, lineHeight: 1.5 }}>{tr(L("Everyone gets a colour. Every entry is timed, numbered and signed.", "Chacun sa couleur. Chaque entrée est horodatée, numérotée et signée."))}</div>
          {!narrow && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
            {[tr(L("Vote", "Vote")), tr(L("Comment", "Commentaires")), tr(L("Ledgers", "Registres")), tr(L("PDF & files", "PDF & fichiers"))].map((c) => <span key={c} style={{ background: "rgba(255,255,255,.14)", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700 }}>{c}</span>)}
          </div>}
        </div>
        {/* Form panel */}
        <div style={{ background: glass ? "rgba(255,255,255,.40)" : "#fff", display: "flex", flexDirection: "column" }}>
          {mode === "onboard" && <div style={{ display: "flex", gap: 5, padding: "16px 20px 0", justifyContent: "flex-end" }}>{[1, 2, 3].map((n) => <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= stepNo ? C.accent : C.line }} />)}</div>}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 13 }}>
          {mode === "signin" ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{tr(L("Sign in", "Connexion"))}</div>
              <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" }}>
                {(["email", "phone"] as const).map((m) => <span key={m} onClick={() => { setSigninChan(m); setSent(false); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", background: signinChan === m ? C.accent : "#fff", color: signinChan === m ? "#fff" : C.ink2 }}>{m === "email" ? tr(L("Email", "Courriel")) : tr(L("Phone", "Téléphone"))}</span>)}
              </div>
              {signinChan === "email"
                ? <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr(L("Your email", "Votre courriel"))} style={inp} disabled={sent} />
                : <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tr(L("Your mobile number", "Votre numéro mobile"))} style={inp} disabled={sent} />}
              {!sent ? <div style={btn} onClick={signinSend}>{tr(L("Send code", "Envoyer le code"))}</div> : <>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(L("6-digit code", "Code à 6 chiffres"))} style={inp} />
                <div style={btn} onClick={signinVerify}>{tr(L("Sign in", "Se connecter"))}</div>
                <div onClick={signinSend} style={{ fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{tr(L("Resend code", "Renvoyer le code"))}</div>
              </>}
              <div onClick={toOnboard} style={{ fontSize: 12, color: C.ink2, fontWeight: 700, cursor: "pointer", textAlign: "center", marginTop: 2 }}>{tr(L("New here? Create an account", "Nouveau ? Créer un compte"))}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint }}>{tr(L("Step", "Étape"))} {stepNo}/3</div>

              {step === "email" && <>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{tr(L("Verify your email", "Vérifiez votre courriel"))}</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr(L("Your email", "Votre courriel"))} style={inp} disabled={sent} />
                {!sent ? <div style={btn} onClick={sendEmail}>{tr(L("Send code", "Envoyer le code"))}</div> : <>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(L("6-digit code", "Code à 6 chiffres"))} style={inp} />
                  <div style={btn} onClick={verifyEmail}>{tr(L("Verify email", "Vérifier le courriel"))}</div>
                  <div onClick={sendEmail} style={{ fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{tr(L("Resend code", "Renvoyer le code"))}</div>
                </>}
                <div onClick={toSignin} style={{ fontSize: 12.5, color: C.accent, fontWeight: 800, cursor: "pointer", textAlign: "center", marginTop: 2 }}>{tr(L("Already have an account? Sign in", "Vous avez déjà un compte ? Connectez-vous"))}</div>
              </>}

              {step === "phone" && <>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{phoneMode === "login" ? tr(L("Sign in with your phone", "Connexion par téléphone")) : tr(L("Add your phone", "Ajoutez votre téléphone"))}</div>
                {phoneMode === "attach" && <div style={{ fontSize: 12.5, color: C.ink2 }}>{email ? <><span style={{ color: C.green, fontWeight: 700 }}>✓ {email}</span> · </> : null}{tr(L("Optional — helps recover your account.", "Optionnel — aide à récupérer votre compte."))}</div>}
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tr(L("Your mobile number", "Votre numéro mobile"))} style={inp} disabled={sent} />
                {!sent ? <div style={btn} onClick={sendPhone}>{tr(L("Send code", "Envoyer le code"))}</div> : <>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(L("6-digit code", "Code à 6 chiffres"))} style={inp} />
                  <div style={btn} onClick={verifyPhone}>{phoneMode === "login" ? tr(L("Sign in", "Se connecter")) : tr(L("Verify phone", "Vérifier le téléphone"))}</div>
                  <div onClick={sendPhone} style={{ fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{tr(L("Resend code", "Renvoyer le code"))}</div>
                </>}
                {phoneMode === "attach" && msg && <div onClick={pivotToPhoneLogin} style={{ background: C.accentSoft, color: C.accent, borderRadius: 9, padding: "10px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{tr(L("Sign in with this number instead", "Se connecter avec ce numéro"))}</div>}
                {phoneMode === "attach" && <div onClick={() => { setSent(false); setCode(""); setMsg(""); setStep("name"); }} style={{ fontSize: 12.5, color: C.ink2, fontWeight: 800, cursor: "pointer", textAlign: "center", marginTop: 2 }}>{tr(L("Skip for now →", "Passer pour l'instant →"))}</div>}
              </>}

              {step === "name" && <>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{tr(L("Create your profile", "Créez votre profil"))}</div>
                <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>{[email && `✓ ${email}`, phone && `✓ ${phone}`].filter(Boolean).join(" · ")}</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(L("Your name", "Votre nom"))} style={inp} onKeyDown={(e) => e.key === "Enter" && saveName()} />
                <div style={{ ...btn, opacity: busy || !name.trim() ? .6 : 1 }} onClick={saveName}>{tr(L("Continue", "Continuer"))}</div>
              </>}

              {(step === "phone" || step === "name") && <div onClick={restart} style={{ fontSize: 11.5, color: C.ink2, fontWeight: 700, cursor: "pointer", textAlign: "center", marginTop: 2 }}>{tr(L("Use a different account", "Utiliser un autre compte"))}</div>}
            </>
          )}

          {msg && <div style={{ color: "#B4531F", fontSize: 12.5 }}>{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
