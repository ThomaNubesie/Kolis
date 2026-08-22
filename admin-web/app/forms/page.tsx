"use client";
// Collaborative Forms — UI shell (mock data). Three-pane: forms sidebar · entry
// feed · members rail. Admin-selected features (voting, AI writing, translation,
// photos), colour-coded members, numbered/timed structured entries + comments.
// Self-contained + bilingual for review; wires to Supabase (cf_* RPCs) next.
import { useMemo, useState } from "react";

/* ---------- palette (curated member colours) ---------- */
const COLORS = ["#3B6FE0", "#E4632A", "#1F9D6B", "#8A4FD0", "#C99A1E", "#D14D8B", "#2AA6B8", "#7A8340"];
const C = {
  paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A",
  line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B",
};

/* ---------- mock data ---------- */
type Field = { key: string; label: { en: string; fr: string }; type: "text" | "longtext" | "select" | "number" | "date" | "photo"; options?: string[] };
type Comment = { id: string; author: string; body: string; at: string };
type Entry = { id: string; seq: number; author: string; at: string; values: Record<string, string>; status?: "pending" | "approved" | "rejected"; approvals?: string[]; comments: Comment[] };
type Member = { id: string; name: string; contact: string; color: string; admin?: boolean };
type Form = {
  id: string; name: { en: string; fr: string }; members: Member[];
  features: { voting: boolean; ai: boolean; translation: boolean; comments: boolean; photos: boolean };
  approvalCount: number; fields: Field[]; entries: Entry[];
};

const MEMBERS: Member[] = [
  { id: "u1", name: "Derick S.", contact: "derick@site.co", color: COLORS[0], admin: true },
  { id: "u2", name: "Ama M.", contact: "+1 613 555 0142", color: COLORS[1] },
  { id: "u3", name: "Sam R.", contact: "sam@crew.co", color: COLORS[2] },
  { id: "u4", name: "Marie D.", contact: "+1 514 555 0199", color: COLORS[3] },
];
const FORM: Form = {
  id: "f1", name: { en: "Site Inspection — Bldg A", fr: "Inspection — Bât. A" }, members: MEMBERS,
  features: { voting: true, ai: true, translation: true, comments: true, photos: true },
  approvalCount: 3,
  fields: [
    { key: "title", label: { en: "Title", fr: "Titre" }, type: "text" },
    { key: "status", label: { en: "Status", fr: "Statut" }, type: "select", options: ["Open", "Resolved"] },
    { key: "location", label: { en: "Location", fr: "Emplacement" }, type: "text" },
    { key: "details", label: { en: "Details", fr: "Détails" }, type: "longtext" },
  ],
  entries: [
    { id: "e1", seq: 1, author: "u1", at: "Aug 24, 2026 · 9:02 AM", values: { title: "East foundation forms set", status: "Resolved", location: "East elevation, grid C–E", details: "Forms braced and squared; ready for tomorrow's pour." }, comments: [ { id: "c1", author: "u2", body: "Rebar spacing verified with the inspector.", at: "9:15 AM" }, { id: "c2", author: "u3", body: "Concrete booked for 7 AM.", at: "9:40 AM" } ] },
    { id: "e2", seq: 2, author: "u2", at: "Aug 24, 2026 · 10:20 AM", values: { title: "Steel beam delivery delayed", status: "Open", location: "Level 2", details: "Supplier confirms Thursday. Crane schedule to adjust." }, status: "pending", approvals: ["u1", "u3"], comments: [ { id: "c3", author: "u4", body: "Noted — I'll move the crane.", at: "10:31 AM" } ] },
  ],
};

const T = {
  forms: { en: "Your forms", fr: "Vos formulaires" }, newForm: { en: "+ New form", fr: "+ Nouveau formulaire" },
  members: { en: "Members", fr: "Membres" }, addMember: { en: "Add member", fr: "Ajouter un membre" },
  contact: { en: "Email or phone number", fr: "Courriel ou téléphone" }, invite: { en: "Send invite", fr: "Envoyer l'invitation" },
  newEntry: { en: "New entry", fr: "Nouvelle entrée" }, approve: { en: "Approve", fr: "Approuver" }, reject: { en: "Reject", fr: "Rejeter" },
  pending: { en: "Pending approval", fr: "En attente d'approbation" }, approved: { en: "Approved", fr: "Approuvé" },
  comment: { en: "Write a comment…", fr: "Écrire un commentaire…" }, translate: { en: "Translate", fr: "Traduire" },
  admin: { en: "ADMIN", fr: "ADMIN" },
};

