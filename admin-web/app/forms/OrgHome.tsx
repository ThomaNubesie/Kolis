"use client";
// Quorly — the organization's own screen.
//
// Selecting an organization in the rail lands here rather than in a folder list:
// what the group has (its departments), who is in it (the roster, and which
// office each of them holds), and what it is called (settings).
//
// "Office" here means the POST a person holds — President, Trésorier — not a
// container. The containers are departments.
import { useCallback, useEffect, useState } from "react";
import { cf, planLimitMsg, type CfOrgTree, type CfOrgMember, type CfDept } from "@/lib/cf";
import { QUICK_ADD, deptPayload } from "@/lib/presets";
import {
  NotebookPen, Gavel, Vote, Wallet, Receipt, FolderOpen, Users, CalendarDays,
  ChevronRight, X, Check, Mail, Shield,
} from "lucide-react";

const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const ORG_COLORS = ["#2F3AA3", "#1F9D6B", "#E4632A", "#8A4FD0", "#C99A1E", "#D14D8B"];
const ICONS: Record<string, any> = { NotebookPen, Gavel, Vote, Wallet, Receipt, FolderOpen, Users, CalendarDays };
const L = (en: string, fr: string) => ({ en, fr });
type TR = (o: { en: string; fr: string }) => string;

const deptIcon = (d: CfDept) => (d.kind === "election" ? Vote : (d.features as any)?.fields ? NotebookPen : FolderOpen);

export default function OrgHome({ tree, tab, setTab, tr, lang, mobile, onOpen, onChanged }: {
  tree: CfOrgTree | null;
  tab: "home" | "members" | "settings";
  setTab: (t: "home" | "members" | "settings") => void;
  tr: TR; lang: "en" | "fr"; mobile: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  if (!tree) return <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("Loading…", "Chargement…"))}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {tab === "home" && <HomeTab tree={tree} tr={tr} mobile={mobile} onOpen={onOpen} onChanged={onChanged} lang={lang} />}
      {tab === "members" && <MembersTab tree={tree} tr={tr} lang={lang} mobile={mobile} onChanged={onChanged} />}
      {tab === "settings" && <SettingsTab tree={tree} tr={tr} onChanged={onChanged} />}
    </div>
  );
}

