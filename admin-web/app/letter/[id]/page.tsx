"use client";
// The appointment letter, on the web.
//
// The email carries the letterhead and the MMS cannot, so the text links here instead.
// It matters most for the people we reach by phone: the link alone is the whole
// appointment, with nothing to open in a mailbox they may not have set up.
//
// Only the person named in it or an admin of the conferring form can read it —
// cf_position_letter enforces that, and it goes through cf_is_admin_deep, so a
// suspended member gets nothing.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cf } from "@/lib/cf";
import { useLang } from "@/lib/i18n";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";

const L = (en: string, fr: string) => ({ en, fr });
const DOTS = ["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"];
const C = { paper: "#F4F1EA", ink: "#14131A", ink2: "#6B6675", faint: "#98A0AE", line: "#EAE4DA", accent: "#2F3AA3" };

type Letter = { ok?: boolean; error?: string; name?: string; title?: string; where?: string; org?: string; since?: string };

function LetterInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [d, setD] = useState<Letter | null>(null);

  useEffect(() => { cf.positionLetter(id).then(setD).catch(() => setD({ error: "not_found" })); }, [id]);

  if (!d) return <div style={{ background: C.paper, minHeight: "100vh" }} />;

  if (!d.ok) {
    const why = d.error === "not_yours" ? tr(L("This letter isn't addressed to you.", "Cette lettre ne vous est pas adressée."))
      : d.error === "no_title" ? tr(L("No position is recorded here.", "Aucune fonction n'est enregistrée ici."))
      : tr(L("This letter doesn't exist.", "Cette lettre n'existe pas."));
    return (
      <div style={{ background: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}>
            {DOTS.map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{why}</div>
          <div onClick={() => router.push("/forms")} style={{ marginTop: 14, fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>
            ← {tr(L("Open Quorly", "Ouvrir Quorly"))}
          </div>
        </div>
      </div>
    );
  }

  const first = (d.name || "").split(" ")[0];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", padding: "22px 12px", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.07)" }}>
        {/* Same letterhead as the email, so the two are recognisably one document. */}
        <div style={{ background: C.accent, padding: "18px 26px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "#fff", fontSize: 19, fontWeight: 900, letterSpacing: -.3 }}>Quorly</div>
          <div style={{ display: "flex", gap: 5 }}>{DOTS.map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}</div>
        </div>
        <div style={{ display: "flex", height: 4 }}>{DOTS.map((c) => <div key={c} style={{ flex: 1, background: c }} />)}</div>

        <div style={{ padding: "26px 30px 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .8, textTransform: "uppercase", color: C.faint, marginBottom: 4 }}>
            {d.where}{d.org && d.org !== d.where ? ` · ${d.org}` : ""}
          </div>
          <h1 style={{ margin: "0 0 16px", fontSize: 21, lineHeight: 1.25, color: C.ink }}>Vous avez une fonction.</h1>
          <p style={{ margin: "0 0 14px", fontSize: 14.5, lineHeight: 1.6, color: "#1C1B19" }}>
            {first ? `${first}, v` : "V"}ous avez été nommé(e) :
          </p>
          <div style={{ display: "flex", margin: "0 0 16px" }}>
            <div style={{ width: 4, background: C.accent, flex: "0 0 4px" }} />
            <div style={{ padding: "8px 0 8px 14px", fontSize: 19, fontWeight: 900, color: C.accent }}>{d.title}</div>
          </div>
          <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#1C1B19" }}>
            Votre fonction apparaît désormais à côté de votre nom, et vos décisions sont enregistrées sous ce titre — horodatées, numérotées et signées.
          </p>
          <p style={{ margin: "0 0 22px" }}>
            <a href="/forms" style={{ display: "inline-block", background: C.accent, color: "#fff", textDecoration: "none", fontWeight: 800, fontSize: 14.5, padding: "13px 22px", borderRadius: 10 }}>Ouvrir Quorly →</a>
          </p>
        </div>

        <div style={{ padding: "0 30px" }}><div style={{ borderTop: `1px solid ${C.line}` }} /></div>
        <div style={{ padding: "16px 30px 26px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .8, textTransform: "uppercase", color: C.faint, marginBottom: 10 }}>In English</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "#4a4750" }}>
            You have been appointed <b>{d.title}</b> in {d.where}. The title now appears beside your name, and decisions you record carry it — timestamped, numbered and signed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LetterPage() {
  return <QuorlyAuthGate><LetterInner /></QuorlyAuthGate>;
}
