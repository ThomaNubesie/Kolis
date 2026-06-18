"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Concord Express → Kolis · Business sales outreach dashboard. Reads
// concord_outreach_dashboard() (staff-gated) — recipients with open/click counts
// + follow-up state — and lets staff stop/reactivate follow-ups.
type Row = {
  business_name: string; email: string; status: string; touch_count: number;
  initial_sent_at: string; last_sent_at: string | null; next_due_at: string | null;
  opened_at: string | null; clicked_at: string | null; bounced_at: string | null;
  opens: number; clicks: number;
};

const TONE: Record<string, string> = { active: "#178a5e", clicked: "#E11D6B", replied: "#2563eb", bounced: "#b91c1c", stopped: "#6b7280", done: "#6b7280" };

export default function Outreach() {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  const load = () => supabase.rpc("concord_outreach_dashboard").then(({ data, error }) => {
    if (error) setErr(error.message); else { setErr(""); setRows((data || []) as Row[]); }
  });
  useEffect(() => { load(); }, []);

  const setStatus = async (email: string, status: string) => {
    await supabase.rpc("concord_outreach_set_status", { p_email: email, p_status: status });
    load();
  };
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
  const badge = (st: string) => (
    <span style={{ background: (TONE[st] || "#6b7280") + "22", color: TONE[st] || "#333", padding: "2px 9px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{st}</span>
  );

  const totals = rows ? {
    n: rows.length,
    opened: rows.filter((r) => r.opens > 0).length,
    clicked: rows.filter((r) => r.clicks > 0).length,
    active: rows.filter((r) => r.status === "active").length,
  } : null;

  return (
    <>
      <h1>{t("Outreach", "Prospection")}</h1>
      <div className="sub">{t("Kolis · Business sales campaign — opens, clicks & follow-ups", "Campagne Kolis · Business — ouvertures, clics et relances")}</div>

      {totals && (
        <div className="tiles" style={{ marginBottom: 18 }}>
          <div className="tile"><div className="l">{t("Recipients", "Destinataires")}</div><div className="n">{totals.n}</div></div>
          <div className="tile"><div className="l">{t("Opened", "Ouvert")}</div><div className="n" style={{ color: "#178a5e" }}>{totals.opened}</div></div>
          <div className="tile"><div className="l">{t("Clicked", "Cliqué")}</div><div className="n" style={{ color: "#E11D6B" }}>{totals.clicked}</div></div>
          <div className="tile"><div className="l">{t("Active follow-ups", "Relances actives")}</div><div className="n">{totals.active}</div></div>
        </div>
      )}

      {err && <div className="warn">{err}</div>}
      {!rows ? <div className="center">{t("Loading…", "Chargement…")}</div> :
        rows.length === 0 ? <p>{t("No recipients yet.", "Aucun destinataire pour l’instant.")}</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "#6B6675", fontSize: 12 }}>
              <th style={{ padding: "8px 6px" }}>{t("Business", "Entreprise")}</th>
              <th>{t("Status", "Statut")}</th><th>{t("Touch", "Relance")}</th>
              <th>{t("Opens", "Ouvertures")}</th><th>{t("Clicks", "Clics")}</th>
              <th>{t("Next follow-up", "Prochaine relance")}</th><th></th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.email} style={{ borderTop: "1px solid #ECECF2" }}>
                <td style={{ padding: "10px 6px" }}><b>{r.business_name}</b><br /><span style={{ color: "#9b97a6", fontSize: 12 }}>{r.email}</span></td>
                <td>{badge(r.status)}</td>
                <td>{r.touch_count}/3</td>
                <td>{r.opens > 0 ? `✅ ${r.opens}` : "—"}</td>
                <td>{r.clicks > 0 ? `🔗 ${r.clicks}` : "—"}</td>
                <td>{r.status === "active" ? d(r.next_due_at) : "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.status === "active" ? (
                    <>
                      <button className="chip" onClick={() => setStatus(r.email, "replied")}>{t("Replied", "Répondu")}</button>{" "}
                      <button className="chip" onClick={() => setStatus(r.email, "stopped")}>{t("Stop", "Arrêter")}</button>
                    </>
                  ) : (
                    <button className="chip" onClick={() => setStatus(r.email, "active")}>{t("Reactivate", "Réactiver")}</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      <div style={{ marginTop: 16 }}><button className="btn" onClick={load}>{t("Refresh", "Actualiser")}</button></div>
    </>
  );
}
