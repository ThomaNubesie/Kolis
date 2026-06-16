"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

export default function Payouts() {
  const { active } = useOrg();
  const { t } = useLang();
  const [pending, setPending] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);

  useEffect(() => {
    org.pendingPayouts(active.org_id).then(setPending).catch(() => {});
    org.payoutStatements(active.org_id).then(setStatements).catch(() => {});
  }, [active.org_id]);

  const pendingGross = pending.reduce((s, p) => s + (p.gross_cents || 0), 0);
  const statusLabel = (s: string) => ({ paid: t("paid", "payé"), pending: t("pending", "en attente") }[s] || s);
  const view = async (id: string) => setOpen(await org.payoutStatement(active.org_id, id).catch(() => null));

  return (
    <>
      <h1>{t("Payout statements", "Relevés de paiements")}</h1>
      <div className="sub">{active.name} · {t("Kolis pays the fleet one consolidated Interac transfer per cycle, net of platform fee.", "Kolis verse à la flotte un seul virement Interac consolidé par cycle, net des frais de plateforme.")}</div>

      <div className="tiles">
        <div className="tile"><div className="l">{t("Pending (this cycle, gross)", "En attente (ce cycle, brut)")}</div><div className="n">{money(pendingGross)}</div></div>
        <div className="tile"><div className="l">{t("Statements", "Relevés")}</div><div className="n">{statements.length}</div></div>
        <div className="tile"><div className="l">{t("Last paid", "Dernier paiement")}</div><div className="n">{money(statements.find((s) => s.status === "paid")?.net_cents || 0)}</div></div>
      </div>

      <div className="toolbar"><h1 style={{ fontSize: 16 }}>{t("Statements", "Relevés")}</h1></div>
      <table>
        <thead><tr><th>{t("Period", "Période")}</th><th>{t("Status", "Statut")}</th><th>{t("Gross", "Brut")}</th><th>{t("Platform fee", "Frais de plateforme")}</th><th>{t("Net", "Net")}</th><th></th></tr></thead>
        <tbody>
          {statements.map((s) => (
            <tr key={s.id}>
              <td>{fmt(s.period_start)} – {fmt(s.period_end)}</td>
              <td><span className={"pill " + (s.status === "paid" ? "pg" : "pgold")}>{statusLabel(s.status)}</span></td>
              <td>{money(s.gross_cents)}</td><td>−{money(s.platform_fee_cents)}</td><td><b>{money(s.net_cents)}</b></td>
              <td><button className="btn ghost" onClick={() => view(s.id)}>{t("Breakdown", "Détail")}</button></td>
            </tr>
          ))}
          {statements.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No statements yet — generated when the payout cycle closes.", "Aucun relevé pour l’instant — généré à la clôture du cycle de paiement.")}</td></tr>}
        </tbody>
      </table>

      {open && (
        <div className="modalbg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18 }}>{t("Statement breakdown", "Détail du relevé")}</h1>
            <div className="sub">{fmt(open.statement.period_start)} – {fmt(open.statement.period_end)} · {t("net", "net")} {money(open.statement.net_cents)}{open.statement.interac_ref ? ` · ${open.statement.interac_ref}` : ""}</div>
            <table>
              <thead><tr><th>{t("Driver", "Chauffeur")}</th><th>{t("Parcels", "Colis")}</th><th>{t("Gross", "Brut")}</th></tr></thead>
              <tbody>
                {(open.lines || []).map((l: any) => (
                  <tr key={l.driver_id}><td>{l.driver_name || "—"}</td><td>{l.parcels}</td><td>{money(l.gross_cents)}</td></tr>
                ))}
              </tbody>
            </table>
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setOpen(null)}>{t("Close", "Fermer")}</button>
          </div>
        </div>
      )}
    </>
  );
}
