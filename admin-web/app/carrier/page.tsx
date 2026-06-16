"use client";
import { useCallback, useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "+$" + Math.round((c || 0) / 100);
const COLS: { key: string; label: string; fr: string; statuses: string[] }[] = [
  { key: "offered", label: "Offered", fr: "Offerts", statuses: ["requested", "received_at_hub"] },
  { key: "matched", label: "Assigned", fr: "Assignés", statuses: ["matched", "dispatched"] },
  { key: "picked_up", label: "Picked up", fr: "Ramassés", statuses: ["picked_up", "in_transit"] },
  { key: "delivered", label: "Delivered", fr: "Livrés", statuses: ["delivered"] },
];

export default function Dispatch() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const canDispatch = ["owner", "admin", "dispatcher"].includes(active.role);
  const [board, setBoard] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    org.board(active.org_id).then(setBoard).catch(() => {});
    org.drivers(active.org_id).then(setDrivers).catch(() => {});
  }, [active.org_id]);
  useEffect(() => { load(); }, [load]);

  const eligible = drivers.filter((d) => d.identity_verified && (d.kolis_role === "courier" || d.kolis_role === "both"));

  const assign = async (parcel: string, driver: string) => {
    if (!driver) return;
    setBusy(parcel); setErr("");
    try { const ok = await org.assign(active.org_id, parcel, driver); if (!ok) setErr(t("Could not assign (already taken?).", "Impossible d’assigner (déjà pris?).")); load(); }
    catch (e: any) { setErr(e?.message || t("Assign failed.", "Échec de l’assignation.")); }
    setBusy(null);
  };
  const advance = async (parcel: string, to: string) => {
    setBusy(parcel); setErr("");
    try { await org.advance(active.org_id, parcel, to); load(); }
    catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(null);
  };
  const nextStatus = (s: string) => (s === "matched" || s === "dispatched" ? "picked_up" : s === "picked_up" ? "in_transit" : s === "in_transit" ? "delivered" : null);
  const statusLabel = (s: string) => ({ picked_up: t("picked up", "ramassé"), in_transit: t("in transit", "en transit"), delivered: t("delivered", "livré") }[s] || s.replace(/_/g, " "));

  return (
    <>
      <h1>{t("Dispatch board", "Tableau de répartition")}</h1>
      <div className="sub">{active.name} · {eligible.length} {t("eligible driver(s)", "chauffeur(s) admissible(s)")} · {t("offers preferred to your fleet", "offres prioritaires à votre flotte")}</div>
      {err ? <div className="warn">{err}</div> : null}
      <div className="cols">
        {COLS.map((col) => {
          const items = board.filter((p) => col.statuses.includes(p.status) && (col.key === "offered" ? !p.mine : p.mine));
          return (
            <div key={col.key} style={{ flex: 1, minWidth: 220 }}>
              <p className="mono">{lang === "fr" ? col.fr : col.label} ({items.length})</p>
              {items.map((p) => (
                <div className="card" key={p.id} style={{ marginBottom: 8 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>{p.code}</b><span className="pill pg">{money(p.driver_payout_cents)}</span>
                  </div>
                  <div className="sub" style={{ margin: "4px 0 8px" }}>{p.from_city} → {p.to_city} · {p.size}</div>
                  {col.key === "offered" && canDispatch && (
                    <select className="input" style={{ padding: 7 }} disabled={busy === p.id} defaultValue=""
                      onChange={(e) => assign(p.id, e.target.value)}>
                      <option value="" disabled>{t("Assign driver…", "Assigner un chauffeur…")}</option>
                      {eligible.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name || t("Driver", "Chauffeur")}</option>)}
                    </select>
                  )}
                  {p.mine && p.driver_name && <div style={{ fontSize: 12 }}>{p.driver_name}</div>}
                  {p.mine && canDispatch && nextStatus(p.status) && (
                    <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy === p.id} onClick={() => advance(p.id, nextStatus(p.status)!)}>
                      {t("Mark", "Marquer")} {statusLabel(nextStatus(p.status)!)}
                    </button>
                  )}
                </div>
              ))}
              {items.length === 0 && <div className="sub">—</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