export default function FormsPage() {
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [form, setForm] = useState<Form>(FORM);
  const nameOf = (id: string) => form.members.find((m) => m.id === id);

  function vote(entryId: string) {
    setForm((f) => ({ ...f, entries: f.entries.map((e) => {
      if (e.id !== entryId) return e;
      const approvals = Array.from(new Set([...(e.approvals ?? []), "u1"]));
      const status = approvals.length >= f.approvalCount ? "approved" as const : "pending" as const;
      return { ...e, approvals, status };
    }) }));
  }

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "230px 1fr 250px", minHeight: 660, background: C.paper, borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>

        {/* sidebar */}
        <aside style={{ background: "#F4F1EB", borderRight: `1px solid ${C.line}`, padding: "18px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 6px 16px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>L</div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Ledger</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, padding: "10px 6px 4px" }}>{tr(T.forms)}</div>
          <div style={sItem(true)}><span style={sDot(COLORS[0])} />{tr(form.name)}</div>
          <div style={sItem(false)}><span style={sDot(COLORS[2])} />Weekly Safety Log</div>
          <div style={{ marginTop: "auto", border: `1px dashed ${C.line}`, borderRadius: 9, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>{tr(T.newForm)}</div>
        </aside>

        {/* main */}
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: `1px solid ${C.line}` }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -.3 }}>{tr(form.name)}</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{form.members.length} {tr(T.members).toLowerCase()} · Admin: Derick S.</div>
            </div>
            <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
              {(["en", "fr"] as const).map((l) => (
                <span key={l} onClick={() => setLang(l)} style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>
              ))}
            </div>
          </div>

          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
            {form.entries.map((e) => <EntryCard key={e.id} e={e} form={form} lang={lang} tr={tr} nameOf={nameOf} onVote={vote} />)}
          </div>
        </section>

        {/* members rail */}
        <aside style={{ background: "#F7F4EE", borderLeft: `1px solid ${C.line}`, padding: "18px 16px" }}>
          <div style={railLbl}>{tr(T.members)} · {form.members.length}</div>
          {form.members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 4px" }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: m.color }} />
              <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 10, color: C.faint }}>{m.contact}</div></div>
              {m.admin && <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, letterSpacing: .5, color: C.accent, background: C.accentSoft, padding: "2px 7px", borderRadius: 9 }}>{tr(T.admin)}</span>}
            </div>
          ))}
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            <div style={{ ...railLbl, margin: "0 2px 2px" }}>{tr(T.addMember)}</div>
            <div style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "9px 11px", fontSize: 12, color: C.faint, marginTop: 8 }}>{tr(T.contact)}</div>
            <div style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 800, marginTop: 8, cursor: "pointer" }}>{tr(T.invite)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EntryCard({ e, form, lang, tr, nameOf, onVote }: any) {
  const author = nameOf(e.author);
  const [showT, setShowT] = useState(false);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ height: 3, background: author?.color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px 6px" }}>
        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, fontWeight: 700, color: C.faint, background: C.line2, padding: "2px 7px", borderRadius: 5 }}>No. {String(e.seq).padStart(3, "0")}</span>
        <span style={chip(author?.color)}>{initials(author?.name)}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{author?.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{e.at}</span>
      </div>
      <div style={{ padding: "4px 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px" }}>
        {form.fields.map((f: Field) => (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: f.type === "longtext" ? "1 / -1" : "auto" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .6, textTransform: "uppercase", color: C.faint }}>{tr(f.label)}</span>
            {f.key === "status"
              ? <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: e.values[f.key] === "Resolved" ? "#E7F3EC" : "#FBEEE7", color: e.values[f.key] === "Resolved" ? "#1F7A4D" : "#B4531F" }}>{e.values[f.key]}</span>
              : <span style={{ fontSize: 13, color: C.ink, fontWeight: f.type === "longtext" ? 500 : 600 }}>{e.values[f.key]}</span>}
          </div>
        ))}
      </div>

      {form.features.translation && (
        <div style={{ padding: "0 16px 12px" }}>
          <span onClick={() => setShowT((v: boolean) => !v)} style={{ fontSize: 11, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{tr(T.translate)} ▾</span>
          {showT && <div style={{ borderLeft: `3px solid ${C.accent}`, background: C.accentSoft, borderRadius: "0 8px 8px 0", padding: "9px 11px", fontSize: 12.5, marginTop: 8 }}><b style={{ fontSize: 10, color: C.accent, display: "block", marginBottom: 3 }}>TRANSLATED · {lang.toUpperCase()}</b>{e.values.details}</div>}
        </div>
      )}

      {form.features.voting && e.status && (
        <div style={{ borderTop: `1px solid ${C.line2}`, background: "#FCFBF8", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          {e.status === "approved"
            ? <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#E7F3EC", color: "#1F7A4D" }}>{tr(T.approved)} · {e.approvals?.length}/{form.approvalCount}</span>
            : <>
                <span onClick={() => onVote(e.id)} style={{ background: C.green, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✓ {tr(T.approve)}</span>
                <span style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{tr(T.reject)}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.ink2, fontWeight: 700 }}>{e.approvals?.length ?? 0} / {form.approvalCount}</span>
              </>}
        </div>
      )}

      {form.features.comments && (
        <div style={{ borderTop: `1px solid ${C.line2}`, background: "#FCFBF8", padding: "11px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {e.comments.map((c: Comment) => { const a = nameOf(c.author); return (
            <div key={c.id} style={{ display: "flex", gap: 9 }}>
              <span style={chip(a?.color)}>{initials(a?.name)}</span>
              <div><span style={{ fontSize: 11.5, fontWeight: 800, color: a?.color }}>{a?.name}</span><span style={{ fontSize: 9.5, color: C.faint, marginLeft: 7, fontWeight: 600 }}>{c.at}</span><div style={{ fontSize: 12, color: C.ink2, marginTop: 2 }}>{c.body}</div></div>
            </div>
          ); })}
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "8px 11px", fontSize: 12, color: C.faint }}>
            <span style={chip(nameOf("u1")?.color)}>DS</span>{tr(T.comment)}
            {form.features.ai && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: C.accent }}>✦ AI</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const sItem = (on: boolean): any => ({ padding: "9px 10px", borderRadius: 8, fontSize: 13, color: on ? C.ink : C.ink2, fontWeight: on ? 700 : 400, display: "flex", alignItems: "center", gap: 8, background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 2px rgba(0,0,0,.04)" : "none", cursor: "pointer" });
const sDot = (c: string): any => ({ width: 7, height: 7, borderRadius: "50%", background: c });
const railLbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, margin: "6px 2px 8px" };
const chip = (c?: string): any => ({ width: 20, height: 20, borderRadius: 6, background: c ?? "#999", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800, flex: "0 0 20px" });
function initials(name?: string) { if (!name) return "?"; const p = name.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase(); }
