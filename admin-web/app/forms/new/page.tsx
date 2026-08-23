"use client";
// Quorly — Create a form (UI shell, mock). Feature toggles + field builder +
// approval count + admin colour pick + invite by email/phone. Bilingual.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cf } from "@/lib/cf";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";

const COLORS = ["#3B6FE0", "#E4632A", "#1F9D6B", "#8A4FD0", "#C99A1E", "#D14D8B", "#2AA6B8", "#7A8340", "#D93A3A", "#6D28D9", "#0891B2", "#BE5D1E", "#3F8F3F", "#C2417E", "#5B7C99", "#8A6D3B"];
const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9" };

type FType = "text" | "longtext" | "select" | "number" | "date" | "photo";
type FieldRow = { id: number; label: string; type: FType; options: string };
type Feat = "fields" | "member_entries" | "voting" | "ai" | "translation" | "comments" | "photos";

const L = (en: string, fr: string) => ({ en, fr });
const FEATURES: { key: Feat; t: { en: string; fr: string }; d: { en: string; fr: string } }[] = [
  { key: "fields", t: L("Structured fields", "Champs structurés"), d: L("Admin-defined fields per entry", "Champs définis par l'admin") },
  { key: "member_entries", t: L("Members can add entries", "Les membres peuvent ajouter"), d: L("If off, only you (admin) post entries", "Sinon, seul l'admin publie") },
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

type TF = { label: string; type: FType; options?: string };
type Tmpl = { id: string; t: { en: string; fr: string }; icon: string; feats: Partial<Record<Feat, boolean>>; approval?: number; fields: TF[] };
const FEAT_BASE: Record<Feat, boolean> = { fields: false, member_entries: false, voting: false, ai: true, translation: true, comments: true, photos: false };
const TEMPLATES: Tmpl[] = [
  { id: "blank", t: L("Blank", "Vierge"), icon: "✎", feats: { fields: false, member_entries: true }, fields: [] },
  { id: "ledger", t: L("Financial ledger", "Registre financier"), icon: "₵", feats: { fields: true, member_entries: true, comments: true }, fields: [
    { label: "Date", type: "date" }, { label: "Description", type: "text" },
    { label: "Category", type: "select", options: "Income,Expense,Transfer" },
    { label: "Money in", type: "number" }, { label: "Money out", type: "number" }, { label: "Note", type: "longtext" } ] },
  { id: "expense", t: L("Expense approval", "Approbation de dépense"), icon: "🧾", feats: { fields: true, member_entries: true, voting: true, photos: true }, approval: 1, fields: [
    { label: "Date", type: "date" }, { label: "Vendor", type: "text" }, { label: "Amount", type: "number" },
    { label: "Category", type: "select", options: "Travel,Supplies,Meals,Software,Other" }, { label: "Receipt", type: "photo" }, { label: "Note", type: "longtext" } ] },
  { id: "invoice", t: L("Invoice / payment log", "Registre de paiements"), icon: "📒", feats: { fields: true, member_entries: true, voting: true }, approval: 1, fields: [
    { label: "Invoice #", type: "text" }, { label: "Client", type: "text" }, { label: "Amount", type: "number" },
    { label: "Due date", type: "date" }, { label: "Status", type: "select", options: "Draft,Sent,Paid,Overdue" }, { label: "Note", type: "longtext" } ] },
  { id: "motions", t: L("Board motions", "Motions du conseil"), icon: "⚖", feats: { fields: true, member_entries: true, voting: true }, approval: 2, fields: [
    { label: "Motion", type: "longtext" }, { label: "Mover", type: "text" }, { label: "Seconder", type: "text" } ] },
  { id: "minutes", t: L("Meeting minutes", "Procès-verbal"), icon: "🗒", feats: { fields: true, member_entries: true, comments: true }, fields: [
    { label: "Decision", type: "longtext" }, { label: "Owner", type: "text" }, { label: "Due", type: "date" } ] },
  { id: "inspection", t: L("Site inspection", "Inspection de site"), icon: "🛠", feats: { fields: true, member_entries: true, voting: true, photos: true }, approval: 1, fields: [
    { label: "Location", type: "text" }, { label: "Severity", type: "select", options: "Low,Medium,High" }, { label: "Finding", type: "longtext" }, { label: "Photo", type: "photo" } ] },
  { id: "hiring", t: L("Hiring scorecard", "Évaluation d'embauche"), icon: "👤", feats: { fields: true, member_entries: true, voting: true }, approval: 2, fields: [
    { label: "Candidate", type: "text" }, { label: "Role", type: "text" }, { label: "Rating", type: "select", options: "1,2,3,4,5" }, { label: "Strengths", type: "longtext" }, { label: "Concerns", type: "longtext" } ] },
  { id: "picks", t: L("Group picks / vote", "Choix du groupe"), icon: "🗳", feats: { fields: true, member_entries: true, voting: true }, approval: 3, fields: [
    { label: "Title", type: "text" }, { label: "Why", type: "longtext" } ] },
  { id: "event", t: L("Event planning", "Organisation d'événement"), icon: "📅", feats: { fields: true, member_entries: true, comments: true }, fields: [
    { label: "Task", type: "text" }, { label: "Owner", type: "text" }, { label: "Due", type: "date" }, { label: "Status", type: "select", options: "To do,Doing,Done" } ] },
];

export default function NewFormPage() {
  return <QuorlyAuthGate><NewFormInner /></QuorlyAuthGate>;
}

function NewFormInner() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { cf.canCreate().then(setAllowed).catch(() => setAllowed(false)); }, []);
  useEffect(() => { cf.myProfile().then((p) => { if (p?.name) setAdminName((n) => n || p.name!); }).catch(() => {}); }, []);
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [desc, setDesc] = useState("");
  const [feats, setFeats] = useState<Record<Feat, boolean>>({ fields: true, member_entries: false, voting: false, ai: true, translation: true, comments: true, photos: false });
  const [approval, setApproval] = useState(2);
  const [color, setColor] = useState(COLORS[0]);
  const [fields, setFields] = useState<FieldRow[]>([{ id: 1, label: "", type: "text", options: "" }]);
  const [invite, setInvite] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [ndaOn, setNdaOn] = useState(false);
  const NDA_DEFAULT = tr(L(
    "All information shared in this form — entries, comments, and attachments — is confidential. By joining, each member agrees not to disclose, copy, or share it with anyone outside this form without the admin's written consent.",
    "Toutes les informations partagées dans ce formulaire — entrées, commentaires et pièces jointes — sont confidentielles. En rejoignant, chaque membre s'engage à ne pas les divulguer, copier ou partager avec quiconque à l'extérieur de ce formulaire sans le consentement écrit de l'administrateur."));
  const [ndaText, setNdaText] = useState("");
  const [tmplId, setTmplId] = useState("blank");
  const applyTemplate = (t: Tmpl) => {
    setTmplId(t.id);
    setFeats({ ...FEAT_BASE, ...t.feats });
    setApproval(t.approval ?? 2);
    setFields(t.fields.length ? t.fields.map((f, i) => ({ id: i + 1, label: f.label, type: f.type, options: f.options ?? "" })) : [{ id: 1, label: "", type: "text", options: "" }]);
    setName((n) => n || tr(t.t));
  };

  const addField = () => setFields((f) => [...f, { id: Date.now(), label: "", type: "text", options: "" }]);
  const setField = (id: number, patch: Partial<FieldRow>) => setFields((f) => f.map((x) => x.id === id ? { ...x, ...patch } : x));
  const rmField = (id: number) => setFields((f) => f.filter((x) => x.id !== id));
  const addInvite = () => { const v = invite.trim(); if (v && !invited.includes(v)) { setInvited((a) => [...a, v]); setInvite(""); } };

  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim() || !adminName.trim() || busy) return;
    setBusy(true);
    try {
      const res = await cf.createForm({
        name: name.trim(), description: desc.trim(), features: feats, approval: feats.voting ? approval : 1, color, adminName: adminName.trim(),
        fields: feats.fields ? fields.filter((f) => f.label.trim()).map((f) => ({ label: f.label.trim(), type: f.type, options: f.type === "select" ? f.options.split(",").map((s) => s.trim()).filter(Boolean) : [] })) : [],
        invites: invited.map((c) => ({ contact: c })),
      });
      if (res?.ok) {
        if (ndaOn && (ndaText.trim() || NDA_DEFAULT)) { try { await cf.setNda(res.form_id, ndaText.trim() || NDA_DEFAULT); } catch { /* non-fatal */ } }
        const d = res.delivery;
        if (d && d.ok === false && (d.failed?.length || d.error)) alert(tr(L("Form created, but some invites couldn't be delivered: ", "Formulaire créé, mais certaines invitations n'ont pu être envoyées : ")) + (d.failed?.map((f: any) => `${f.contact} (${f.error})`).join("; ") || d.error));
        router.push("/forms");
      } else alert(res?.error || "Failed");
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  if (allowed === false) return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, display: "flex", alignItems: "flex-start", justifyContent: "center", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "60px auto 0", background: C.paper, borderRadius: 14, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{tr(L("Members can't create forms", "Les membres ne peuvent pas créer de formulaires"))}</div>
        <div style={{ fontSize: 13, color: C.ink2, marginTop: 8 }}>{tr(L("Only form creators can start a new form. You can take part in the forms you've been invited to.", "Seuls les créateurs peuvent démarrer un formulaire. Vous pouvez participer aux formulaires auxquels vous êtes invité."))}</div>
        <div onClick={() => router.push("/forms")} style={{ marginTop: 16, background: C.accent, color: "#fff", borderRadius: 10, padding: "11px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{tr(L("Back to forms", "Retour aux formulaires"))}</div>
      </div>
    </div>
  );

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
            <div style={lbl}>{tr(L("Start from a template", "Partir d'un modèle"))}</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, margin: "0 -2px" }}>
              {TEMPLATES.map((t) => (
                <div key={t.id} onClick={() => applyTemplate(t)} style={{ flex: "0 0 auto", cursor: "pointer", border: `1px solid ${tmplId === t.id ? C.accent : C.line}`, background: tmplId === t.id ? C.accentSoft : "#fff", borderRadius: 11, padding: "9px 12px", minWidth: 96, textAlign: "center" }}>
                  <div style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: tmplId === t.id ? C.accent : C.ink2, marginTop: 5 }}>{tr(t.t)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={lbl}>{tr(L("Your name", "Votre nom"))}</div>
            <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder={tr(L("How members will see you", "Comment les membres vous verront"))} style={inp} />
          </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 11, border: `1px solid ${C.line}`, borderRadius: 11, padding: 11, background: "#fff" }}>
              <div><div style={{ fontSize: 13, fontWeight: 800 }}>{tr(L("Non-disclosure clause", "Clause de confidentialité"))}</div><div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{tr(L("Members must accept it to join", "Les membres doivent l'accepter pour rejoindre"))}</div></div>
              <div onClick={() => setNdaOn((v) => !v)} style={{ marginLeft: "auto", width: 40, height: 23, borderRadius: 999, background: ndaOn ? C.accent : "#D9D3C8", position: "relative", cursor: "pointer" }}>
                <div style={{ position: "absolute", top: 2, width: 19, height: 19, borderRadius: "50%", background: "#fff", left: ndaOn ? 19 : 2, transition: "left .12s" }} />
              </div>
            </div>
            {ndaOn && <textarea value={ndaText || NDA_DEFAULT} onChange={(e) => setNdaText(e.target.value)} style={{ ...inp, minHeight: 90, marginTop: 8 }} />}
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

          <div onClick={create} style={{ background: name.trim() && adminName.trim() ? C.accent : "#C9C3B8", color: "#fff", borderRadius: 10, padding: 13, textAlign: "center", fontWeight: 800, fontSize: 14, cursor: name.trim() && adminName.trim() ? "pointer" : "default" }}>{tr(L("Create & invite", "Créer et inviter"))}</div>
        </div>
      </div>
    </div>
  );
}

const lbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, marginBottom: 8 };
const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 11px", fontSize: 14, background: "#fff", color: C.ink, outline: "none", width: "100%" };
const rnd: any = { width: 30, height: 30, borderRadius: 8, background: C.line2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: C.accent, cursor: "pointer" };
