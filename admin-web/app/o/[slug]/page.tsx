"use client";
// Quorly — the organization's public handle: quorly.ca/o/<slug>
//
// A shareable link a group can put in a newsletter or an email signature. It is
// a doorway, not a page: it resolves the slug, and once the visitor is signed in
// as a member it hands straight off to the app at /forms?open=<org>.
//
// The slug resolves for signed-out visitors too (cf_org_by_slug is anon-callable
// and returns identity only), so the sign-in they land on carries the group's own
// name and colour rather than a bare "Quorly" prompt — and someone who followed
// the wrong link can tell before they type anything.
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { quorly as supabase } from "@/lib/quorly";
import { cf } from "@/lib/cf";
import { useLang } from "@/lib/i18n";
import QuorlyOnboard from "@/components/QuorlyOnboard";
import { ArrowRight, Lock } from "lucide-react";

const C = { paper: "#FAF8F4", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3", accentSoft: "#EEEFF9" };
const L = (en: string, fr: string) => ({ en, fr });

type Org = { id: string; name: string; slug: string; color: string; org_type: string | null };
type Phase = "loading" | "notfound" | "signin" | "auth" | "checking" | "notmember";

export default function OrgHandlePage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(String(params?.slug ?? ""));
  const router = useRouter();
  const { lang, setLang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];

  const [org, setOrg] = useState<Org | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Signed in AND a member → straight into the app. Signed in but not a member
  // is a real state, not an error: they may be holding an invite code.
  const route = useCallback(async (o: Org) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email && !user?.phone) { setPhase("signin"); return; }
    const prof: any = await cf.myProfile().catch(() => ({}));
    if (!prof?.name) { setPhase("auth"); return; }
    setPhase("checking");
    try {
      const mine = await cf.myOrgs();
      if (mine.some((m) => m.id === o.id)) { router.replace(`/forms?open=${o.id}`); return; }
    } catch { /* fall through to the not-a-member card */ }
    setPhase("notmember");
  }, [router]);

  useEffect(() => {
    if (!slug) { setPhase("notfound"); return; }
    (async () => {
      let o: Org | null = null;
      try {
        const r: any = await cf.orgBySlug(slug);
        if (r && !r.error) o = r as Org;
      } catch { /* treated as not found */ }
      if (!o) { setPhase("notfound"); return; }
      setOrg(o);
      await route(o);
    })();
  }, [slug, route]);

  const joinByCode = async () => {
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      const r = await cf.resolveCode(c);
      if (r?.ok && r.token) router.push(`/join?token=${r.token}`);
      else alert(tr(L("Invalid or already-used code.", "Code invalide ou déjà utilisé.")));
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  // The shared onboarding wizard owns its own full screen.
  if (phase === "auth") return <QuorlyOnboard onDone={() => org && route(org)} />;

  const accent = org?.color || C.accent;
  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, display: "flex", alignItems: "flex-start", justifyContent: "center", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 460, margin: "60px auto 0", background: C.paper, borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.4)" }}>

        {/* branded head — the group's own name and colour, before anything is typed */}
        <div style={{ background: `linear-gradient(160deg, ${accent}, ${shade(accent)})`, color: "#fff", padding: "22px 22px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15 }}>Q</div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>Quorly</div>
            <div style={{ marginLeft: "auto", display: "inline-flex", background: "rgba(255,255,255,.16)", borderRadius: 8, padding: 2 }}>
              {(["en", "fr"] as const).map((l) => (
                <span key={l} onClick={() => setLang(l)} style={{ padding: "3px 9px", fontSize: 11, fontWeight: 800, borderRadius: 6, cursor: "pointer", background: lang === l ? "#fff" : "transparent", color: lang === l ? accent : "#fff" }}>{l.toUpperCase()}</span>
              ))}
            </div>
          </div>
          {org && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 21, flex: "0 0 auto" }}>
                {(org.name || "?").trim()[0]?.toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -.3, lineHeight: 1.2 }}>{org.name}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.82)", marginTop: 2 }}>quorly.ca/o/{org.slug}</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 13 }}>
          {phase === "loading" && <div style={{ fontSize: 13.5, color: C.faint }}>{tr(L("Loading…", "Chargement…"))}</div>}

          {phase === "checking" && <div style={{ fontSize: 13.5, color: C.faint }}>{tr(L("Opening your organization…", "Ouverture de votre organisation…"))}</div>}

          {phase === "notfound" && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{tr(L("No organization at this address", "Aucune organisation à cette adresse"))}</div>
              <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                {tr(L("Check the link, or ask whoever shared it to send it again — an organization's address can be changed by its administrator.",
                      "Vérifiez le lien, ou demandez à la personne qui l'a partagé de le renvoyer — l'adresse d'une organisation peut être modifiée par son administrateur."))}
              </div>
              <div onClick={() => router.push("/forms")} style={btn(C.accent)}>{tr(L("Go to Quorly", "Aller à Quorly"))}</div>
            </>
          )}

          {phase === "signin" && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{tr(L("Sign in to continue", "Connectez-vous pour continuer"))}</div>
              <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                {tr(L("You'll be taken straight to this organization once you're in.", "Vous serez dirigé directement vers cette organisation une fois connecté."))}
              </div>
              <div onClick={() => setPhase("auth")} style={{ ...btn(accent), display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {tr(L("Continue", "Continuer"))} <ArrowRight size={15} />
              </div>
            </>
          )}

          {phase === "notmember" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Lock size={16} /></span>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{tr(L("You're not a member yet", "Vous n'êtes pas encore membre"))}</div>
              </div>
              <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                {tr(L("Ask an administrator of this organization to invite you. If they already sent you a code, enter it below.",
                      "Demandez à un administrateur de cette organisation de vous inviter. S'il vous a déjà envoyé un code, saisissez-le ci-dessous."))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && joinByCode()}
                  placeholder={tr(L("Enter code", "Entrez le code"))}
                  style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px", fontSize: 14, background: "#fff", color: C.ink, outline: "none", width: "100%", textAlign: "center", letterSpacing: 2, fontWeight: 800, textTransform: "uppercase" }} />
                <div onClick={joinByCode} style={{ background: accent, color: "#fff", borderRadius: 9, padding: "0 16px", display: "flex", alignItems: "center", fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "→"}</div>
              </div>
              <div onClick={() => router.push("/forms")} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: C.ink2, cursor: "pointer", paddingTop: 2 }}>
                {tr(L("Go to my organizations", "Aller à mes organisations"))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const btn = (bg: string): any => ({ background: bg, color: "#fff", borderRadius: 10, padding: 12, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: "pointer" });

// Darker partner for the header gradient, derived from the organization's colour
// so a group that picked orange doesn't get a blue-tinted banner.
function shade(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return "#20245e";
  const [r, g, b] = [1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * 0.45));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
