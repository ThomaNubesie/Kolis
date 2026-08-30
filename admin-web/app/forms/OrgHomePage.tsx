"use client";
// Quorly — the organization's customizable Home PAGE. Admin picks one of 10
// templates (cf_forms.home_template) and edits content blocks (home_content);
// members/visitors land here. Every template ends with an "Explore" hub linking
// to Departments · Town Hall · Members · Documents so Home is the org's front door.
import { useCallback, useEffect, useState } from "react";
import { cf, type CfOrgTree, type CfOrgMember } from "@/lib/cf";
import { Users, Folder, MessageSquare, ChevronRight, Pencil, Plus, X, LayoutGrid, FileText } from "lucide-react";

const C = { paper: "#F1EEE7", panel: "#FFFFFF", ink: "#14131A", ink2: "#4A4A46", faint: "#8a8790", line: "#ECE9E2", accent: "#2F3AA3", cream: "#FBF8F2" };
const L = (en: string, fr: string) => ({ en, fr });
type TR = (o: { en: string; fr: string }) => string;
const inp: any = { border: `1.5px solid #E3E0D8`, borderRadius: 9, padding: "8px 10px", fontSize: 13, background: "#fff", color: C.ink, outline: "none", fontFamily: "inherit", width: "100%" };
const initials = (n: string) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const badgeOf = (n: string) => (n.match(/\d{2,}/)?.[0]) || initials(n);
const av = (c: string | null, s: number): any => ({ width: s, height: s, borderRadius: "50%", background: c || C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: s * 0.4, flex: "0 0 auto" });

const TEMPLATES: { id: string; nm: [string, string]; hero: "left" | "center" | "inline" | "editorial"; blocks: string[] }[] = [
  { id: "1", nm: ["Community", "Communauté"], hero: "left", blocks: ["mission", "bureau", "announcements"] },
  { id: "2", nm: ["Civic / Board", "Civique"], hero: "inline", blocks: ["stats", "officers", "docs"] },
  { id: "3", nm: ["Club", "Club"], hero: "center", blocks: ["stats", "meeting", "mission"] },
  { id: "4", nm: ["Bulletin", "Babillard"], hero: "left", blocks: ["pinned", "announcements"] },
  { id: "5", nm: ["Congregation", "Congrégation"], hero: "center", blocks: ["bureau", "meeting"] },
  { id: "6", nm: ["Syndicate", "Syndicat"], hero: "inline", blocks: ["stats", "officers", "announcements"] },
  { id: "7", nm: ["Campus / PAC", "Comité d'école"], hero: "center", blocks: ["mission", "announcements"] },
  { id: "8", nm: ["Union / Local", "Syndical"], hero: "left", blocks: ["bureau", "announcements", "meeting"] },
  { id: "9", nm: ["Cause", "Cause"], hero: "center", blocks: ["stats", "mission"] },
  { id: "10", nm: ["Newsroom", "Salle de presse"], hero: "editorial", blocks: ["pinned", "announcements"] },
];

