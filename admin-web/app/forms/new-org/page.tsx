"use client";
// Quorly — Create an organization from a preset.
//
// Pick the shape and Quorly stands the whole thing up: the departments, the
// officer posts, the voting rules a group like yours actually runs on. Every
// line of the preset is editable before it is created — the preset is a
// starting point held in lib/presets.ts, not a fixed template, and what this
// screen finally sends is what cf_create_org builds.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cf } from "@/lib/cf";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";
import { useLang } from "@/lib/i18n";
import { PRESETS, deptPayload, type Preset, type PDept } from "@/lib/presets";
import {
  NotebookPen, Gavel, Vote, Wallet, Receipt, FolderOpen, Users, CalendarDays, Check, X, Building2,
} from "lucide-react";

const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const ORG_COLORS = ["#2F3AA3", "#1F9D6B", "#E4632A", "#8A4FD0", "#C99A1E", "#D14D8B"];
const ICONS: Record<string, any> = { NotebookPen, Gavel, Vote, Wallet, Receipt, FolderOpen, Users, CalendarDays };
const L = (en: string, fr: string) => ({ en, fr });

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function NewOrgPage() {
  return <QuorlyAuthGate><NewOrgInner /></QuorlyAuthGate>;
}

function NewOrgInner() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 900); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const [presetId, setPresetId] = useState("nonprofit");
  const preset: Preset = useMemo(() => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0], [presetId]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [color, setColor] = useState(ORG_COLORS[0]);
  const [invites, setInvites] = useState("");
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [adminName, setAdminName] = useState("");
  useEffect(() => { cf.myProfile().then((p) => { if (p?.name) setAdminName(p.name); }).catch(() => {}); }, []);

  // Per-preset working copy: which departments are on, and what they're called.
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  // Reset the working copy whenever the shape changes — a preset is a fresh start.
  useEffect(() => { setOff({}); setRenames({}); setTitles(preset.titles.map((t) => tr(t))); }, [presetId, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!slugTouched) setSlug(slugify(name)); }, [name, slugTouched]);

  const chosen: PDept[] = preset.depts.filter((d) => !off[d.id]);
  const deptName = (d: PDept) => renames[d.id] ?? tr(d.name);
  const canCreate = !!name.trim() && !busy;

  async function create() {
    if (!canCreate) return;
    setBusy(true); setMsg("");
    try {
      const departments = chosen.map((d) => ({ ...deptPayload(d, deptName(d)), group: null }));
      const invited = invites.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).map((contact) => ({ contact, lang }));
      const res = await cf.createOrg({
        name: name.trim(),
        orgType: preset.id === "empty" ? null : preset.id,
        color, slug: slug.trim() || null, legalName: legalName.trim() || null,
        titles: titles.filter(Boolean), departments, invites: invited, adminName,
      });
      router.push(`/forms?open=${res.org_id}`);
    } catch (e: any) { setMsg(e.message || "Failed"); setBusy(false); }
  }

  const nDepts = chosen.length;
  const createLabel = nDepts
    ? tr(L(`Create organization & ${nDepts} department${nDepts > 1 ? "s" : ""}`, `Créer l'organisation et ${nDepts} département${nDepts > 1 ? "s" : ""}`))
    : tr(L("Create organization", "Créer l'organisation"));

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: narrow ? 12 : 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", background: C.paper, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: `1px solid ${C.line}`, background: "#fff" }}>
          <span onClick={() => router.push("/forms")} title={tr(L("Back", "Retour"))} style={{ fontSize: 24, fontWeight: 800, color: C.ink, cursor: "pointer", lineHeight: 1 }}>‹</span>
          <div style={{ display: "inline-flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 17 }}>Q</div>
              <div style={{ fontWeight: 900, fontSize: 17 }}>Quorly</div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 3, paddingLeft: 40 }}>{["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"].map((c) => <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {(["en", "fr"] as const).map((l) => <span key={l} onClick={() => { setLang(l); cf.setLang(l).catch(() => {}); }} style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>)}
          </div>
        </div>

        <div style={{ padding: narrow ? "18px 16px" : "24px 26px" }}>
          <div style={{ fontSize: narrow ? 24 : 31, fontWeight: 900, letterSpacing: -.6, color: C.ink }}>
            {tr(L("What kind of organization is this?", "Quel type d'organisation est-ce ?"))}
          </div>
          <div style={{ fontSize: 14, color: C.ink2, marginTop: 8, lineHeight: 1.5, maxWidth: 640 }}>
            {tr(L("Pick the shape and Quorly stands the whole thing up — the departments, the officer posts, the voting rules a group like yours actually runs on. Change anything before you create it.",
                  "Choisissez la forme et Quorly met tout en place — les départements, les fonctions, les règles de vote sur lesquelles un groupe comme le vôtre fonctionne. Modifiez tout avant de créer."))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "300px 1fr", gap: 18, marginTop: 20, alignItems: "start" }}>

            {/* ---------- preset list ---------- */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PRESETS.map((p) => {
                const on = p.id === presetId;
                return (
                  <div key={p.id} onClick={() => setPresetId(p.id)} style={{
                    display: "flex", alignItems: "center", gap: 11, cursor: "pointer",
                    background: on ? C.accentSoft : "#fff", border: `2px solid ${on ? C.accent : C.line}`,
                    borderRadius: 12, padding: "11px 13px",
                  }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: on ? "#fff" : C.line2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flex: "0 0 auto" }}>{p.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: on ? C.accent : C.ink }}>{tr(p.name)}</div>
                      <div style={{ fontSize: 11.5, color: on ? C.accent : C.faint, opacity: on ? .8 : 1 }}>{tr(p.sub)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ---------- preset detail ---------- */}
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: narrow ? 16 : 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: C.ink }}>{tr(preset.name)}</div>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: .6, textTransform: "uppercase", background: C.accentSoft, color: C.accent, borderRadius: 999, padding: "3px 9px" }}>{tr(L("Preset", "Modèle"))}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.faint }}>{tr(L("Everything below is editable", "Tout ci-dessous est modifiable"))}</span>
              </div>

              {/* departments */}
              <div style={{ height: 1, background: C.line2, margin: "15px 0" }} />
              <div style={lbl}>{tr(L("Departments created inside the organization", "Départements créés dans l'organisation"))}</div>
              {preset.depts.length === 0 ? (
                <div style={{ fontSize: 13, color: C.faint, padding: "4px 0 2px" }}>
                  {tr(L("None — you'll add departments from inside, whenever the group needs them.", "Aucun — vous ajouterez des départements de l'intérieur, quand le groupe en aura besoin."))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 9 }}>
                  {preset.depts.map((d) => {
                    const on = !off[d.id];
                    const Icon = ICONS[d.icon] ?? FolderOpen;
                    return (
                      <div key={d.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: on ? "#FCFBF9" : "transparent", border: `1px solid ${on ? C.line : C.line2}`, borderRadius: 11, padding: "10px 11px", opacity: on ? 1 : .55 }}>
                        <span onClick={() => setOff((o) => ({ ...o, [d.id]: on }))} style={{
                          width: 20, height: 20, borderRadius: 6, flex: "0 0 auto", marginTop: 1, cursor: "pointer",
                          background: on ? C.green : "#fff", border: `1.5px solid ${on ? C.green : C.line}`,
                          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                        }}>{on && <Check size={13} strokeWidth={3.5} />}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <input
                            value={deptName(d)}
                            onChange={(e) => setRenames((r) => ({ ...r, [d.id]: e.target.value }))}
                            style={{ border: 0, outline: 0, background: "transparent", fontSize: 13.5, fontWeight: 800, color: C.ink, width: "100%", padding: 0 }}
                          />
                          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                            <Icon size={12} /> {tr(d.blurb)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* offices (the posts people hold) */}
              <div style={{ height: 1, background: C.line2, margin: "16px 0" }} />
              <div style={lbl}>{tr(L("Offices", "Fonctions"))}</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: -4, marginBottom: 9 }}>
                {tr(L("The posts a member can hold. Elections are run for these.", "Les postes qu'un membre peut occuper. Les élections portent sur ceux-ci."))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
                {titles.map((t, i) => (
                  <span key={`${t}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.line2, borderRadius: 999, padding: "5px 8px 5px 12px", fontSize: 12.5, fontWeight: 700, color: C.ink }}>
                    {t}
                    <X size={13} style={{ cursor: "pointer", color: C.faint }} onClick={() => setTitles((a) => a.filter((_, j) => j !== i))} />
                  </span>
                ))}
                <input
                  value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) { setTitles((a) => [...a, newTitle.trim()]); setNewTitle(""); } }}
                  placeholder={tr(L("+ add", "+ ajouter"))}
                  style={{ border: `1px dashed ${C.line}`, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, outline: "none", width: 110, background: "transparent", color: C.ink }}
                />
              </div>

              {/* identity */}
              <div style={{ height: 1, background: C.line2, margin: "16px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1.6fr 1fr", gap: 12 }}>
                <div>
                  <div style={lbl}>{tr(L("Organization name", "Nom de l'organisation"))}</div>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
                    placeholder={tr(L("Concord Community Association", "Association communautaire Concord"))}
                    onKeyDown={(e) => e.key === "Enter" && create()} style={inp} />
                </div>
                <div>
                  <div style={lbl}>{tr(L("Members", "Membres"))}</div>
                  <input value={invites} onChange={(e) => setInvites(e.target.value)}
                    placeholder={tr(L("invite later", "inviter plus tard"))} style={inp} />
                  <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>
                    {tr(L("Email or phone, comma-separated. One invite covers every department.", "Courriel ou téléphone, séparés par des virgules. Une invitation couvre tous les départements."))}
                  </div>
                </div>
              </div>

              {custom && (
                <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div>
                    <div style={lbl}>{tr(L("Short name (URL)", "Nom court (URL)"))}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 0, border: `1px solid ${C.line}`, borderRadius: 9, background: "#fff", overflow: "hidden" }}>
                      <span style={{ fontSize: 13, color: C.faint, padding: "10px 0 10px 11px", whiteSpace: "nowrap" }}>quorly.ca/o/</span>
                      <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                        style={{ ...inp, border: 0, padding: "10px 11px 10px 2px" }} />
                    </div>
                  </div>
                  <div>
                    <div style={lbl}>{tr(L("Legal name (optional)", "Raison sociale (optionnel)"))}</div>
                    <input value={legalName} onChange={(e) => setLegalName(e.target.value)}
                      placeholder={tr(L("Concord Community Association Inc.", "Association communautaire Concord inc."))} style={inp} />
                  </div>
                  <div>
                    <div style={lbl}>{tr(L("Organization colour", "Couleur de l'organisation"))}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {ORG_COLORS.map((c) => (
                        <span key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 9, background: c, cursor: "pointer", border: color === c ? `3px solid ${C.ink}` : "3px solid transparent" }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {msg && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 12 }}>{msg}</div>}
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: narrow ? "14px 16px" : "16px 26px", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.faint, maxWidth: 380 }}>
            {tr(L("Most set-up for the least typing — a department is usable the minute it's created.", "Le plus de configuration pour le moins de saisie — un département est utilisable dès sa création."))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 9 }}>
            <div onClick={() => setCustom((v) => !v)} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "11px 18px", fontWeight: 800, fontSize: 13.5, color: C.ink2, cursor: "pointer" }}>
              {custom ? tr(L("Hide details", "Masquer les détails")) : tr(L("Customize", "Personnaliser"))}
            </div>
            <div onClick={create} style={{ background: canCreate ? C.accent : C.line, color: canCreate ? "#fff" : C.faint, borderRadius: 10, padding: "11px 20px", fontWeight: 800, fontSize: 13.5, cursor: canCreate ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Building2 size={15} /> {busy ? tr(L("Creating…", "Création…")) : createLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const lbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, marginBottom: 8 };
const inp: any = { border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 11px", fontSize: 14, background: "#fff", color: C.ink, outline: "none", width: "100%" };
