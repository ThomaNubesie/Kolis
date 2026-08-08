"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

type P = {
  id: string; business_name: string; category: string | null; tier: number | null; contact_name: string | null;
  email: string | null; phone: string | null; stage: string; letter_url: string | null;
  followup_due_at: string | null; followup_sent_at: string | null; opens: number; clicks: number;
  // Urgency level for the row (from concord_level via kolis_prospects_list).
  level: string | null; level_label: string | null; level_color: string | null; level_order: number | null;
};

// FR labels for each urgency level key (colour comes from the backend level_color).
const LEVEL_LABEL: Record<string, [string, string]> = {
  suggested: ["Suggested", "Suggéré"], new: ["New / Queued", "Nouveau / En file"], contacted: ["Contacted", "Contacté"],
  engaged: ["Engaged", "Engagé"], replied: ["Replied", "A répondu"], met: ["Met / Won", "Rencontré / Gagné"],
  closed: ["Closed", "Fermé"], bounced: ["Bounced", "Courriel rejeté"], stopped: ["Stopped", "Arrêté"], rejected: ["Rejected", "Refusé"],
};
// Legend key — mirrors concord_level() colours + order (ord 1→10) for the swatch strip.
const LEVEL_COLOR: Record<string, string> = {
  suggested: "#64748B", new: "#2563EB", contacted: "#F59E0B", engaged: "#14B8A6", replied: "#7C3AED",
  met: "#16A34A", closed: "#334155", bounced: "#EA580C", stopped: "#9CA3AF", rejected: "#DC2626",
};
const LEVEL_ORDER = ["suggested", "new", "contacted", "engaged", "replied", "met", "closed", "bounced", "stopped", "rejected"];
// Non-level quick filters; the colour key below handles filtering by state.
const FILTERS: [string, string, string][] = [
  ["", "All", "Tous"], ["tier1", "Tier 1", "Niveau 1"], ["needs_email", "Needs email", "Sans courriel"],
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

  // Urgency pill — colour from the backend level_color, label localised by level key.
  const levelPill = (p: P) => {
    const c = p.level_color || "#6b7280";
    const label = (p.level && LEVEL_LABEL[p.level]?.[lang === "fr" ? 1 : 0]) || p.level_label || p.stage;
    return <span style={{ background: c + "22", color: c, padding: "2px 9px", borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>;
  };

  // Fetch the actual PDF bytes and save the file; only flip to "pending" once the
  // download truly succeeds (not on a mere click or a failed/blocked fetch).
  const download = async (p: P) => {
    if (!p.letter_url) { setErr(t("No letter for this prospect yet.", "Aucune lettre pour ce prospect.")); return; }
    try {
      const res = await fetch(p.letter_url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = `Kolis - ${p.business_name}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
      await api.prospectDownloaded(p.id); // mark pending ONLY after a real download
      load();
    } catch (e: any) { setErr(t("Download failed — status unchanged.", "Échec du téléchargement — statut inchangé.") + " " + e.message); }
  };
  const contacted = async (p: P) => { await api.prospectContacted(p.id); load(); };
  const reopen = async (p: P) => {
    if (!confirm(t(`Reopen "${p.business_name}" into the active queue?`, `Rouvrir « ${p.business_name} » dans la file active ?`))) return;
    try { await api.prospectReopen(p.id); load(); } catch (e: any) { setErr(e.message); }
  };
  // Terminal states that can be reopened (from concord_level level keys).
  const TERMINAL = new Set(["closed", "stopped", "rejected", "bounced"]);

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

      {/* Colour key — click a colour to filter the board to that state */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: "#6B6675" }}>{t("Key", "Légende")}:</span>
        {LEVEL_ORDER.map((k) => {
          const active = filter === k;
          return (
            <button key={k} onClick={() => setFilter(active ? "" : k)} title={t("Filter to this state", "Filtrer par cet état")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", cursor: "pointer",
                border: `1px solid ${active ? LEVEL_COLOR[k] : "#e2ddd0"}`, background: active ? LEVEL_COLOR[k] + "1f" : "#fff",
                color: active ? LEVEL_COLOR[k] : "#6B6675", fontWeight: active ? 700 : 500, borderRadius: 20, padding: "4px 11px", fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: LEVEL_COLOR[k], display: "inline-block" }} />
              {LEVEL_LABEL[k][lang === "fr" ? 1 : 0]}
            </button>
          );
        })}
      </div>

      {err && <div className="warn">{err}</div>}
      {!rows ? <div className="center">{t("Loading…", "Chargement…")}</div> :
        rows.length === 0 ? <p>{t("No prospects.", "Aucun prospect.")}</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "#6B6675", fontSize: 12 }}>
              <th style={{ padding: "8px 6px" }}>{t("Business", "Entreprise")}</th><th>{t("State", "État")}</th>
              <th>{t("Contact", "Contact")}</th><th>{t("Opens", "Ouv.")}</th><th>{t("Clicks", "Clics")}</th><th></th>
            </tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #ECECF2", cursor: "pointer" }} onClick={() => router.push(`/admin/prospects/${p.id}`)}>
                <td style={{ padding: "10px 6px 10px 12px", borderLeft: `5px solid ${p.level_color || "#e5e7eb"}` }}>
                  <b>{p.business_name}</b>
                  <div style={{ color: "#9b97a6", fontSize: 12 }}>{p.tier ? `T${p.tier} · ` : ""}{p.category || ""}</div>
                </td>
                <td>{levelPill(p)}</td>
                <td style={{ fontSize: 12 }}>
                  {p.email || p.phone || "—"}
                  {!p.email && p.stage !== "to_prospect" && <span className="pill pred" style={{ marginLeft: 6 }}>{t("needs email", "courriel ?")}</span>}
                </td>
                <td>{p.opens > 0 ? `✅ ${p.opens}` : "—"}</td>
                <td>{p.clicks > 0 ? `🔗 ${p.clicks}` : "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <button className="chip" onClick={() => download(p)}>{t("Letter", "Lettre")}</button>{" "}
                  {p.level && TERMINAL.has(p.level)
                    ? <button className="chip" onClick={() => reopen(p)}>↻ {t("Reopen", "Rouvrir")}</button>
                    : p.stage !== "met" && p.stage !== "won" && p.stage !== "lost" &&
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
