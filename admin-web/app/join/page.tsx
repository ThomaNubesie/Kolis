"use client";
// Quorly — invite landing. Shows the form, signs the invitee in by email/phone OTP,
// then lets them pick their colour and join. Reads ?token=.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cf } from "@/lib/cf";

const COLORS = ["#3B6FE0", "#E4632A", "#1F9D6B", "#8A4FD0", "#C99A1E", "#D14D8B", "#2AA6B8", "#7A8340"];
const C = { paper: "#FAF8F4", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3" };
const L = (en: string, fr: string) => ({ en, fr });

export default function JoinPage() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [info, setInfo] = useState<any>(null);
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) cf.inviteInfo(token).then(setInfo).catch(() => setInfo({ error: "invalid" })); }, [token]);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user)); }, []);

  const taken: string[] = info?.taken_colors ?? [];
  const e164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : d.length === 10 ? "+1" + d : "+" + d; };

  async function sendCode() {
    setBusy(true); setMsg("");
    const { error } = mode === "email" ? await supabase.auth.signInWithOtp({ email: contact.trim() }) : await supabase.auth.signInWithOtp({ phone: e164(contact) });
    setBusy(false);
    if (error) setMsg(error.message); else setCodeSent(true);
  }
  async function verify() {
    setBusy(true); setMsg("");
    const { error } = mode === "email"
      ? await supabase.auth.verifyOtp({ email: contact.trim(), token: code.trim(), type: "email" })
      : await supabase.auth.verifyOtp({ phone: e164(contact), token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) setMsg(error.message); else setAuthed(true);
  }
  async function join() {
    setBusy(true); setMsg("");
    try { const r = await cf.joinToken(token, color); if (r?.ok) router.push("/forms"); else setMsg(r?.error === "color_taken" ? tr(L("That colour is taken.", "Cette couleur est prise.")) : (r?.error || "Failed")); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const card: any = { maxWidth: 400, margin: "0 auto", background: C.paper, borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,.4)", overflow: "hidden" };
  const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px", fontSize: 14, background: "#fff", color: C.ink, width: "100%", outline: "none" };
  const btn: any = { background: C.accent, color: "#fff", borderRadius: 9, padding: 12, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 };

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, display: "flex", alignItems: "flex-start", justifyContent: "center", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, marginRight: 9 }}>Q</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Quorly</div>
          <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {(["en", "fr"] as const).map((l) => <span key={l} onClick={() => setLang(l)} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>)}
          </div>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {!token || info?.error ? (
            <div style={{ color: "#B4531F", fontSize: 14 }}>{tr(L("This invite link is invalid or already used.", "Ce lien d'invitation est invalide ou déjà utilisé."))}</div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{tr(L("You're invited", "Vous êtes invité"))}</div>
                <div style={{ color: C.ink2, fontSize: 13, marginTop: 4 }}>{tr(L("Join", "Rejoindre"))} <b>{info?.form_name ?? "…"}</b>{info?.admin ? ` · ${tr(L("added by", "ajouté par"))} ${info.admin}` : ""}</div>
              </div>

              {!authed ? (
                <>
                  <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" }}>
                    {(["email", "phone"] as const).map((m) => <span key={m} onClick={() => { setMode(m); setCodeSent(false); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", background: mode === m ? C.accent : "#fff", color: mode === m ? "#fff" : C.ink2 }}>{m === "email" ? tr(L("Email", "Courriel")) : tr(L("Phone", "Téléphone"))}</span>)}
                  </div>
                  <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={mode === "email" ? tr(L("Your email", "Votre courriel")) : tr(L("Your phone", "Votre téléphone"))} style={inp} />
                  {!codeSent ? <div style={btn} onClick={sendCode}>{tr(L("Send code", "Envoyer le code"))}</div> : <>
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr(L("6-digit code", "Code à 6 chiffres"))} style={inp} />
                    <div style={btn} onClick={verify}>{tr(L("Verify & continue", "Vérifier et continuer"))}</div>
                  </>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint }}>{tr(L("Pick your colour", "Choisissez votre couleur"))}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {COLORS.map((c) => { const t = taken.includes(c); return <div key={c} onClick={() => !t && setColor(c)} style={{ width: 38, height: 38, borderRadius: 10, background: c, cursor: t ? "not-allowed" : "pointer", opacity: t ? .25 : 1, outline: color === c && !t ? `3px solid ${C.ink}` : "none", outlineOffset: 2 }} />; })}
                  </div>
                  <div style={btn} onClick={join}>{tr(L("Join form", "Rejoindre le formulaire"))}</div>
                </>
              )}
              {msg && <div style={{ color: "#B4531F", fontSize: 12.5 }}>{msg}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
