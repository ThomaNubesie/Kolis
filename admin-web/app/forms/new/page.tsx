"use client";
// Quorly — Create a form (UI shell, mock). Feature toggles + field builder +
// approval count + admin colour pick + invite by email/phone. Bilingual.
import { useState } from "react";
import { useRouter } from "next/navigation";

const COLORS = ["#3B6FE0", "#E4632A", "#1F9D6B", "#8A4FD0", "#C99A1E", "#D14D8B", "#2AA6B8", "#7A8340"];
const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9" };

type FType = "text" | "longtext" | "select" | "number" | "date" | "photo";
type FieldRow = { id: number; label: string; type: FType; options: string };
type Feat = "fields" | "voting" | "ai" | "translation" | "comments" | "photos";

const L = (en: string, fr: string) => ({ en, fr });
const FEATURES: { key: Feat; t: { en: string; fr: string }; d: { en: string; fr: string } }[] = [
  { key: "fields", t: L("Structured fields", "Champs structurés"), d: L("Admin-defined fields per entry", "Champs définis par l'admin") },
  { key: "voting", t: L("Voting / approval", "Vote / approbation"), d: L("Members vote to approve an entry", "Les membres votent pour approuver") },
  { key: "ai", t: L("AI writing assistant", "Assistant d'écriture IA"), d: L("Fix grammar & polish tone, any language", "Grammaire & style, toute langue") },
  { key: "translation", t: L("Translate entries", "Traduire les entrées"), d: L("Read any entry in your language", "Lire toute entrée dans votre langue") },
  { key: "comments", t: L("Comments", "Commentaires"), d: L("Threaded replies on each entry", "Réponses sous chaque entrée") },
  { key: "photos", t: L("Photos", "Photos"), d: L("Attach images to entries", "Joindre des images") },
];
const FTYPES: { v: FType; t: { en: string; fr: string } }[] = [
  { v: "text", t: L("Text", "Texte") }, { v: "longtext", t: L("Long text", "Texte long") },
  { v: "select", t: L("Select", "Liste") }, { v: "number", t: L("Number", "Nombre") },
  { v: "date", t: L("Date", "Date") }, { v: "photo", t: L("Photo", "Photo") },
];

