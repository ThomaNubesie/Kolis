"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Plus, Trash2, Loader2 } from "lucide-react";
import { cf, type CfElection, type CfCandidate, type CfFormFull } from "@/lib/cf";
import { buildElectionPdf } from "@/lib/pdf";

const L = (en: string, fr: string) => ({ en, fr });
const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#178A4E", greenSoft: "#E7F6EE", red: "#C0392B", redSoft: "#FBE9E7", gold: "#EEF7F1" };
const inp: any = { width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, background: "#FBFAF7", color: C.ink, outline: "none", fontFamily: "inherit" };
const lbl: any = { fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.accent, marginBottom: 5 };
const card: any = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14 };
const netStr = (n: number) => `${n >= 0 ? "+" : ""}${n}`;

export default function ElectionPanel({ form, tr, mobile }: { form: CfFormFull; tr: (o: any) => string; lang: string; mobile?: boolean }) {
  const [el, setEl] = useState<CfElection | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");

  const load = useCallback(async () => {
    try { await cf.electionEnsureMember(form.id).catch(() => {}); const r = await cf.electionResults(form.id); setEl(r); }
    catch (e: any) { setErr(e?.message || "load_failed"); }
  }, [form.id]);
  useEffect(() => { load(); }, [load]);

  const closed = el?.status === "closed";
  const isAdmin = !!el?.is_admin;
  const byPosition = useMemo(() => {
    const g: Record<string, CfCandidate[]> = {};
    (el?.candidates ?? []).forEach((c) => { (g[c.position] = g[c.position] || []).push(c); });
    return g;
  }, [el]);
  const positions = el?.positions?.length ? el.positions : Object.keys(byPosition);

  const vote = async (entry: string, value: "for" | "against", reason: string) => {
    setErr(""); try { await cf.electionVote(entry, value, reason); await load(); }
    catch (e: any) { setErr(e?.message || "vote_failed"); }
  };

  const doClose = async () => {
    if (!confirm(tr(L("Close the election now? Votes are tallied, a winner is declared for each position, results are emailed to every member and saved to the Election folder. This cannot be undone.",
      "Clôturer l'élection maintenant ? Les votes sont comptabilisés, un gagnant est déclaré pour chaque poste, les résultats sont envoyés par courriel à chaque membre et enregistrés dans le dossier Élection. Action irréversible.")))) return;
    setClosing(true); setErr(""); setCloseNote("");
    try {
      const res = await cf.closeElection(form.id);
      setEl(res);
      let saved = false, mailed = 0;
      try {
        const recipientsArr = Array.isArray((res as any).recipients) ? (res as any).recipients as string[] : [];
        const doc = await buildElectionPdf(form.name, res, recipientsArr.length || undefined);
        const blob = doc.output("blob") as Blob;
        const b64 = String(doc.output("datauristring")).split("base64,")[1] || "";
        try { const fileId = await cf.fileSavePdf(form.id, "election-results.pdf", blob); if (res.election_folder) await cf.fileMove(fileId, res.election_folder).catch(() => {}); saved = true; } catch { /* keep going */ }
        const winners = res.candidates.filter((c) => c.winner).map((c) => `${c.position}: ${c.name} (${c.for} For / ${c.against} Against)`).join("\n");
        const recipients = Array.isArray((res as any).recipients) ? (res as any).recipients as string[] : [];
        if (recipients.length && b64) {
          const r = await cf.sendPdf(form.id, { filename: "election-results.pdf", pdf_base64: b64, recipients, message: `The election “${form.name}” is closed. Winners:\n${winners || "(no votes cast)"}\n\nFull results with every member's reason are attached.` });
          mailed = r?.sent ?? (r?.ok ? recipients.length : 0);
        }
      } catch { /* email/pdf best-effort — the election is already closed in the DB */ }
      setCloseNote(tr(L(`Election closed. ${saved ? "Results saved to the Election folder" : "Results ready"}${mailed ? ` · emailed to ${mailed} member${mailed === 1 ? "" : "s"}` : ""}.`,
        `Élection clôturée. ${saved ? "Résultats enregistrés dans le dossier Élection" : "Résultats prêts"}${mailed ? ` · envoyés à ${mailed} membre${mailed === 1 ? "" : "s"}` : ""}.`)));
      await load();
    } catch (e: any) { setErr(e?.message || "close_failed"); }
    finally { setClosing(false); }
  };

  if (!el) return <div style={{ color: C.faint, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> {tr(L("Loading election…", "Chargement de l'élection…"))}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status banner */}
      <div style={{ borderRadius: 12, padding: "12px 15px", fontSize: 13, fontWeight: 700, border: `1px solid ${closed ? C.line : "#C6E9D3"}`, background: closed ? C.accentSoft : C.greenSoft, color: closed ? C.accent : "#166B3D" }}>
        {closed
          ? tr(L(`✅ Election closed${el.closed_by ? " by " + el.closed_by : ""}. Winner per position = highest net (For − Against). Results saved to the Election folder and emailed to all members.`,
              `✅ Élection clôturée${el.closed_by ? " par " + el.closed_by : ""}. Gagnant par poste = solde net le plus élevé (Pour − Contre). Résultats enregistrés dans le dossier Élection et envoyés à tous les membres.`))
          : tr(L("🗳️ Election open — declare your candidacy for a position, then vote For or Against each candidate with a reason. Winner per position = highest net (For − Against).",
              "🗳️ Élection ouverte — présentez votre candidature à un poste, puis votez Pour ou Contre chaque candidat avec une raison. Gagnant par poste = solde net le plus élevé (Pour − Contre)."))}
      </div>

      {err && <div style={{ background: C.redSoft, color: C.red, border: `1px solid #F3C6C0`, borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 700 }}>{err}</div>}
      {closeNote && <div style={{ background: C.greenSoft, color: "#166B3D", border: `1px solid #C6E9D3`, borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 700 }}>{closeNote}</div>}

      {/* Admin: positions + close */}
      {isAdmin && !closed && <PositionsEditor form={form} el={el} tr={tr} onSaved={load} />}
      {isAdmin && !closed && (
        <div style={{ ...card, padding: "13px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: C.ink2, flex: 1, minWidth: 180 }}>
            <b style={{ color: C.ink }}>{tr(L("Admin", "Admin"))}:</b> {tr(L("closing tallies every vote, declares the winner for each position, emails all members and saves the results PDF.", "clôturer comptabilise chaque vote, déclare le gagnant de chaque poste, envoie un courriel à tous les membres et enregistre le PDF des résultats."))}
          </div>
          <button onClick={doClose} disabled={closing} style={{ background: C.red, color: "#fff", border: 0, borderRadius: 10, padding: "11px 18px", fontSize: 13.5, fontWeight: 800, cursor: closing ? "default" : "pointer", opacity: closing ? .7 : 1, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {closing ? <><Loader2 size={15} className="spin" /> {tr(L("Closing…", "Clôture…"))}</> : tr(L("Close election", "Clôturer l'élection"))}
          </button>
        </div>
      )}

      {/* Candidacy */}
      {!closed && <CandidacyForm form={form} el={el} positions={positions} tr={tr} onDone={load} setBusy={setBusy} busy={busy} />}

      {/* Per-position ballots / results */}
      {positions.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("No positions yet.", "Aucun poste."))}{isAdmin ? "" : " " + tr(L("Waiting for the admin to set them up.", "En attente de leur création par l'admin."))}</div>}
      {positions.map((pos) => {
        const cands = (byPosition[pos] || []).slice().sort((a, b) => b.net - a.net || b.for - a.for || +new Date(a.declared_at) - +new Date(b.declared_at));
        return (
          <div key={pos}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 8px" }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: .3, color: C.accent, textTransform: "uppercase" }}>{pos}</span>
              <span style={{ fontSize: 11.5, color: C.faint }}>{cands.length} {tr(L("candidate", "candidat"))}{cands.length === 1 ? "" : "s"}</span>
            </div>
            {cands.length === 0
              ? <div style={{ ...card, padding: "12px 15px", color: C.faint, fontSize: 12.5 }}>{tr(L("No candidates yet — be the first to declare above.", "Aucun candidat — présentez-vous ci-dessus."))}</div>
              : <div style={{ ...card, overflow: "hidden" }}>
                  {cands.map((c, i) => <CandidateRow key={c.entry_id} c={c} first={i === 0} closed={closed} tr={tr} mobile={mobile} onVote={vote} />)}
                </div>}
          </div>
        );
      })}

      {/* Vote reasons (visible once closed) */}
      {closed && el.reasons.length > 0 && (
        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>{tr(L("Why members voted", "Pourquoi les membres ont voté"))}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {el.reasons.map((r, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${r.value === "for" ? C.green : C.red}`, paddingLeft: 10, fontSize: 12.5, color: "#3a3742", lineHeight: 1.5 }}>
                <b style={{ background: r.value === "for" ? C.greenSoft : C.redSoft, color: r.value === "for" ? C.green : C.red, fontSize: 10, padding: "2px 7px", borderRadius: 20, marginRight: 6 }}>{r.value === "for" ? tr(L("For", "Pour")) : tr(L("Against", "Contre"))}</b>
                “{r.reason}” — {r.voter} <span style={{ color: C.faint }}>· {r.candidate} ({r.position})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function PositionsEditor({ form, el, tr, onSaved }: { form: CfFormFull; el: CfElection; tr: (o: any) => string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>(el.positions);
  const [add, setAdd] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setItems(el.positions); }, [el.positions]);
  const save = async (next: string[]) => {
    setBusy(true); try { await cf.setPositions(form.id, next); onSaved(); } catch (e: any) { alert(e?.message || "Failed"); } finally { setBusy(false); }
  };
  const addItem = () => { const v = add.trim(); if (!v || items.includes(v)) { setAdd(""); return; } const next = [...items, v]; setItems(next); setAdd(""); save(next); };
  const remove = (v: string) => { const next = items.filter((x) => x !== v); setItems(next); save(next); };
  return (
    <div style={{ ...card, padding: "12px 15px" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{tr(L("Positions", "Postes"))} <span style={{ color: C.faint, fontWeight: 600 }}>· {items.length}</span></div>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.accent }}>{open ? tr(L("Done", "Terminé")) : tr(L("Manage", "Gérer"))}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {items.map((p) => (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.accentSoft, color: C.accent, borderRadius: 20, padding: "5px 6px 5px 12px", fontSize: 12.5, fontWeight: 700 }}>
            {p}{open && <span onClick={() => remove(p)} style={{ cursor: "pointer", width: 18, height: 18, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></span>}
          </span>
        ))}
        {items.length === 0 && <span style={{ fontSize: 12, color: C.faint }}>{tr(L("Add the positions members will run for.", "Ajoutez les postes à pourvoir."))}</span>}
      </div>
      {open && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder={tr(L("e.g. President", "ex. Président"))} style={{ ...inp, flex: 1 }} />
          <button onClick={addItem} disabled={busy} style={{ background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: "0 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Plus size={15} /> {tr(L("Add", "Ajouter"))}</button>
        </div>
      )}
    </div>
  );
}

function CandidacyForm({ form, el, positions, tr, onDone, setBusy, busy }: { form: CfFormFull; el: CfElection; positions: string[]; tr: (o: any) => string; onDone: () => void; setBusy: (b: boolean) => void; busy: boolean }) {
  // A member may run for only ONE position per election.
  const alreadyCandidate = el.my_candidacies.length > 0;
  const open = alreadyCandidate ? [] : positions;
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState("");
  const [running, setRunning] = useState("");
  const [plan, setPlan] = useState("");
  useEffect(() => { if (!position && open.length) setPosition(open[0]); }, [open, position]);
  if (positions.length === 0) return null;
  const submit = async () => {
    if (!position || !running.trim()) return;
    setBusy(true);
    try { await cf.declareCandidacy(form.id, position, running.trim(), plan.trim()); setShow(false); setRunning(""); setPlan(""); onDone(); }
    catch (e: any) { alert(e?.message === "already_candidate" ? tr(L("You've already declared for this position.", "Vous êtes déjà candidat à ce poste.")) : (e?.message || "Failed")); }
    finally { setBusy(false); }
  };
  if (!show) return (
    <div style={{ ...card, padding: "13px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ fontSize: 13, color: C.ink2 }}>
        {alreadyCandidate
          ? <span style={{ color: C.green, fontWeight: 700 }}>{tr(L("You're a candidate for", "Vous êtes candidat pour"))} {el.my_candidacies.join(", ")}. {tr(L("You can run for one position per election.", "Vous ne pouvez vous présenter qu'à un seul poste par élection."))}</span>
          : tr(L("Want to run? Declare your candidacy — one position per member.", "Vous voulez vous présenter ? Déclarez votre candidature — un seul poste par membre."))}
      </div>
      {!alreadyCandidate && open.length > 0 && <button onClick={() => setShow(true)} style={{ background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: "10px 16px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>{tr(L("Declare candidacy", "Déclarer ma candidature"))}</button>}
    </div>
  );
  return (
    <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>{tr(L("Declare your candidacy", "Déclarer votre candidature"))}</div>
      <div>
        <div style={lbl}>{tr(L("Position", "Poste"))}</div>
        <select value={position} onChange={(e) => setPosition(e.target.value)} style={inp}>
          {open.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <div style={lbl}>{tr(L("Why are you running?", "Pourquoi vous présentez-vous ?"))}</div>
        <textarea value={running} onChange={(e) => setRunning(e.target.value)} style={{ ...inp, minHeight: 60 }} />
      </div>
      <div>
        <div style={lbl}>{tr(L("Your plan for the betterment of all", "Votre plan pour le bien de tous"))}</div>
        <textarea value={plan} onChange={(e) => setPlan(e.target.value)} style={{ ...inp, minHeight: 60 }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShow(false)} style={{ flex: 1, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 11, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</button>
        <button onClick={submit} disabled={busy || !running.trim()} style={{ flex: 2, background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 11, fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: busy || !running.trim() ? .6 : 1 }}>{tr(L("Submit candidacy", "Soumettre ma candidature"))}</button>
      </div>
    </div>
  );
}

function CandidateRow({ c, first, closed, tr, mobile, onVote }: { c: CfCandidate; first: boolean; closed: boolean; tr: (o: any) => string; mobile?: boolean; onVote: (entry: string, value: "for" | "against", reason: string) => void }) {
  const [reason, setReason] = useState(c.my_reason || "");
  const [openReason, setOpenReason] = useState(false);
  const total = c.for + c.against;
  const pct = total ? Math.round((c.for / total) * 100) : 0;
  const cast = (value: "for" | "against") => { onVote(c.entry_id, value, reason); setOpenReason(false); };
  const btn = (mine: boolean, active: string, color: string) => ({ border: `1.5px solid ${mine ? color : "#D9D3F5"}`, background: mine ? color : "#fff", color: mine ? "#fff" : C.accent, borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: closed ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5, opacity: closed && !mine ? .5 : 1 } as any);
  return (
    <div style={{ padding: "14px 16px", borderTop: first ? "none" : `1px solid #F1EEE8`, background: closed && c.winner ? C.gold : "transparent" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexDirection: mobile ? "column" : "row" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{closed && c.winner ? "👑 " : ""}{c.name}{closed && c.winner ? <span style={{ color: C.green }}> · {tr(L("Winner", "Gagnant"))}</span> : ""}</div>
          {c.running && <div style={{ fontSize: 12.5, color: "#3a3742", marginTop: 4, lineHeight: 1.5 }}><b style={{ color: C.faint, fontWeight: 700 }}>{tr(L("Running", "Candidature"))}:</b> {c.running}</div>}
          {c.plan && <div style={{ fontSize: 12.5, color: "#3a3742", marginTop: 3, lineHeight: 1.5 }}><b style={{ color: C.faint, fontWeight: 700 }}>{tr(L("Plan", "Plan"))}:</b> {c.plan}</div>}
        </div>
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8, alignItems: "center" }}>
          {closed
            ? <div style={{ textAlign: "right", fontSize: 12.5 }}><span style={{ background: C.greenSoft, color: C.green, fontWeight: 800, padding: "4px 10px", borderRadius: 20 }}>{c.for} {tr(L("For", "Pour"))}</span> <span style={{ background: C.redSoft, color: C.red, fontWeight: 800, padding: "4px 10px", borderRadius: 20 }}>{c.against} {tr(L("Against", "Contre"))}</span></div>
            : <>
                <button onClick={() => cast("for")} style={btn(c.my_vote === "for", C.green, C.green)}><Check size={15} /> {tr(L("For", "Pour"))}</button>
                <button onClick={() => cast("against")} style={btn(c.my_vote === "against", C.red, C.red)}><X size={15} /> {tr(L("Against", "Contre"))}</button>
              </>}
        </div>
      </div>
      {closed
        ? <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ height: 8, background: "#EDEBE4", borderRadius: 20, overflow: "hidden", flex: 1, maxWidth: 220 }}><div style={{ height: "100%", width: `${pct}%`, background: C.green }} /></div>
            <span style={{ fontSize: 11.5, color: C.faint }}>{pct}% {tr(L("For", "Pour"))} · {tr(L("net", "net"))} {netStr(c.net)}</span>
          </div>
        : <div style={{ marginTop: 8 }}>
            {(openReason || c.my_vote || reason) ? (
              <input value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => { if (c.my_vote && reason !== (c.my_reason || "")) onVote(c.entry_id, c.my_vote, reason); }} placeholder={tr(L("Reason for your choice… (optional)", "Raison de votre choix… (facultatif)"))} style={{ ...inp, background: "#F7FAF8" }} />
            ) : (
              <span onClick={() => setOpenReason(true)} style={{ fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer" }}>{tr(L("+ Add a reason", "+ Ajouter une raison"))}</span>
            )}
            {c.my_vote && <span style={{ fontSize: 11.5, color: C.green, fontWeight: 700, marginLeft: 8 }}>{tr(L("Your vote", "Votre vote"))}: {c.my_vote === "for" ? tr(L("For", "Pour")) : tr(L("Against", "Contre"))}</span>}
          </div>}
    </div>
  );
}