export default function OrgHomePage({ tree, tr, lang, mobile, onOpen, setTab, onChanged }: { tree: CfOrgTree; tr: TR; lang: "en" | "fr"; mobile: boolean; onOpen: (id: string) => void; setTab: (t: any) => void; onChanged: () => void }) {
  const color = tree.color || "#2F3AA3";
  const c: any = tree.home_content || {};
  const tmplId = tree.home_template || "";
  const tmpl = TEMPLATES.find((t) => t.id === tmplId);
  const tv = (o: any, k: string) => (lang === "fr" && o?.[k + "_fr"]) ? o[k + "_fr"] : (o?.[k] ?? "");
  const [officers, setOfficers] = useState<CfOrgMember[]>([]);
  const [editing, setEditing] = useState(false);
  useEffect(() => { cf.orgMembers(tree.id).then((ms) => setOfficers(ms.filter((m) => m.title))).catch(() => {}); }, [tree.id]);

  const anns: any[] = Array.isArray(c.announcements) ? c.announcements : [];
  const stats: any[] = Array.isArray(c.stats) ? c.stats : [];
  const docs: any[] = Array.isArray(c.docs) ? c.docs : [];
  const h3: any = { fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".06em", color: C.faint, fontWeight: 800, marginBottom: 11 };
  const secStyle: any = { padding: "18px 0", borderTop: `1px solid ${C.line}` };

  const Block = ({ k }: { k: string }) => {
    if (k === "mission" && tv(c, "mission")) return <div style={secStyle}><h3 style={h3}>{tr(L("About", "À propos"))}</h3><p style={{ fontSize: 14.5, color: C.ink2, whiteSpace: "pre-wrap" }}>{tv(c, "mission")}</p></div>;
    if (k === "pinned" && tv(c.pinned || {}, "text")) return <div style={secStyle}><h3 style={h3}>📌 {tr(L("Pinned", "Épinglé"))}</h3><div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800 }}>{tv(c.pinned, "text")}</div></div>;
    if ((k === "bureau" || k === "officers") && officers.length > 0) {
      if (k === "officers") return <div style={secStyle}><h3 style={h3}>{tr(L("Officers", "Dirigeants"))}</h3>{officers.map((m) => <div key={m.member_id} style={{ display: "flex", gap: 8, padding: "8px 0", borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}><b>{m.name}</b> — <span style={{ color: C.ink2 }}>{m.title}</span></div>)}</div>;
      return <div style={secStyle}><h3 style={h3}>{tr(L("The bureau", "Le bureau"))}</h3><div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 12 }}>{officers.slice(0, 8).map((m) => <div key={m.member_id} style={{ textAlign: "center" }}><div style={{ ...av(m.color, 48), margin: "0 auto 6px" }}>{initials(m.name)}</div><div style={{ fontWeight: 800, fontSize: 12.5 }}>{m.name}</div><div style={{ fontSize: 11, color: C.faint }}>{m.title}</div></div>)}</div></div>;
    }
    if (k === "announcements" && anns.length > 0) return <div style={secStyle}><h3 style={h3}>{tr(L("Announcements", "Annonces"))}</h3>{anns.map((a, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: i ? `1px solid ${C.line}` : 0 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: color, marginTop: 5, flex: "none" }} /><div style={{ fontSize: 13.5 }}>{a.date ? <b>{a.date} — </b> : null}{tv(a, "text")}</div></div>)}</div>;
    if (k === "meeting" && (tv(c.meeting || {}, "when") || tv(c.meeting || {}, "where"))) return <div style={secStyle}><h3 style={h3}>📅 {tr(L("Meetings", "Réunions"))}</h3><div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 13 }}><div style={{ fontWeight: 800, fontSize: 14.5 }}>{tv(c.meeting, "when")}</div><div style={{ fontSize: 12.5, color: C.faint, marginTop: 3 }}>{tv(c.meeting, "where")}</div></div></div>;
    if (k === "stats" && stats.length > 0) return <div style={secStyle}><div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : Math.min(4, stats.length)},1fr)`, gap: 11 }}>{stats.map((s, i) => <div key={i} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, padding: 13, textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 900, color }}>{s.n}</div><div style={{ fontSize: 11, color: C.faint }}>{tv(s, "label")}</div></div>)}</div></div>;
    if (k === "docs" && docs.length > 0) return <div style={secStyle}><h3 style={h3}>{tr(L("Documents", "Documents"))}</h3>{docs.map((d, i) => <div key={i} style={{ display: "flex", gap: 9, padding: "8px 0", borderTop: i ? `1px solid ${C.line}` : 0, fontSize: 13.5 }}>📄 {tv(d, "label")}</div>)}</div>;
    return null;
  };

  const Hero = () => {
    const badge = badgeOf(tree.name);
    const align = tmpl?.hero || "left";
    const logo = <div style={{ width: 56, height: 56, borderRadius: 15, background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 22, ...(align === "center" ? { margin: "0 auto" } : {}) }}>{badge}</div>;
    const cta = (
      <div style={{ display: "flex", gap: 10, marginTop: 15, flexWrap: "wrap", ...(align === "center" ? { justifyContent: "center" } : {}) }}>
        <span onClick={() => setTab("townhall")} style={{ background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.4)", color: "#fff", fontWeight: 800, fontSize: 13, padding: "9px 15px", borderRadius: 10, cursor: "pointer" }}>{tr(L("Town Hall", "Assemblée"))}</span>
      </div>
    );
    return (
      <div style={{ background: `linear-gradient(135deg, ${color}, ${color}), linear-gradient(#0002,#0004)`, backgroundBlendMode: "multiply", color: "#fff", borderRadius: 18, padding: "26px 24px", textAlign: align === "center" ? "center" : "left" }}>
        {align === "editorial" && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", opacity: .75 }}>{tr(L("Digest", "Bulletin"))}</div>}
        {align === "inline" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>{logo}<div><div style={{ fontSize: 26, fontWeight: 800 }}>{tree.name}</div>{(tree.legal_name || tree.org_type) && <div style={{ opacity: .85, fontSize: 13 }}>{tree.legal_name || tree.org_type}</div>}</div></div>
        ) : (
          <>{align !== "editorial" && logo}<div style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>{tree.name}</div></>
        )}
        {tv(c, "tagline") && <div style={{ opacity: .92, fontSize: 14.5, marginTop: 6, maxWidth: "38em", ...(align === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}) }}>{tv(c, "tagline")}</div>}
        {align !== "inline" && cta}
      </div>
    );
  };

  const Explore = () => (
    <div style={{ ...secStyle, marginTop: 6 }}>
      <h3 style={h3}>{tr(L("Explore", "Explorer"))}</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: (tree.departments?.length ?? 0) ? 12 : 0 }}>
        {[["townhall", tr(L("Town Hall", "Assemblée")), <MessageSquare key="t" size={15} />], ["members", tr(L("Members", "Membres")), <Users key="m" size={15} />], ["documents", tr(L("Documents", "Documents")), <Folder key="d" size={15} />]].map(([k, label, icon]: any) => (
          <span key={k} onClick={() => setTab(k)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 11, padding: "9px 13px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}><span style={{ color: C.accent, display: "inline-flex" }}>{icon}</span>{label}</span>
        ))}
      </div>
      {(tree.departments?.length ?? 0) > 0 && <>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.faint, margin: "0 0 6px" }}>{tr(L("Departments & forms", "Départements & formulaires"))}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tree.departments.map((d) => (
            <div key={d.id} onClick={() => d.im_member || d.kind === "election" ? onOpen(d.id) : null} style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 11, padding: "10px 12px", cursor: "pointer", opacity: d.im_member || d.kind === "election" ? 1 : .6 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "#EEEBFA", color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{d.kind === "election" ? "🗳️" : <FileText size={15} />}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div><div style={{ fontSize: 11, color: C.faint }}>{d.members} {tr(L("members", "membres"))} · {d.entries} {tr(L("entries", "entrées"))}</div></div>
              <ChevronRight size={16} style={{ color: C.faint }} />
            </div>
          ))}
        </div>
      </>}
    </div>
  );

  if (editing) return <Editor tree={tree} tr={tr} lang={lang} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;

  return (
    <div>
      {tree.is_admin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <span onClick={() => setEditing(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}><Pencil size={13} /> {tmpl ? tr(L("Edit home page", "Modifier l'accueil")) : tr(L("Set up home page", "Configurer l'accueil"))}</span>
        </div>
      )}
      {!tmpl && !tree.is_admin && <div style={{ color: C.faint, fontSize: 13, marginBottom: 12 }}>{tree.name}</div>}
      {tmpl && <Hero />}
      {tmpl && tmpl.blocks.map((k) => <Block key={k} k={k} />)}
      <Explore />
    </div>
  );
}

