"use client";
// Quorly — invite landing. Onboards the invitee (verify email + phone + profile via the
// shared wizard), then lets them pick a colour, accept any NDA, and join. Reads ?token= or a code.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { quorly as supabase } from "@/lib/quorly";
import { cf } from "@/lib/cf";
import QuorlyOnboard from "@/components/QuorlyOnboard";

const COLORS = ["#3B6FE0", "#E4632A", "#1F9D6B", "#8A4FD0", "#C99A1E", "#D14D8B", "#2AA6B8", "#7A8340", "#D93A3A", "#6D28D9", "#0891B2", "#BE5D1E", "#3F8F3F", "#C2417E", "#5B7C99", "#8A6D3B"];
const C = { paper: "#FAF8F4", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3" };
const L = (en: string, fr: string) => ({ en, fr });

export default function JoinPage() {
  return <Suspense fallback={<div style={{ background: "#2A2824", minHeight: "100vh" }} />}><JoinInner /></Suspense>;
}

function JoinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [mcode, setMcode] = useState("");
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [info, setInfo] = useState<any>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) cf.inviteInfo(token).then(setInfo).catch(() => setInfo({ error: "invalid" })); }, [token]);
  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email || user?.phone) { const p: any = await cf.myProfile().catch(() => ({})); setOnboarded(!!p?.name); } else setOnboarded(false);
  })(); }, []);

  async function useMemberCode() {
    if (!mcode.trim()) return; setBusy(true); setMsg("");
    try { const r = await cf.resolveCode(mcode.trim()); if (r?.ok && r.token) setToken(r.token); else setMsg(tr(L("Invalid or already-used code.", "Code invalide ou déjà utilisé."))); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const taken: string[] = info?.taken_colors ?? [];
  const available = COLORS.filter((c) => !taken.includes(c));
  useEffect(() => { if (available.length && !available.includes(color)) setColor(available[0]); }, [info]); // eslint-disable-line react-hooks/exhaustive-deps

  async function join() {
    setBusy(true); setMsg("");
    try { const r = await cf.joinToken(token, color, ""); if (r?.ok) router.push("/forms"); else setMsg(r?.error === "color_taken" ? tr(L("That colour is taken.", "Cette couleur est prise.")) : (r?.error || "Failed")); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const card: any = { maxWidth: 400, margin: "0 auto", background: C.paper, borderRadius: 14, boxShadow: "0 24px 60px rgba(0,0,0,.4)", overflow: "hidden" };
  const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px", fontSize: 14, background: "#fff", color: C.ink, width: "100%", outline: "none" };
  const btn: any = { background: C.accent, color: "#fff", borderRadius: 9, padding: 12, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: busy ? .6 : 1 };

  // Valid invite + not yet onboarded → run the verify-email/phone/profile wizard full-screen.
  if (token && info && !info.error && onboarded === false) {
    return <QuorlyOnboard lang={lang} onDone={() => setOnboarded(true)} />;
  }

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
          {!token ? (
            <>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{tr(L("Enter your code", "Entrez votre code"))}</div>
                <div style={{ color: C.ink2, fontSize: 13, marginTop: 4 }}>{tr(L("Use the member code from your invite.", "Utilisez le code membre de votre invitation."))}</div>
              </div>
              <input value={mcode} onChange={(e) => setMcode(e.target.value.toUpperCase())} placeholder={tr(L("e.g. 4F9C2A", "ex. 4F9C2A"))} style={{ ...inp, textAlign: "center", letterSpacing: 3, fontWeight: 800, textTransform: "uppercase" }} onKeyDown={(e) => e.key === "Enter" && useMemberCode()} />
              <div style={btn} onClick={useMemberCode}>{tr(L("Continue", "Continuer"))}</div>
              {msg && <div style={{ color: "#B4531F", fontSize: 12.5 }}>{msg}</div>}
            </>
          ) : info?.error ? (
            <div style={{ color: "#B4531F", fontSize: 14 }}>{tr(L("This invite link is invalid or already used.", "Ce lien d'invitation est invalide ou déjà utilisé."))}</div>
          ) : onboarded === null || !info ? (
            <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("Loading…", "Chargement…"))}</div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{tr(L("You're invited", "Vous êtes invité"))}</div>
                <div style={{ color: C.ink2, fontSize: 13, marginTop: 4 }}>{tr(L("Join", "Rejoindre"))} <b>{info?.form_name ?? "…"}</b>{info?.admin ? ` · ${tr(L("added by", "ajouté par"))} ${info.admin}` : ""}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint }}>{tr(L("Pick your colour", "Choisissez votre couleur"))}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {available.map((c) => <div key={c} onClick={() => setColor(c)} style={{ width: 38, height: 38, borderRadius: 10, background: c, cursor: "pointer", outline: color === c ? `3px solid ${C.ink}` : "none", outlineOffset: 2 }} />)}
              </div>
              {info?.nda && (
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, background: "#fff" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, marginBottom: 6 }}>{tr(L("Confidentiality", "Confidentialité"))}</div>
                  <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, maxHeight: 140, overflow: "auto", whiteSpace: "pre-wrap" }}>{info.nda}</div>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
                    {tr(L("I have read and agree to this clause.", "J'ai lu et j'accepte cette clause."))}
                  </label>
                </div>
              )}
              {available.length === 0
                ? <div style={{ color: "#B4531F", fontSize: 12.5 }}>{tr(L("All colours are taken on this form.", "Toutes les couleurs sont prises sur ce formulaire."))}</div>
                : <div style={{ ...btn, opacity: busy || (info?.nda && !agreed) ? .6 : 1 }} onClick={() => (!info?.nda || agreed) && join()}>{tr(L("Join form", "Rejoindre le formulaire"))}</div>}
              {msg && <div style={{ color: "#B4531F", fontSize: 12.5 }}>{msg}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
