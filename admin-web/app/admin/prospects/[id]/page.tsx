"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const STAGE_TONE: Record<string, string> = { to_prospect: "#6b7280", pending: "#b45309", met: "#2563eb", replied: "#7c3aed", won: "#178a5e", lost: "#b91c1c" };

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLang();
  const [p, setP] = useState<any>(undefined);
  const [events, setEvents] = useState<any[]>([]);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<any>({});
  const [advice, setAdvice] = useState<string>("");
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => Promise.all([api.prospect(id), api.prospectEvents(id)]).then(([rows, ev]) => {
    const row = Array.isArray(rows) ? rows[0] : rows;
    setP(row); setEvents(ev || []);
    setF({ contact: row?.contact_name || "", email: row?.email || "", phone: row?.phone || "", address: row?.address || "", city: row?.city || "", summary: row?.summary || "", turnover: row?.turnover || "", notes: row?.notes || "" });
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (p === undefined) return <div className="center">{t("Loading…", "Chargement…")}</div>;
  if (!p) return <p>{t("Not found.", "Introuvable.")}</p>;

  const badge = (s: string) => <span style={{ background: (STAGE_TONE[s] || "#6b7280") + "22", color: STAGE_TONE[s] || "#333", padding: "3px 11px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>{s}</span>;
  const d = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
  const save = async () => { await api.prospectUpdate(id, f); setEdit(false); load(); };
  const setStage = async (s: string) => { await api.prospectStage(id, s); load(); };
  // Only mark "pending" once the PDF is actually fetched + saved (not on a click).
  const download = async () => {
    if (!p.letter_url) { setErr(t("No letter for this prospect yet.", "Aucune lettre pour ce prospect.")); return; }
    try {
      const res = await fetch(p.letter_url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = `Kolis - ${p.business_name}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
      await api.prospectDownloaded(id); load();
    } catch (e: any) { setErr(t("Download failed — status unchanged.", "Échec du téléchargement — statut inchangé.") + " " + e.message); }
  };
  const contacted = async () => { await api.prospectContacted(id); load(); };
  const getAdvice = async (task?: string) => {
    setAiBusy(true); if (!task) setAdvice("");
    try {
      const res = await api.prospectAdvice(id, task);
      setAdvice(res.suggestions || res.message || res.error || t("No output.", "Aucun résultat."));
    } catch (e: any) { setAdvice(e.message); }
    setAiBusy(false);
  };

  const Field = ({ l, v }: { l: string; v: any }) => (
    <div style={{ marginBottom: 8 }}><div style={{ color: "#9b97a6", fontSize: 11 }}>{l}</div><div>{v || "—"}</div></div>
  );

  return (
    <>
      <button className="chip" onClick={() => router.push("/admin/prospects")}>← {t("All prospects", "Tous les prospects")}</button>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <h1 style={{ margin: 0 }}>{p.business_name}</h1>
        {badge(p.stage)}
      </div>
      <div className="sub">{p.tier ? `Tier ${p.tier} · ` : ""}{p.category || ""}</div>
      {err && <div className="warn">{err}</div>}

      <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button className="chip" onClick={download}>{t("Download letter", "Télécharger la lettre")}</button>
        {p.stage !== "met" && <button className="chip" onClick={contacted}>{t("Mark contacted", "Marquer contacté")}</button>}
        <button className="chip" onClick={() => setStage("replied")}>{t("Replied", "A répondu")}</button>
        <button className="chip" onClick={() => setStage("won")}>{t("Won", "Gagné")}</button>
        <button className="chip" onClick={() => setStage("lost")}>{t("Lost", "Perdu")}</button>
        <button className="chip" onClick={() => setEdit(!edit)}>{edit ? t("Cancel", "Annuler") : t("Edit", "Modifier")}</button>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Profile */}
        <div className="tile" style={{ flex: "1 1 320px", textAlign: "left" }}>
          <h3 style={{ marginTop: 0 }}>{t("Profile", "Profil")}</h3>
          {!edit ? (
            <>
              <Field l={t("Contact", "Contact")} v={p.contact_name} />
              <Field l="Email" v={p.email || (p.stage !== "to_prospect" ? "⚠ " + t("needs email", "courriel manquant") : "—")} />
              <Field l={t("Phone", "Téléphone")} v={p.phone} />
              <Field l={t("Address", "Adresse")} v={[p.address, p.city].filter(Boolean).join(", ")} />
              <Field l={t("What they do", "Ce qu'ils font")} v={p.summary} />
              <Field l={t("Turnover / size", "Chiffre d'affaires / taille")} v={p.turnover} />
              <Field l={t("Notes", "Notes")} v={p.notes} />
            </>
          ) : (
            <>
              {["contact", "email", "phone", "address", "city", "turnover"].map((k) => (
                <input key={k} className="input" placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              ))}
              <textarea className="input" placeholder={t("What they do", "Ce qu'ils font")} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
              <textarea className="input" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              <button className="btn" onClick={save}>{t("Save", "Enregistrer")}</button>
            </>
          )}
        </div>

        {/* Engagement */}
        <div className="tile" style={{ flex: "1 1 320px", textAlign: "left" }}>
          <h3 style={{ marginTop: 0 }}>{t("Engagement", "Engagement")}</h3>
          <div className="row" style={{ gap: 16, marginBottom: 10 }}>
            <div><b style={{ fontSize: 22, color: "#178a5e" }}>{p.opens}</b><div style={{ color: "#9b97a6", fontSize: 11 }}>{t("opens", "ouvertures")}</div></div>
            <div><b style={{ fontSize: 22, color: "#E11D6B" }}>{p.clicks}</b><div style={{ color: "#9b97a6", fontSize: 11 }}>{t("clicks", "clics")}</div></div>
          </div>
          <div style={{ color: "#9b97a6", fontSize: 11, marginBottom: 4 }}>{t("Follow-up", "Relance")}</div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            {p.followup_sent_at ? `✅ ${t("sent", "envoyée")} ${d(p.followup_sent_at)}` :
              p.followup_due_at ? `⏳ ${t("due", "prévue")} ${d(p.followup_due_at)}` :
              p.stage === "met" && !p.email ? `⚠ ${t("needs email to schedule", "courriel requis")}` : "—"}
          </div>
          <div style={{ color: "#9b97a6", fontSize: 11, marginBottom: 4 }}>{t("Timeline", "Historique")}</div>
          {events.length === 0 ? <div style={{ fontSize: 13, color: "#9b97a6" }}>{t("No engagement yet.", "Aucun engagement.")}</div> :
            events.map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: "3px 0", borderTop: i ? "1px solid #f0f0f4" : "none" }}>
                {e.type === "opened" ? "👁" : e.type === "clicked" ? "🔗" : e.type === "delivered" ? "📨" : "•"} <b>{e.type}</b>
                {e.link ? <span style={{ color: "#6B6675" }}> · {e.link.replace(/^https?:\/\//, "").slice(0, 40)}</span> : ""}
                <span style={{ color: "#9b97a6", float: "right" }}>{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            ))}
        </div>
      </div>

      {/* AI advisor */}
      <div className="tile" style={{ textAlign: "left", marginTop: 20, borderLeft: "3px solid #E11D6B" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>🤖 {t("AI — win this contract", "IA — décrocher le contrat")}</h3>
          <button className="btn" onClick={() => getAdvice()} disabled={aiBusy}>{aiBusy ? t("Working…", "En cours…") : t("Suggest next steps", "Suggérer")}</button>
        </div>
        {advice && (
          <>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 12, fontSize: 14, lineHeight: 1.55 }}>{advice}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <span style={{ color: "#9b97a6", fontSize: 12, alignSelf: "center" }}>{t("Have the AI write it:", "Faire rédiger par l'IA :")}</span>
              <button className="chip" onClick={() => getAdvice("micro_proposal")} disabled={aiBusy}>✍️ {t("Micro-proposal", "Micro-proposition")}</button>
              <button className="chip" onClick={() => getAdvice("email")} disabled={aiBusy}>✉️ {t("Email", "Courriel")}</button>
              <button className="chip" onClick={() => getAdvice("call_script")} disabled={aiBusy}>📞 {t("Call script", "Script d'appel")}</button>
              <button className="chip" onClick={() => navigator.clipboard?.writeText(advice)}>📋 {t("Copy", "Copier")}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
