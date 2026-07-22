"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Incoming "Book a quick call" requests from business.kolis.ca. Emailed to the
// sales inboxes AND logged to kolis_call_requests; this is the working queue.
const FILTERS: [string, string, string][] = [["all", "All", "Tous"], ["new", "New", "Nouveaux"], ["called", "Called", "Appelés"], ["done", "Done", "Terminés"]];
const PREF: Record<string, [string, string]> = { morning: ["Morning", "Matin"], afternoon: ["Afternoon", "Après-midi"], evening: ["Evening", "Soir"] };
const when = (s?: string) => (s ? new Date(s).toLocaleString() : "—");

export default function CallRequests() {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState("all");
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((f = filter) => {
    setLoading(true);
    api.callRequests(f === "all" ? null : f).then((d) => { setList(d || []); }).catch(() => setList([])).finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load("all"); }, []); // eslint-disable-line

  const setStatus = async (id: string, status: string) => {
    try { await api.callRequestStatus(id, status); load(); } catch (e: any) { alert(e?.message); }
  };

  const badge = (s: string) => {
    const map: Record<string, { bg: string; c: string; en: string; fr: string }> = {
      new: { bg: "#FBF3F7", c: "#9c1048", en: "New", fr: "Nouveau" },
      called: { bg: "#eef4ff", c: "#2456c9", en: "Called", fr: "Appelé" },
      done: { bg: "#eafaf5", c: "#178a5e", en: "Done", fr: "Terminé" },
    };
    const v = map[s] || map.new;
    return <span style={{ background: v.bg, color: v.c, fontWeight: 700, fontSize: 12, padding: "3px 9px", borderRadius: 20 }}>{lang === "fr" ? v.fr : v.en}</span>;
  };

  return (
    <>
      <h1>{t("Call requests", "Demandes d'appel")}</h1>
      <div className="sub" style={{ marginBottom: 10 }}>{t(
        "“Book a quick call” submissions from business.kolis.ca. Also emailed to marketing@concordexpress.ca and shaloderick@gmail.com.",
        "Demandes « Réserver un appel » depuis business.kolis.ca. Aussi envoyées à marketing@concordexpress.ca et shaloderick@gmail.com.")}</div>
      <div className="toolbar">
        {FILTERS.map(([f, en, fr]) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); load(f); }}>{lang === "fr" ? fr : en}</button>)}
        <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => load()}>↻ {t("Refresh", "Actualiser")}</button>
      </div>

      <table>
        <thead><tr>
          <th>{t("When", "Quand")}</th><th>{t("Name", "Nom")}</th><th>{t("Business", "Entreprise")}</th>
          <th>{t("Phone", "Téléphone")}</th><th>{t("Email", "Courriel")}</th><th>{t("Best time", "Moment")}</th>
          <th>{t("Note", "Note")}</th><th>{t("Status", "Statut")}</th><th></th>
        </tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td style={{ whiteSpace: "nowrap", color: "var(--t3)" }}>{when(c.created_at)}</td>
              <td><b>{c.name}</b></td>
              <td>{c.business || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}><a href={`tel:${c.phone}`}>{c.phone}</a></td>
              <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</td>
              <td>{c.preferred ? (lang === "fr" ? (PREF[c.preferred]?.[1] || c.preferred) : (PREF[c.preferred]?.[0] || c.preferred)) : "—"}</td>
              <td style={{ maxWidth: 220, whiteSpace: "normal" }}>{c.note || "—"}</td>
              <td>{badge(c.status)}</td>
              <td><div className="row" style={{ gap: 6 }}>
                {c.status !== "called" && <button className="btn ghost" onClick={() => setStatus(c.id, "called")}>{t("Mark called", "Appelé")}</button>}
                {c.status !== "done" && <button className="btn" onClick={() => setStatus(c.id, "done")}>{t("Done", "Terminé")}</button>}
                {c.status !== "new" && <button className="btn ghost" onClick={() => setStatus(c.id, "new")}>↩︎</button>}
              </div></td>
            </tr>
          ))}
          {!loading && list.length === 0 && <tr><td colSpan={9} style={{ color: "var(--t3)" }}>{t("No call requests yet.", "Aucune demande d'appel pour l'instant.")}</td></tr>}
          {loading && <tr><td colSpan={9} style={{ color: "var(--t3)" }}>{t("Loading…", "Chargement…")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
