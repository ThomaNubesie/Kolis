"use client";
// Quorly — the organization's customizable Home PAGE. Admin picks one of 10
// templates (cf_forms.home_template) and edits content blocks (home_content);
// members/visitors land here. Every template ends with an "Explore" hub linking
// to Departments · Town Hall · Members · Documents so Home is the org's front door.
import { useCallback, useEffect, useMemo, useState } from "react";
import { cf, type CfOrgTree, type CfOrgMember } from "@/lib/cf";
import { memberColors } from "@/lib/colors";
import { Users, Folder, MessageSquare, ChevronRight, Pencil, Plus, X, LayoutGrid, FileText, ImagePlus } from "lucide-react";
import Announcements from "./Announcements";

const C = { paper: "#F1EEE7", panel: "#FFFFFF", ink: "#14131A", ink2: "#4A4A46", faint: "#8a8790", line: "#ECE9E2", accent: "#2F3AA3", cream: "#FBF8F2" };
const L = (en: string, fr: string) => ({ en, fr });
type TR = (o: { en: string; fr: string }) => string;
const inp: any = { border: `1.5px solid #E3E0D8`, borderRadius: 9, padding: "8px 10px", fontSize: 13, background: "#fff", color: C.ink, outline: "none", fontFamily: "inherit", width: "100%" };
const initials = (n: string) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const badgeOf = (n: string) => (n.match(/\d{2,}/)?.[0]) || initials(n);
const av = (c: string | null, s: number): any => ({ width: s, height: s, borderRadius: "50%", background: c || C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: s * 0.4, flex: "0 0 auto" });

// One template, one cover photo, one key: /public/covers/<cover>.jpg (CC0 — see
// CREDITS.json). The swap gallery in the editor is generated from this same list,
// so the photos offered are always exactly the templates we ship.
const TEMPLATES: { id: string; nm: [string, string]; hero: "left" | "center" | "inline" | "editorial"; cover: string; blocks: string[] }[] = [
  { id: "1", nm: ["Community", "Communauté"], hero: "left", cover: "community", blocks: ["mission", "bureau", "announcements"] },
  { id: "2", nm: ["Civic / Board", "Civique"], hero: "inline", cover: "board", blocks: ["stats", "officers", "docs"] },
  { id: "3", nm: ["Club", "Club"], hero: "center", cover: "club", blocks: ["stats", "meeting", "mission"] },
  { id: "4", nm: ["Bulletin", "Babillard"], hero: "left", cover: "bulletin", blocks: ["pinned", "announcements"] },
  { id: "5", nm: ["Congregation", "Congrégation"], hero: "center", cover: "congregation", blocks: ["bureau", "meeting"] },
  { id: "6", nm: ["Syndicate", "Syndicat"], hero: "inline", cover: "syndicate", blocks: ["stats", "officers", "announcements"] },
  { id: "7", nm: ["Campus / PAC", "Comité d'école"], hero: "center", cover: "campus", blocks: ["mission", "announcements"] },
  { id: "8", nm: ["Union / Local", "Syndical"], hero: "left", cover: "union", blocks: ["bureau", "announcements", "meeting"] },
  { id: "9", nm: ["Cause", "Cause"], hero: "center", cover: "cause", blocks: ["stats", "mission"] },
  { id: "10", nm: ["Newsroom", "Salle de presse"], hero: "editorial", cover: "newsroom", blocks: ["pinned", "announcements"] },
];
const coverSrc = (k: string) => `/covers/${k}.jpg`;
// Same six solids a group picks from at sign-up (new-org). The header is this
// colour flat, or this colour gradiented over the cover photo.
const ORG_COLORS = ["#2F3AA3", "#1F9D6B", "#E4632A", "#8A4FD0", "#C99A1E", "#D14D8B"];