export default function NewFormPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [feats, setFeats] = useState<Record<Feat, boolean>>({ fields: true, voting: false, ai: true, translation: true, comments: true, photos: false });
  const [approval, setApproval] = useState(2);
  const [color, setColor] = useState(COLORS[0]);
  const [fields, setFields] = useState<FieldRow[]>([{ id: 1, label: "", type: "text", options: "" }]);
  const [invite, setInvite] = useState("");
  const [invited, setInvited] = useState<string[]>([]);

  const addField = () => setFields((f) => [...f, { id: Date.now(), label: "", type: "text", options: "" }]);
  const setField = (id: number, patch: Partial<FieldRow>) => setFields((f) => f.map((x) => x.id === id ? { ...x, ...patch } : x));
  const rmField = (id: number) => setFields((f) => f.filter((x) => x.id !== id));
  const addInvite = () => { const v = invite.trim(); if (v && !invited.includes(v)) { setInvited((a) => [...a, v]); setInvite(""); } };

  function create() {
    const payload = { name, desc, features: feats, approvalCount: feats.voting ? approval : null, adminColor: color, fields: feats.fields ? fields.filter((f) => f.label.trim()) : [], invited };
    console.log("cf_create_form", payload);
    alert((lang === "fr" ? "Formulaire créé (démo)\n\n" : "Form created (demo)\n\n") + JSON.stringify(payload, null, 2));
    router.push("/forms");
  }

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: C.paper, borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{tr(L("New form", "Nouveau formulaire"))}</div>
          <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {(["en", "fr"] as const).map((l) => <span key={l} onClick={() => setLang(l)} style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>)}
          </div>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={lbl}>{tr(L("Form name", "Nom du formulaire"))}</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(L("e.g. Site Inspection — Bldg A", "ex. Inspection — Bât. A"))} style={inp} />
          </div>
          <div>
            <div style={lbl}>{tr(L("Description (optional)", "Description (optionnel)"))}</div>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} style={inp} />
          </div>

          <div>
            <div style={lbl}>{tr(L("Features", "Fonctions"))}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {FEATURES.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 11, border: `1px solid ${C.line}`, borderRadius: 11, padding: 11, background: "#fff" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 800 }}>{tr(f.t)}</div><div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{tr(f.d)}</div></div>
                  <div onClick={() => setFeats((s) => ({ ...s, [f.key]: !s[f.key] }))} style={{ marginLeft: "auto", width: 40, height: 23, borderRadius: 999, background: feats[f.key] ? C.accent : "#D9D3C8", position: "relative", cursor: "pointer" }}>
                    <div style={{ position: "absolute", top: 2, width: 19, height: 19, borderRadius: "50%", background: "#fff", left: feats[f.key] ? 19 : 2, transition: "left .12s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {feats.voting && (
            <div>
              <div style={lbl}>{tr(L("Approvals needed", "Approbations requises"))}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C.line}`, borderRadius: 11, padding: "10px 14px", background: "#fff" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink2 }}>{tr(L("Votes to approve an entry", "Votes pour approuver une entrée"))}</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
                  <span onClick={() => setApproval((n) => Math.max(1, n - 1))} style={rnd}>−</span>
                  <span style={{ fontWeight: 900, fontSize: 15, minWidth: 16, textAlign: "center" }}>{approval}</span>
                  <span onClick={() => setApproval((n) => n + 1)} style={rnd}>+</span>
                </div>
              </div>
            </div>
          )}

          {feats.fields && (
            <div>
              <div style={lbl}>{tr(L("Entry fields", "Champs d'entrée"))}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {fields.map((f, i) => (
                  <div key={f.id} style={{ border: `1px solid ${C.line}`, borderRadius: 11, padding: 11, background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={f.label} onChange={(e) => setField(f.id, { label: e.target.value })} placeholder={tr(L(`Field ${i + 1} label`, `Libellé du champ ${i + 1}`))} style={{ ...inp, flex: 1 }} />
                      <select value={f.type} onChange={(e) => setField(f.id, { type: e.target.value as FType })} style={{ ...inp, width: 130 }}>
                        {FTYPES.map((t) => <option key={t.v} value={t.v}>{tr(t.t)}</option>)}
                      </select>
                      <span onClick={() => rmField(f.id)} style={{ ...rnd, width: 38, color: "#B4531F" }}>✕</span>
                    </div>
                    {f.type === "select" && <input value={f.options} onChange={(e) => setField(f.id, { options: e.target.value })} placeholder={tr(L("Options, comma-separated", "Options, séparées par des virgules"))} style={inp} />}
                  </div>
                ))}
                <div onClick={addField} style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>{tr(L("+ Add field", "+ Ajouter un champ"))}</div>
              </div>
            </div>
          )}

          <div>
            <div style={lbl}>{tr(L("Your colour", "Votre couleur"))}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COLORS.map((c) => <div key={c} onClick={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 9, background: c, cursor: "pointer", outline: color === c ? `3px solid ${C.ink}` : "none", outlineOffset: 2 }} />)}
            </div>
          </div>

          <div>
            <div style={lbl}>{tr(L("Invite members (email or phone)", "Inviter des membres (courriel ou téléphone)"))}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={invite} onChange={(e) => setInvite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInvite()} placeholder={tr(L("email or phone number", "courriel ou téléphone"))} style={{ ...inp, flex: 1 }} />
              <span onClick={addInvite} style={{ background: C.accentSoft, color: C.accent, borderRadius: 9, padding: "10px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{tr(L("Add", "Ajouter"))}</span>
            </div>
            {invited.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
              {invited.map((v) => <span key={v} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700 }}>{v} <span onClick={() => setInvited((a) => a.filter((x) => x !== v))} style={{ color: C.faint, cursor: "pointer" }}>✕</span></span>)}
            </div>}
          </div>

          <div onClick={create} style={{ background: name.trim() ? C.accent : "#C9C3B8", color: "#fff", borderRadius: 10, padding: 13, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: name.trim() ? "pointer" : "default" }}>{tr(L("Create & invite", "Créer et inviter"))}</div>
        </div>
      </div>
    </div>
  );
}

const lbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, marginBottom: 8 };
const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 11px", fontSize: 14, background: "#fff", color: C.ink, outline: "none", width: "100%" };
const rnd: any = { width: 30, height: 30, borderRadius: 8, background: C.line2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: C.accent, cursor: "pointer" };