/* ============================== HOME ==================================== */
function HomeTab({ tree, tr, mobile, onOpen, onChanged, lang }: { tree: CfOrgTree; tr: TR; mobile: boolean; onOpen: (id: string) => void; onChanged: () => void; lang: "en" | "fr" }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const add = async (id: string) => {
    const d = QUICK_ADD.find((x) => x.id === id);
    if (!d || busy) return;
    setBusy(id); setErr("");
    try {
      const payload = deptPayload(d, d.name[lang]);
      const r: any = await cf.createDepartment(tree.id, payload as any);
      if (r?.ok === false) { const pm = planLimitMsg(r, lang); if (pm && confirm(pm)) window.open("/pricing", "_blank"); setErr(pm || r.error || "Failed"); setBusy(null); return; }
      onChanged();
      onOpen(r.department_id);
    } catch (e: any) { setErr(e.message || "Failed"); }
    setBusy(null);
  };

  const empty = tree.departments.length === 0;
  return (
    <>
      {/* identity strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px" }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, background: tree.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 21, flex: "0 0 auto" }}>
          {(tree.name || "?").trim()[0]?.toUpperCase()}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tree.name}</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            {tree.legal_name ? tree.legal_name + " · " : ""}
            {tree.members} {tr(L("members", "membres"))}
            {tree.invited ? ` · ${tree.invited} ${tr(L("invited", "invités"))}` : ""}
            {` · ${tree.departments.length} ${tr(L("departments", "départements"))}`}
          </div>
        </div>
        {tree.slug && !mobile && <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 700, flex: "0 0 auto" }}>quorly.ca/o/{tree.slug}</span>}
      </div>

      {empty && (
        <div style={{ textAlign: "center", padding: "18px 10px 4px" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.ink }}>{tr(L("Your organization is live.", "Votre organisation est en ligne."))}</div>
          <div style={{ fontSize: 13, color: C.ink2, marginTop: 6, lineHeight: 1.5, maxWidth: 460, margin: "6px auto 0" }}>
            {tr(L("Everything Quorly does happens inside it. Add the first department — you can add the rest whenever the group needs them.",
                  "Tout ce que fait Quorly s'y passe. Ajoutez le premier département — vous ajouterez les autres quand le groupe en aura besoin."))}
          </div>
        </div>
      )}

      {/* departments */}
      {!empty && (
        <div>
          <div style={sect}>{tr(L("Departments", "Départements"))}</div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {tree.departments.map((d) => {
              const Icon = deptIcon(d);
              return (
                <div key={d.id} onClick={() => onOpen(d.id)} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon size={16} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name}
                      {d.kind === "election" && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: d.election_status === "closed" ? C.ink2 : C.green, background: d.election_status === "closed" ? C.line2 : "#E6F5EE", borderRadius: 6, padding: "1px 6px", marginLeft: 6 }}>
                          {d.election_status === "closed" ? tr(L("closed", "close")) : tr(L("open", "ouverte"))}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>
                      {d.members} {tr(L("members", "membres"))}
                      {d.entries ? ` · ${d.entries} ${tr(L("entries", "entrées"))}` : ""}
                      {d.group_name ? ` · ${d.group_name}` : ""}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: C.faint, flex: "0 0 auto" }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* quick add */}
      {tree.is_admin && (
        <div>
          <div style={sect}>{empty ? tr(L("Add the first department", "Ajoutez le premier département")) : tr(L("Add a department", "Ajouter un département"))}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_ADD.map((d) => {
              const Icon = ICONS[d.icon] ?? FolderOpen;
              return (
                <span key={d.id} onClick={() => add(d.id)} title={d.blurb[lang]} style={{
                  display: "inline-flex", alignItems: "center", gap: 7, cursor: busy ? "default" : "pointer",
                  border: `1px dashed ${C.accent}`, color: C.accent, background: "#fff",
                  borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 800, opacity: busy && busy !== d.id ? .5 : 1,
                }}>
                  <Icon size={14} /> {busy === d.id ? tr(L("Adding…", "Ajout…")) : d.name[lang]}
                </span>
              );
            })}
          </div>
          {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </>
  );
}

/* ============================= MEMBERS ================================== */
function MembersTab({ tree, tr, lang, mobile, onChanged }: { tree: CfOrgTree; tr: TR; lang: "en" | "fr"; mobile: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<CfOrgMember[] | null>(null);
  const [contact, setContact] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => { cf.orgMembers(tree.id).then(setRows).catch(() => setRows([])); }, [tree.id]);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const c = contact.trim(); if (!c || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await cf.orgInvite(tree.id, c, title.trim() || null, lang);
      if (r?.ok === false) {
        const pm = planLimitMsg(r, lang);
        if (pm) { if (confirm(pm)) window.open("/pricing", "_blank"); setMsg(pm); }
        else setMsg(r.error === "already_invited" ? tr(L("Already invited.", "Déjà invité.")) : r.error || "Failed");
      }
      else { setContact(""); setTitle(""); setMsg(tr(L("Invitation sent.", "Invitation envoyée."))); load(); onChanged(); }
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  const setOffice = async (m: CfOrgMember) => {
    const next = window.prompt(tr(L("Office held (leave blank for none)", "Fonction occupée (vide pour aucune)")), m.title ?? "");
    if (next === null) return;
    try { await cf.setMemberTitle(m.member_id, next.trim() || null); load(); onChanged(); } catch (e: any) { alert(e.message); }
  };

  return (
    <>
      {tree.is_admin && (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
          <div style={{ ...sect, paddingTop: 0 }}>{tr(L("Invite to the organization", "Inviter dans l'organisation"))}</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: -4, marginBottom: 10 }}>
            {tr(L("One invite covers every department — they join the group, not a single board.",
                  "Une invitation couvre tous les départements — la personne rejoint le groupe, pas un seul tableau."))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "2fr 1.4fr auto", gap: 8 }}>
            <input value={contact} onChange={(e) => setContact(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder={tr(L("Email or phone", "Courriel ou téléphone"))} style={inp} />
            <input list="org-offices" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder={tr(L("Office (optional)", "Fonction (optionnel)"))} style={inp} />
            <datalist id="org-offices">{(tree.officer_titles ?? []).map((t) => <option key={t} value={t} />)}</datalist>
            <div onClick={invite} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? .6 : 1 }}>
              <Mail size={14} /> {tr(L("Invite", "Inviter"))}
            </div>
          </div>
          {msg && <div style={{ fontSize: 12.5, color: msg.includes("!") || /sent|envoyée/i.test(msg) ? C.green : "#B4531F", marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      <div>
        <div style={sect}>{tr(L("Roster", "Registre"))}</div>
        {rows === null && <div style={{ fontSize: 13, color: C.faint }}>{tr(L("Loading…", "Chargement…"))}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(rows ?? []).map((m) => (
            <div key={m.member_id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 13px" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: m.color || C.line, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flex: "0 0 auto" }}>
                {(m.name || "?").trim()[0]?.toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                  {m.name}
                  {m.role === "admin" && <Shield size={12} style={{ color: C.accent }} />}
                  {m.status === "invited" && <span style={{ fontSize: 10, fontWeight: 800, color: "#B4801F", background: "#FBF2DF", borderRadius: 6, padding: "1px 6px" }}>{tr(L("invited", "invité"))}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>
                  {m.contact || "—"}
                  {m.departments ? ` · ${m.departments} ${tr(L("departments", "départements"))}` : ""}
                </div>
              </div>
              <span onClick={tree.is_admin ? () => setOffice(m) : undefined} style={{
                flex: "0 0 auto", fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: "4px 10px",
                background: m.title ? C.accentSoft : "transparent", color: m.title ? C.accent : C.faint,
                border: m.title ? "1px solid transparent" : `1px dashed ${C.line}`,
                cursor: tree.is_admin ? "pointer" : "default",
              }}>{m.title || (tree.is_admin ? tr(L("+ office", "+ fonction")) : "—")}</span>
            </div>
          ))}
          {rows?.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>{tr(L("No members yet.", "Aucun membre."))}</div>}
        </div>
      </div>
    </>
  );
}

/* ============================ SETTINGS ================================== */
function SettingsTab({ tree, tr, onChanged }: { tree: CfOrgTree; tr: TR; onChanged: () => void }) {
  const [name, setName] = useState(tree.name);
  const [legal, setLegal] = useState(tree.legal_name ?? "");
  const [color, setColor] = useState(tree.color);
  const [titles, setTitles] = useState<string[]>(tree.officer_titles ?? []);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setName(tree.name); setLegal(tree.legal_name ?? ""); setColor(tree.color); setTitles(tree.officer_titles ?? []); }, [tree.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tree.is_admin) return <div style={{ fontSize: 13, color: C.faint }}>{tr(L("Only an administrator can change these.", "Seul un administrateur peut modifier ceci."))}</div>;

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await cf.orgUpdate(tree.id, { name: name.trim(), legalName: legal.trim(), color, titles });
      setMsg(tr(L("Saved.", "Enregistré."))); onChanged();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <div>
        <div style={lbl}>{tr(L("Organization name", "Nom de l'organisation"))}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
      </div>
      <div>
        <div style={lbl}>{tr(L("Legal name", "Raison sociale"))}</div>
        <input value={legal} onChange={(e) => setLegal(e.target.value)} placeholder="—" style={inp} />
      </div>
      <div>
        <div style={lbl}>{tr(L("Organization colour", "Couleur de l'organisation"))}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {ORG_COLORS.map((c) => <span key={c} onClick={() => setColor(c)} style={{ width: 30, height: 30, borderRadius: 8, background: c, cursor: "pointer", border: color === c ? `3px solid ${C.ink}` : "3px solid transparent" }} />)}
        </div>
      </div>
      <div>
        <div style={lbl}>{tr(L("Offices", "Fonctions"))}</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: -4, marginBottom: 8 }}>
          {tr(L("The posts a member can hold. Elections are run for these.", "Les postes qu'un membre peut occuper. Les élections portent sur ceux-ci."))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
          {titles.map((t, i) => (
            <span key={`${t}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.line2, borderRadius: 999, padding: "5px 8px 5px 12px", fontSize: 12.5, fontWeight: 700 }}>
              {t}<X size={13} style={{ cursor: "pointer", color: C.faint }} onClick={() => setTitles((a) => a.filter((_, j) => j !== i))} />
            </span>
          ))}
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) { setTitles((a) => [...a, newTitle.trim()]); setNewTitle(""); } }}
            placeholder={tr(L("+ add", "+ ajouter"))}
            style={{ border: `1px dashed ${C.line}`, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, outline: "none", width: 110, background: "transparent" }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div onClick={save} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: busy ? .6 : 1 }}>
          <Check size={14} /> {tr(L("Save", "Enregistrer"))}
        </div>
        {msg && <span style={{ fontSize: 12.5, color: /Saved|Enregistré/.test(msg) ? C.green : "#B4531F" }}>{msg}</span>}
      </div>
    </div>
  );
}

const sect: any = { fontSize: 10, fontWeight: 800, letterSpacing: .8, textTransform: "uppercase", color: C.faint, padding: "2px 2px 8px" };
const lbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, marginBottom: 7 };
const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 11px", fontSize: 14, background: "#fff", color: C.ink, outline: "none", width: "100%" };