export default function OrgHomePage({ tree, tr, lang, mobile, onOpen, setTab, onChanged }: { tree: CfOrgTree; tr: TR; lang: "en" | "fr"; mobile: boolean; onOpen: (id: string) => void; setTab: (t: any) => void; onChanged: () => void }) {
  const color = tree.color || "#2F3AA3";
  const c: any = tree.home_content || {};
  // The header may run a solid of its own; the rest of the page keeps the org colour.
  const heroColor = c.cover_color || color;
  const tmplId = tree.home_template || "";
  const tmpl = TEMPLATES.find((t) => t.id === tmplId);
  const tv = (o: any, k: string) => (lang === "fr" && o?.[k + "_fr"]) ? o[k + "_fr"] : (o?.[k] ?? "");
  const [officers, setOfficers] = useState<CfOrgMember[]>([]);
  const [editing, setEditing] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  useEffect(() => { cf.orgMembers(tree.id).then((ms) => setOfficers(ms.filter((m) => m.title))).catch(() => {}); }, [tree.id]);
  // An uploaded cover is a private storage object, so it needs a signed URL; an
  // offered cover is just a static file. "none" = the org turned the photo off.
  useEffect(() => {
    let live = true;
    if (c.cover_path) { cf.fileUrl(c.cover_path).then((u) => live && setCoverUrl(u)).catch(() => live && setCoverUrl("")); return () => { live = false; }; }
    const k = c.cover || tmpl?.cover || "";
    setCoverUrl(!k || k === "none" ? "" : coverSrc(k));
    return () => { live = false; };
  }, [c.cover, c.cover_path, tmpl?.cover]);

  // No two faces in the bureau wear the same colour.
  const oc = useMemo(() => memberColors(officers.map((m) => ({ key: m.member_id, color: m.color }))), [officers]);
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
      return <div style={secStyle}><h3 style={h3}>{tr(L("The bureau", "Le bureau"))}</h3><div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 2 : 4},1fr)`, gap: 12 }}>{officers.slice(0, 8).map((m) => <div key={m.member_id} style={{ textAlign: "center" }}><div style={{ ...av(oc[m.member_id], 48), margin: "0 auto 6px" }}>{initials(m.name)}</div><div style={{ fontWeight: 800, fontSize: 12.5 }}>{m.name}</div><div style={{ fontSize: 11, color: C.faint }}>{m.title}</div></div>)}</div></div>;
    }
    if (k === "announcements") return null; // now a live dated feed rendered once below the hero
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
      <div style={{
        background: coverUrl
          ? `linear-gradient(135deg, ${heroColor}F0, ${heroColor}8C), url("${coverUrl}") center/cover no-repeat`
          : `linear-gradient(135deg, ${heroColor}, ${heroColor}), linear-gradient(#0002,#0004)`,
        backgroundBlendMode: coverUrl ? "normal" : "multiply",
        color: "#fff", borderRadius: 18, padding: coverUrl ? (mobile ? "30px 20px" : "38px 26px") : "26px 24px",
        textAlign: align === "center" ? "center" : "left",
      }}>
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
      {tmpl && <Announcements form={tree.id} tr={tr} lang={lang} welcome mobile={mobile} />}
      {tmpl && tmpl.blocks.map((k) => <Block key={k} k={k} />)}
      <Explore />
    </div>
  );
}

