"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";
import { cf } from "@/lib/cf";
import { useLang } from "@/lib/i18n";
import { Sparkles, Check, Ban, Play, Flag, Plus, Loader2, Mail, X } from "lucide-react";

const C = { paper: "#F1EEE7", panel: "#FFFFFF", ink: "#14131A", ink2: "#6B6863", faint: "#9a97a4", line: "#ECE9E2", accent: "#2F3AA3", accentSoft: "#EEEBFA", green: "#178A4E", greenSoft: "#E7F6EE", red: "#C0392B", redSoft: "#FBE9E7", amber: "#A86A12", amberSoft: "#FDF3E0", blue: "#2b62c9", blueSoft: "#E7EEFB" };
const inp: any = { border: `1.5px solid #E3E0D8`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, background: "#FBFAF7", color: C.ink, outline: "none", fontFamily: "inherit", width: "100%" };
const L = (en: string, fr: string) => ({ en, fr });
const STATUS: Record<string, { label: { en: string; fr: string }; bg: string; fg: string }> = {
  new: { label: L("New", "Nouveau"), bg: "#F1EFEA", fg: "#7a7683" },
  active: { label: L("In sequence", "En séquence"), bg: C.blueSoft, fg: C.blue },
  clicked: { label: L("Clicked", "A cliqué"), bg: C.amberSoft, fg: C.amber },
  engaged: { label: L("Engaged", "Engagé"), bg: C.greenSoft, fg: C.green },
  replied: { label: L("Replied", "A répondu"), bg: C.green, fg: "#fff" },
  bounced: { label: L("Bounced", "Rejeté"), bg: C.redSoft, fg: C.red },
  stopped: { label: L("Stopped", "Arrêté"), bg: "#F1EFEA", fg: "#9a97a4" },
  done: { label: L("Done", "Terminé"), bg: "#EEEBFA", fg: C.accent },
};
const DOTS = ["#EA4335", "#FBBC05", "#34A853", "#4285F4"];

export default function ProspectingPage() {
  return <Suspense fallback={null}><QuorlyAuthGate><Inner /></QuorlyAuthGate></Suspense>;
}

