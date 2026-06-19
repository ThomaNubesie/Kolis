"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

type P = {
  id: string; business_name: string; category: string | null; tier: number | null; contact_name: string | null;
  email: string | null; phone: string | null; stage: string; letter_url: string | null;
  followup_due_at: string | null; followup_sent_at: string | null; opens: number; clicks: number;
};

const STAGE_TONE: Record<string, string> = { to_prospect: "#6b7280", pending: "#b45309", met: "#2563eb", replied: "#7c3aed", won: "#178a5e", lost: "#b91c1c" };
const STAGE_LABEL: Record<string, [string, string]> = {
  to_prospect: ["To prospect", "À prospecter"], pending: ["Pending", "En attente"], met: ["Met", "Contacté"],
  replied: ["Replied", "A répondu"], won: ["Won", "Gagné"], lost: ["Lost", "Perdu"],
};
const FILTERS: [string, string, string][] = [
  ["", "All", "Tous"], ["tier1", "Tier 1", "Niveau 1"], ["tier2", "Tier 2", "Niveau 2"],
  ["needs_email", "Needs email", "Sans courriel"], ["to_prospect", "To prospect", "À prospecter"],
  ["pending", "Pending", "En attente"], ["met", "Met", "Contacté"], ["won", "Won", "Gagné"],
];

export default function Prospects() {
  const router = useRouter();
  const { t, lang } = useLang();
  const [rows, setRows] = useState<P[] | null>(null);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");
  const [add, setAdd] = useState(false);
  const [f, setF] = useState<any>({ name: "", category: "medical-lab", tier: "", contact: "", email: "", phone: "", address: "", city: "", summary: "", turnover: "" });

  const load = (flt = filter) => api.prospects(flt || null).then((d) => { setErr(""); setRows(d as P[]); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const stage = (s: string) => (
    <span style={{ background: (STAGE_TONE[s] || "#6b7280") + "22", color: STAGE_TONE[s] || "#333", padding: "2px 9px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{(STAGE_LABEL[s] || [s, s])[lang === "fr" ? 1 : 0]}</span>
  );

  const download = async (p: P) => {
    if (p.letter_url) window.open(p.letter_url, "_blank");
    await api.prospectDownloaded(p.id); load();
  };
  const contacted = async (p: P) => { await api.prospectContacted(p.id); load(); };

  const submitAdd = async () => {
    if (!f.name.trim()) return;
    await api.prospectAdd({ ...f, tier: f.tier ? Number(f.tier) : null });
    setAdd(false); setF({ name: "", category: "medical-lab", tier: "", contact: "", email: "", phone: "", address: "", city: "", summary: "", turnover: "" });
    load();
  };

  const counts = rows ? {
    total: rows.length,
    met: rows.filter((r) => r.stage === "met").length,
    pending: rows.filter((r) => r.stage === "pending").length,
    won: rows.filter((r) => r.stage === "won").length,
  } : null;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("Prospects", "Prospects")}</h1>
        <button className="btn" onClick={() => setAdd(true)}>+ {t("Add prospect", "Ajouter")}</button>
      </div>
      <div className="sub">{t("Kolis · Business sales pipeline — letters, follow-ups & engagement", "Pipeline de vente Kolis · Business — lettres, relances et engagement")}</div>

      {counts && (
        <div className="tiles" style={{ marginBottom: 14 }}>
          <div className="tile"><div className="l">{t("Prospects", "Prospects")}</div><div className="n">{counts.total}</div></div>
          <div className="tile"><div className="l">{t("Pending", "En attente")}</div><div className="n" style={{ color: "#b45309" }}>{counts.pending}</div></div>
          <div className="tile"><div className="l">{t("Met", "Contacté")}</div><div className="n" style={{ color: "#2563eb" }}>{counts.met}</div></div>
          <div className="tile"><div className="l">{t("Won", "Gagné")}</div><div className="n" style={{ color: "#178a5e" }}>{counts.won}</div></div>
        </div>
      )}

      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {FILTERS.map(([v, en, fr]) => (
          <button key={v} className={"chip" + (filter === v ? " on" : "")} onClick={() => setFilter(v)}>{lang === "fr" ? fr : en}</button>
        ))}
      </div>

      {err && <div className="warn">{err}</div>}
      {!rows ? <div className="center">{t("Loading…", "Chargement…")}</div> :
        rows.length === 0 ? <p>{t("No prospects.", "Aucun prospect.")}</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "#6B6675", fontSize: 12 }}>
              <th style={{ padding: "8px 6px" }}>{t("Business", "Entreprise")}</th><th>{t("Stage", "Étape")}</th>
              <th>{t("Contact", "Contact")}</th><th>{t("Opens", "Ouv.")}</th><th>{t("Clicks", "Clics")}</th><th></th>
            </tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #ECECF2", cursor: "pointer" }} onClick={() => router.push(`/admin/prospects/${p.id}`)}>
                <td style={{ padding: "10px 6px" }}>
                  <b>{p.business_name}</b>
                  <div style={{ color: "#9b97a6", fontSize: 12 }}>{p.tier ? `T${p.tier} · ` : ""}{p.category || ""}</div>
                </td>
                <td>{stage(p.stage)}</td>
                <td style={{ fontSize: 12 }}>
                  {p.email || p.phone || "—"}
                  {!p.email && p.stage !== "to_prospect" && <span className="pill pred" style={{ marginLeft: 6 }}>{t("needs email", "courriel ?")}</span>}
                </td>
                <td>{p.opens > 0 ? `✅ ${p.opens}` : "—"}</td>
                <td>{p.clicks > 0 ? `🔗 ${p.clicks}` : "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <button className="chip" onClick={() => download(p)}>{t("Letter", "Lettre")}</button>{" "}
                  {p.stage !== "met" && p.stage !== "won" && p.stage !== "lost" &&
                    <button className="chip" onClick={() => contacted(p)}>{t("Contacted", "Contacté")}</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}

      {add && (
        <div className="modalbg" onClick={() => setAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t("Add prospect", "Ajouter un prospect")}</h3>
            <input className="input" placeholder={t("Business name", "Nom de l'entreprise")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="medical-lab">{t("Medical lab", "Labo médical")}</option>
              <option value="environmental-lab">{t("Environmental lab", "Labo environnemental")}</option>
              <option value="hospital-lab">{t("Hospital lab", "Labo hospitalier")}</option>
              <option value="auto-parts">{t("Auto parts", "Pièces d'auto")}</option>
              <option value="grocery">{t("Grocery", "Épicerie")}</option>
              <option value="other">{t("Other", "Autre")}</option>
            </select>
            <input className="input" placeholder={t("Tier (1-3)", "Niveau (1-3)")} value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} />
            <input className="input" placeholder={t("Contact name", "Personne-ressource")} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
            <input className="input" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input className="input" placeholder={t("Phone", "Téléphone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input className="input" placeholder={t("Address", "Adresse")} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <input className="input" placeholder={t("City", "Ville")} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            <textarea className="input" placeholder={t("What they do (summary)", "Ce qu'ils font (résumé)")} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
            <input className="input" placeholder={t("Turnover / size", "Chiffre d'affaires / taille")} value={f.turnover} onChange={(e) => setF({ ...f, turnover: e.target.value })} />
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn" onClick={submitAdd}>{t("Add", "Ajouter")}</button>
              <button className="btn ghost" onClick={() => setAdd(false)}>{t("Cancel", "Annuler")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