// ---------- Editor ----------
function Editor({ tree, tr, lang, onClose, onSaved }: { tree: CfOrgTree; tr: TR; lang: "en" | "fr"; onClose: () => void; onSaved: () => void }) {
  const c0: any = tree.home_content || {};
  const color = tree.color || "#2F3AA3";
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
  // "" = whatever the chosen template offers, "none" = no photo, else a COVERS key.
  const [cover, setCover] = useState<string>(c0.cover || "");
  const [coverColor, setCoverColor] = useState<string>(c0.cover_color || "");
  const tint = coverColor || color;
  const [coverPath, setCoverPath] = useState<string>(c0.cover_path || "");
  const [customUrl, setCustomUrl] = useState("");
  useEffect(() => { let live = true; if (coverPath) cf.fileUrl(coverPath).then((u) => live && setCustomUrl(u)).catch(() => live && setCustomUrl("")); else setCustomUrl(""); return () => { live = false; }; }, [coverPath]);
  const uploadCover = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { const p = await cf.uploadOrgCover(tree.id, f); setCoverPath(p); setCover(""); } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const set = (k: string, v: any) => setContent((p: any) => ({ ...p, [k]: v }));
  const save = async () => { setBusy(true); try { const r = await cf.orgSetHome(tree.id, tmpl, { ...content, cover, cover_color: coverColor || null, cover_path: coverPath || null }); if (r?.ok === false) alert(r.error); else onSaved(); } catch (e: any) { alert(e.message); } setBusy(false); };
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
          // Each tile is a miniature of its own hero — the photo under the same
          // brand tint the live header uses, so picking a template is picking a look.
          <div key={t.id} onClick={() => setTmpl(t.id)} style={{ border: `2px solid ${tmpl === t.id ? C.accent : C.line}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", background: `linear-gradient(135deg, ${tint}F0, ${tint}8C), url("${coverSrc(t.cover)}") center/cover no-repeat`, minHeight: 78, padding: "9px 10px", display: "flex", flexDirection: "column", justifyContent: "flex-end", color: "#fff" }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, color: tint, background: "#fff", borderRadius: 4, padding: "0 5px", display: "inline-block", alignSelf: "flex-start" }}>{t.id}</div>
            <div style={{ fontWeight: 800, fontSize: 12.5, marginTop: 4, textShadow: "0 1px 3px rgba(0,0,0,.45)" }}>{lang === "fr" ? t.nm[1] : t.nm[0]}</div>
          </div>
        ))}
      </div>

      <div style={lbl}>{tr(L("Cover colour", "Couleur de couverture"))}</div>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8 }}>{tr(L("The header colour — solid on its own, or gradiented over the photo you pick below.", "La couleur de l'en-tête — unie, ou en dégradé sur la photo choisie ci-dessous."))}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ORG_COLORS.map((hex) => (
          <span key={hex} onClick={() => setCoverColor(hex)} title={hex} style={{ width: 34, height: 34, borderRadius: 10, background: hex, cursor: "pointer", boxShadow: tint === hex ? `0 0 0 2px #fff inset, 0 0 0 2px ${hex}` : "none", border: `1px solid rgba(0,0,0,.08)` }} />
        ))}
      </div>

      <div style={lbl}>{tr(L("Cover photo", "Photo de couverture"))}</div>
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 8 }}>{tr(L("Every template comes with a photo. Choose another, keep the colour solid, or upload your own.", "Chaque modèle a une photo. Choisissez-en une autre, gardez la couleur unie, ou téléversez la vôtre."))}</div>
      {customUrl && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `2px solid ${!cover ? C.accent : C.line}` }}>
            <img src={customUrl} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
            <span onClick={() => { setCoverPath(""); setCustomUrl(""); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: 8, padding: "4px 8px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{tr(L("Remove", "Retirer"))}</span>
            <span style={{ position: "absolute", bottom: 8, left: 10, color: "#fff", fontSize: 11.5, fontWeight: 800, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>{tr(L("Your photo", "Votre photo"))}</span>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(104px,1fr))", gap: 8 }}>
        {/* Solid first, then the same colour gradiented over each template's photo. */}
        {[{ k: "none", nm: ["Solid colour", "Couleur unie"] as [string, string] },
          { k: "", nm: ["Template default", "Modèle par défaut"] as [string, string] },
          ...TEMPLATES.map((t) => ({ k: t.cover, nm: t.nm }))].map((o) => {
          const on = !coverPath && cover === o.k;
          const photo = o.k === "none" ? "" : coverSrc(o.k || TEMPLATES.find((t) => t.id === tmpl)?.cover || "community");
          return (
            <div key={o.k || "default"} onClick={() => { setCover(o.k); setCoverPath(""); }} style={{ borderRadius: 10, overflow: "hidden", cursor: "pointer", boxShadow: on ? `0 0 0 2px #fff inset, 0 0 0 2px ${C.accent}` : `0 0 0 1px ${C.line}` }}>
              <div style={{ height: 56, display: "flex", alignItems: "flex-end", padding: "6px 8px", background: photo ? `linear-gradient(135deg, ${tint}F0, ${tint}8C), url("${photo}") center/cover no-repeat` : tint }}>
                <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 800, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{lang === "fr" ? o.nm[1] : o.nm[0]}</span>
              </div>
            </div>
          );
        })}
        <label style={{ border: `2px dashed ${C.line}`, borderRadius: 10, cursor: "pointer", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 78, color: C.accent }}>
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { uploadCover(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          <ImagePlus size={17} />
          <span style={{ fontSize: 11.5, fontWeight: 800, textAlign: "center", padding: "0 6px" }}>{busy ? "…" : tr(L("Upload yours", "Téléverser"))}</span>
        </label>
      </div>
      <div style={lbl}>{tr(L("Tagline", "Accroche"))}</div>{row(content, "tagline", tr(L("Tagline", "Accroche")))}
      <div style={lbl}>{tr(L("About / mission", "À propos / mission"))}</div>
      <div style={{ display: "flex", gap: 7 }}><textarea value={content.mission} onChange={(e) => set("mission", e.target.value)} placeholder="About (EN)" style={{ ...inp, minHeight: 54 }} /><textarea value={content.mission_fr} onChange={(e) => set("mission_fr", e.target.value)} placeholder="À propos (FR)" style={{ ...inp, minHeight: 54 }} /></div>
      <div style={lbl}>{tr(L("Pinned message", "Message épinglé"))}</div>{row(content.pinned, "text", tr(L("Pinned", "Épinglé")))}
      <div style={lbl}>{tr(L("Meeting — when / where", "Réunion — quand / où"))}</div>{row(content.meeting, "when", tr(L("When", "Quand")))}{row(content.meeting, "where", tr(L("Where", "Où")))}
      <div style={lbl}>{tr(L("Announcements", "Annonces"))}</div>
      <div style={{ fontSize: 12, color: C.faint }}>{tr(L("Announcements are now live dated posts. Add or delete them, with deadlines, right on the Home page.", "Les annonces sont maintenant des publications datées. Ajoutez ou supprimez-les, avec échéances, sur la page d'accueil."))}</div>
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