function Inner() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", category: "", region: "", contact: "", fit: "" });

  const reload = useCallback(async () => {
    const [s, l] = await Promise.all([cf.outreachStats().catch(() => ({})), cf.outreachList(filter === "all" ? null : filter).catch(() => [])]);
    setStats(s || {}); setRows(l || []);
  }, [filter]);
  useEffect(() => { cf.outreachAdmin().then((a) => { setAdmin(a); if (a) reload(); }).catch(() => setAdmin(false)); }, [reload]);

  const act = async (id: string, fn: () => Promise<any>) => { setBusy(id); try { await fn(); await reload(); } catch (e: any) { alert(e?.message || tr(L("Something went wrong. Please try again.", "Une erreur est survenue. Veuillez réessayer."))); } finally { setBusy(""); } };
  // Grounded discovery. It writes into the same 'new' queue as the manual form, so
  // nothing it finds can be emailed until it is approved below.
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState("");
  const findProspects = async () => {
    if (finding) return;
    setFinding(true); setFindNote(tr(L("Searching the web — this takes a minute…", "Recherche sur le web — cela prend une minute…")));
    try {
      const r = await cf.outreachFind({ regions: ["Ottawa, Ontario", "Montréal, Québec"], limit: 12 });
      if (r?.error) setFindNote(tr(L(`Search failed: ${r.error}`, `Échec de la recherche : ${r.error}`)));
      else {
        const added = r?.added ?? 0;
        const skipped = r?.dropped?.length ?? 0;
        setFindNote(added === 0
          ? tr(L(`No new prospects with a verifiable public address this time${skipped ? ` — ${skipped} candidate(s) discarded for having none.` : "."}`,
                 `Aucun nouveau prospect avec une adresse publique vérifiable cette fois${skipped ? ` — ${skipped} candidat(s) écarté(s) faute d'adresse.` : "."}`))
          : tr(L(`${added} prospect${added === 1 ? "" : "s"} added for review${skipped ? `, ${skipped} discarded without a verifiable address` : ""}.`,
                 `${added} prospect${added === 1 ? "" : "s"} ajouté${added === 1 ? "" : "s"} à revoir${skipped ? `, ${skipped} écarté(s) faute d'adresse vérifiable` : ""}.`)));
        await reload();
        if (added > 0) setFilter("new");
      }
    } catch (e: any) { setFindNote(e?.message || tr(L("Something went wrong. Please try again.", "Une erreur est survenue. Veuillez réessayer."))); }
    setFinding(false);
  };

  // The email itself, on demand. Nothing is sent to open this.
  const [preview, setPreview] = useState<{ org: string; subject: string; from: string; reply_to: string; html: string; touch: number; id: string } | null>(null);
  const [previewing, setPreviewing] = useState("");
  const openPreview = async (id: string, org: string, touch = 1) => {
    setPreviewing(id);
    try {
      const r = await cf.outreachRenderEmail(id, touch);
      if (r?.html) setPreview({ org: r.org_name || org, subject: r.subject || "", from: r.from || "", reply_to: r.reply_to || "", html: r.html, touch: r.touch ?? touch, id });
      else alert(r?.error || tr(L("Could not load the email.", "Impossible de charger le courriel.")));
    } catch (e: any) { alert(e?.message || tr(L("Could not load the email.", "Impossible de charger le courriel."))); }
    setPreviewing("");
  };

  const addProspect = async () => {
    if (!form.name.trim()) return;
    setBusy("add");
    try { await cf.outreachAdd(form); setForm({ name: "", email: "", category: "", region: "", contact: "", fit: "" }); setAdding(false); await reload(); }
    catch (e: any) { alert(e?.message || tr(L("Something went wrong. Please try again.", "Une erreur est survenue. Veuillez réessayer."))); } finally { setBusy(""); }
  };

  if (admin === null) return <Center><Loader2 className="spin" size={18} /> {tr(L("Loading…", "Chargement…"))}</Center>;
  if (!admin) return <Center>{tr(L("You don't have access to the prospecting console.", "Vous n'avez pas accès à la console de prospection."))}</Center>;

  const tiles = [
    { k: "total", n: stats.total ?? 0, l: L("Prospects", "Prospects"), c: C.accent },
    { k: "contacted", n: stats.contacted ?? 0, l: L("Contacted", "Contactés"), c: C.ink },
    { k: "opened", n: stats.opened ?? 0, l: L("Opened", "Ouverts"), c: C.ink },
    { k: "clicked", n: stats.clicked ?? 0, l: L("Clicked", "Cliqués"), c: C.amber },
    { k: "engaged", n: stats.engaged ?? 0, l: L("Engaged", "Engagés"), c: C.green },
    { k: "replied", n: stats.replied ?? 0, l: L("Replied", "Réponses"), c: C.green },
  ];
  const newCount = stats.new ?? 0;
  const TABS: [string, { en: string; fr: string }][] = [["all", L("All", "Tous")], ["new", L("To review", "À revoir")], ["active", L("In sequence", "En séquence")], ["engaged", L("Engaged", "Engagés")], ["bounced", L("Bounced", "Rejetés")]];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif", color: C.ink }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={() => router.push("/forms")} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>Q</div>
            <div><div style={{ fontWeight: 800, fontSize: 17 }}>Quorly</div>
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>{DOTS.map((c) => <span key={c} style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />)}</div></div>
          </div>
        </div>
        <div onClick={() => router.push("/forms")} style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>← {tr(L("Forms", "Formulaires"))}</div>
      </div>

      <div style={{ padding: "24px 26px 48px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -.5, display: "flex", alignItems: "center", gap: 9 }}><Sparkles size={22} style={{ color: C.accent }} /> <span><span style={{ color: C.accent }}>{tr(L("AI", "IA"))}</span> {tr(L("Prospecting", "Prospection"))}</span></div>
        <div style={{ color: C.ink2, fontSize: 14, margin: "5px 0 20px" }}>{tr(L("Organizations that would run their board on Quorly — boards, associations, non-profits, condo councils, sport groups, school PACs & church councils — found daily, contacted and followed up automatically, stopping on reply.",
          "Des organisations qui géreraient leur conseil sur Quorly — conseils, associations, OBNL, syndicats de copropriété, clubs sportifs, comités d'école et conseils de fabrique — trouvées chaque jour, contactées et relancées automatiquement, avec arrêt dès la réponse."))}</div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {tiles.map((t) => (
            <div key={t.k} style={{ flex: "1 1 140px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 13, padding: "13px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -.5, color: t.c }}>{t.n}</div>
              <div style={{ fontSize: 11.5, color: C.ink2, fontWeight: 600, marginTop: 2 }}>{tr(t.l)}</div>
            </div>
          ))}
        </div>

        {newCount > 0 && filter !== "new" && (
          <div style={{ background: C.accentSoft, border: `1px solid #D9D3F5`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, color: "#2b2570", fontWeight: 600 }}>✨ {tr(L(`${newCount} new prospect${newCount === 1 ? "" : "s"} found — review & approve before outreach.`,
            `${newCount} nouveau${newCount === 1 ? "" : "x"} prospect${newCount === 1 ? "" : "s"} trouvé${newCount === 1 ? "" : "s"} — à revoir et approuver avant l'envoi.`))}</div>
            <div onClick={() => setFilter("new")} style={{ background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 800, padding: "8px 15px", borderRadius: 9, cursor: "pointer" }}>{tr(L("Review", "Revoir"))} {newCount} →</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {TABS.map(([k, lbl]) => (
            <div key={k} onClick={() => setFilter(k)} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 8, cursor: "pointer", background: filter === k ? C.accentSoft : "transparent", color: filter === k ? C.accent : C.ink2 }}>{tr(lbl)}</div>
          ))}
          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            <div onClick={findProspects} title={tr(L("Search the web for boards, associations and condo syndicates in Ottawa and Montréal", "Chercher sur le web des conseils, associations et syndicats de copropriété à Ottawa et Montréal"))}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, background: finding ? C.accentSoft : C.accent, border: `1px solid ${C.accent}`, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, color: finding ? C.accent : "#fff", cursor: finding ? "default" : "pointer" }}>
              {finding ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {finding ? tr(L("Searching…", "Recherche…")) : tr(L("Find prospects", "Trouver des prospects"))}
            </div>
            <div onClick={() => setAdding((a) => !a)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}><Plus size={14} /> {tr(L("Add prospect", "Ajouter un prospect"))}</div>
          </div>
        </div>

        {preview && (
          <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,19,26,.45)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 720, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
              <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.org}</div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{tr(L("Nothing has been sent — this is the message itself.", "Rien n'a été envoyé — voici le message lui-même."))}</div>
                </div>
                <span onClick={() => setPreview(null)} style={{ marginLeft: "auto", color: C.faint, cursor: "pointer", display: "flex" }}><X size={18} /></span>
              </div>
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 12, color: C.ink2, display: "flex", flexDirection: "column", gap: 3 }}>
                <div><b style={{ color: C.faint, fontWeight: 800 }}>{tr(L("From", "De"))}:</b> {preview.from}</div>
                <div><b style={{ color: C.faint, fontWeight: 800 }}>{tr(L("Reply-to", "Répondre à"))}:</b> {preview.reply_to}</div>
                <div><b style={{ color: C.faint, fontWeight: 800 }}>{tr(L("Subject", "Objet"))}:</b> {preview.subject}</div>
              </div>
              {/* Each touch is a different message; the follow-ups go out on their own. */}
              <div style={{ display: "flex", gap: 6, padding: "9px 16px", borderBottom: `1px solid ${C.line}` }}>
                {[1, 2, 3].map((t) => (
                  <span key={t} onClick={() => openPreview(preview.id, preview.org, t)} style={{ fontSize: 11.5, fontWeight: 800, padding: "5px 11px", borderRadius: 999, cursor: "pointer", background: preview.touch === t ? C.accentSoft : "transparent", color: preview.touch === t ? C.accent : C.ink2, border: preview.touch === t ? "1px solid transparent" : `1px dashed ${C.line}` }}>
                    {t === 1 ? tr(L("Intro", "Intro")) : tr(L(`Follow-up ${t - 1}`, `Relance ${t - 1}`))}
                  </span>
                ))}
              </div>
              <iframe title="email" srcDoc={preview.html} style={{ flex: 1, minHeight: 380, border: 0, background: "#F1EEE7" }} />
            </div>
          </div>
        )}

        {findNote && (
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.ink2, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} style={{ color: C.accent, flex: "0 0 auto" }} /> {findNote}
            <span onClick={() => setFindNote("")} style={{ marginLeft: "auto", color: C.faint, cursor: "pointer", fontWeight: 800 }}>×</span>
          </div>
        )}

        {adding && (
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <input placeholder={tr(L("Organization name *", "Nom de l'organisation *"))} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
            <input placeholder={tr(L("Contact email", "Courriel de contact"))} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} />
            <input placeholder={tr(L("Category (e.g. school-pac)", "Catégorie (ex. school-pac)"))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp} />
            <input placeholder={tr(L("Region / city", "Région / ville"))} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inp} />
            <input placeholder={tr(L("Contact name", "Nom du contact"))} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} style={inp} />
            <input placeholder={tr(L("Fit (one line)", "Pertinence (une ligne)"))} value={form.fit} onChange={(e) => setForm({ ...form, fit: e.target.value })} style={inp} />
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <div onClick={() => setAdding(false)} style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.line}`, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
              <div onClick={addProspect} style={{ padding: "9px 18px", borderRadius: 9, background: C.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: form.name.trim() ? 1 : .6 }}>{busy === "add" ? tr(L("Adding…", "Ajout…")) : tr(L("Add to pipeline", "Ajouter au pipeline"))}</div>
            </div>
          </div>
        )}

        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{[L("Organization", "Organisation"), L("Type", "Type"), L("Location", "Lieu"), L("Fit", "Pertinence"), L("Touches", "Contacts"), L("Status", "Statut"), L("", "")].map((o) => tr(o)).map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 10.5, letterSpacing: .5, color: C.faint, fontWeight: 800, textTransform: "uppercase", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>{h}</th>))}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS[r.status] || STATUS.new;
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB` }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.org_name}</div>
                        <div style={{ fontSize: 11.5, color: C.faint }}>{r.email || tr(L("no email", "aucun courriel"))}{r.contact_name ? " · " + r.contact_name : ""}</div>
                      </td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12.5, color: C.ink2 }}>{r.category || "—"}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12.5, color: C.ink2 }}>{r.region || "—"}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12, color: C.ink2, fontStyle: "italic", maxWidth: 220 }}>{r.fit || "—"}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12.5, color: C.ink2, textAlign: "center" }}>{r.touch_count ?? 0}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB` }}><span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 20, background: st.bg, color: st.fg }}>{tr(st.label)}</span></td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, whiteSpace: "nowrap" }}>
                        {busy === r.id ? <Loader2 size={14} className="spin" /> : (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {r.email && <IconBtn title={tr(L("See the email — sends nothing", "Voir le courriel — n'envoie rien"))} color={C.accent} onClick={() => openPreview(r.id, r.org_name)}>{previewing === r.id ? <Loader2 size={14} className="spin" /> : <Mail size={14} />}</IconBtn>}
                            {r.status === "new" && r.email && <IconBtn title={tr(L("Approve → queues a real email to this address", "Approuver → met en file un vrai courriel à cette adresse"))} color={C.green} onClick={() => act(r.id, () => cf.outreachApprove(r.id))}><Check size={14} /></IconBtn>}
                            {r.status === "active" && <IconBtn title={tr(L("Stop", "Arrêter"))} color={C.red} onClick={() => act(r.id, () => cf.outreachStop(r.id))}><Ban size={14} /></IconBtn>}
                            {r.status === "stopped" && <IconBtn title={tr(L("Resume", "Reprendre"))} color={C.accent} onClick={() => act(r.id, () => cf.outreachResume(r.id))}><Play size={14} /></IconBtn>}
                            {(r.status === "engaged" || r.status === "clicked" || r.status === "replied") && <IconBtn title={tr(L("Mark met", "Marquer rencontré"))} color={C.accent} onClick={() => act(r.id, () => cf.outreachStage(r.id, "met"))}><Flag size={14} /></IconBtn>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.faint, fontSize: 13 }}>{filter !== "all"
                  ? tr(L("No prospects in this view.", "Aucun prospect dans cette vue."))
                  : tr(L("No prospects yet — the daily finder will add some, or add one above.", "Aucun prospect pour l'instant — le chercheur quotidien en ajoutera, ou ajoutez-en un ci-dessus."))}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function IconBtn({ children, title, color, onClick }: any) {
  return <span title={title} onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${color}`, color, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{children}</span>;
}
function Center({ children }: any) {
  return <div style={{ background: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: C.ink2, fontSize: 14, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>{children}</div>;
}