// ---------- Editor ----------
function Editor({ tree, tr, lang, onClose, onSaved }: { tree: CfOrgTree; tr: TR; lang: "en" | "fr"; onClose: () => void; onSaved: () => void }) {
  const c0: any = tree.home_content || {};
  const [tmpl, setTmpl] = useState(tree.home_template || "1");
  const [content, setContent] = useState<any>({
    tagline: c0.tagline || "", tagline_fr: c0.tagline_fr || "",
    mission: c0.mission || "", mission_fr: c0.mission_fr || "",
    pinned: c0.pinned || { text: "", text_fr: "" },
    meeting: c0.meeting || { when: "", when_fr: "", where: "", where_fr: "" },
    announcements: Array.isArray(c0.announcements) ? c0.announcements : [],
    stats: Array.isArray(c0.stats) ? c0.stats : [],
    docs: Array.isArray(c0.docs) ? c0.docs : [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setContent((p: any) => ({ ...p, [k]: v }));
  const save = async () => { setBusy(true); try { const r = await cf.orgSetHome(tree.id, tmpl, content); if (r?.ok === false) alert(r.error); else onSaved(); } catch (e: any) { alert(e.message); } setBusy(false); };
  const lbl: any = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: C.faint, margin: "14px 0 5px" };
  const row = (o: any, k: string, ph: string) => (
    <div style={{ display: "flex", gap: 7, marginBottom: 6 }}>
      <input value={o[k] || ""} onChange={(e) => { o[k] = e.target.value; setContent({ ...content }); }} placeholder={`${ph} (EN)`} style={inp} />
      <input value={o[k + "_fr"] || ""} onChange={(e) => { o[k + "_fr"] = e.target.value; setContent({ ...content }); }} placeholder={`${ph} (FR)`} style={inp} />
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{tr(L("Home page", "Page d'accueil"))}</div>
        <span onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", color: C.faint, display: "flex" }}><X size={18} /></span>
      </div>
      <div style={lbl}>{tr(L("Template", "Modèle"))}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
        {TEMPLATES.map((t) => (
          <div key={t.id} onClick={() => setTmpl(t.id)} style={{ border: `2px solid ${tmpl === t.id ? C.accent : C.line}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer", background: tmpl === t.id ? "#EEEBFA" : "#fff" }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, color: "#fff", background: C.accent, borderRadius: 4, padding: "0 5px", display: "inline-block" }}>{t.id}</div>
            <div style={{ fontWeight: 800, fontSize: 12.5, marginTop: 4 }}>{lang === "fr" ? t.nm[1] : t.nm[0]}</div>
          </div>
        ))}
      </div>
      <div style={lbl}>{tr(L("Tagline", "Accroche"))}</div>{row(content, "tagline", tr(L("Tagline", "Accroche")))}
      <div style={lbl}>{tr(L("About / mission", "À propos / mission"))}</div>
      <div style={{ display: "flex", gap: 7 }}><textarea value={content.mission} onChange={(e) => set("mission", e.target.value)} placeholder="About (EN)" style={{ ...inp, minHeight: 54 }} /><textarea value={content.mission_fr} onChange={(e) => set("mission_fr", e.target.value)} placeholder="À propos (FR)" style={{ ...inp, minHeight: 54 }} /></div>
      <div style={lbl}>{tr(L("Pinned message", "Message épinglé"))}</div>{row(content.pinned, "text", tr(L("Pinned", "Épinglé")))}
      <div style={lbl}>{tr(L("Meeting — when / where", "Réunion — quand / où"))}</div>{row(content.meeting, "when", tr(L("When", "Quand")))}{row(content.meeting, "where", tr(L("Where", "Où")))}
      <div style={lbl}>{tr(L("Announcements", "Annonces"))}</div>
      {content.announcements.map((a: any, i: number) => (
        <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 6 }}><input value={a.date || ""} onChange={(e) => { a.date = e.target.value; setContent({ ...content }); }} placeholder={tr(L("Date", "Date"))} style={{ ...inp, maxWidth: 110 }} /><span onClick={() => set("announcements", content.announcements.filter((_: any, j: number) => j !== i))} style={{ marginLeft: "auto", cursor: "pointer", color: C.faint, display: "flex", alignItems: "center" }}><X size={16} /></span></div>
          {row(a, "text", tr(L("Announcement", "Annonce")))}
        </div>
      ))}
      <span onClick={() => set("announcements", [...content.announcements, { date: "", text: "", text_fr: "" }])} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer", marginTop: 2 }}><Plus size={14} /> {tr(L("Add announcement", "Ajouter une annonce"))}</span>
      <div style={lbl}>{tr(L("Stats (number + label)", "Statistiques (nombre + libellé)"))}</div>
      {content.stats.map((s: any, i: number) => (
        <div key={i} style={{ display: "flex", gap: 7, marginBottom: 6, alignItems: "center" }}>
          <input value={s.n || ""} onChange={(e) => { s.n = e.target.value; setContent({ ...content }); }} placeholder="58" style={{ ...inp, maxWidth: 80 }} />
          <input value={s.label || ""} onChange={(e) => { s.label = e.target.value; setContent({ ...content }); }} placeholder="Members" style={inp} />
          <input value={s.label_fr || ""} onChange={(e) => { s.label_fr = e.target.value; setContent({ ...content }); }} placeholder="Membres" style={inp} />
          <span onClick={() => set("stats", content.stats.filter((_: any, j: number) => j !== i))} style={{ cursor: "pointer", color: C.faint, display: "flex" }}><X size={16} /></span>
        </div>
      ))}
      <span onClick={() => set("stats", [...content.stats, { n: "", label: "", label_fr: "" }])} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}><Plus size={14} /> {tr(L("Add stat", "Ajouter une stat"))}</span>
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <span onClick={onClose} style={{ flex: 1, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 9, padding: 11, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</span>
        <span onClick={busy ? undefined : save} style={{ flex: 2, textAlign: "center", background: C.accent, color: "#fff", borderRadius: 9, padding: 11, fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : tr(L("Save home page", "Enregistrer"))}</span>
      </div>
    </div>
  );
}
