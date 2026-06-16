"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = { draft: "pgrey", open: "pgold", paid: "pg", void: "pgrey", uncollectible: "pred" };
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

export default function Invoices() {
  const { active } = useOrg();
  const { t } = useLang();
  // Display label for a backend invoice-status key.
  const statusLabel = (s: string) => ({
    draft: t("draft", "brouillon"), open: t("open", "ouverte"), paid: t("paid", "payée"),
    void: t("void", "annulée"), uncollectible: t("uncollectible", "irrécouvrable"),
  } as Record<string, string>)[s] || s;
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { org.invoices(active.org_id).then(setRows).catch(() => {}); }, [active.org_id]);

  const open = rows.filter((i) => i.status === "open");
  const outstanding = open.reduce((s, i) => s + (i.total_cents || 0), 0);
  const draft = rows.find((i) => i.status === "draft");

  return (
    <>
      <h1>{t("Invoices", "Factures")}</h1>
      <div className="sub">{t(`${active.name} · net-${active && (rows[0]?.net_terms_days ?? "")} terms — shipments accrue all cycle and bill once.`, `${active.name} · conditions net-${active && (rows[0]?.net_terms_days ?? "")} — les envois s’accumulent tout le cycle et sont facturés en une fois.`)}</div>
      <div className="tiles">
        <div className="tile"><div className="l">{t("Current cycle (open draft)", "Cycle en cours (brouillon ouvert)")}</div><div className="n">{draft ? money(draft.total_cents) : "—"}</div></div>
        <div className="tile"><div className="l">{t("Outstanding", "Solde dû")}</div><div className="n">{money(outstanding)}</div></div>
        <div className="tile"><div className="l">{t("Invoices", "Factures")}</div><div className="n">{rows.length}</div></div>
      </div>
      <table>
        <thead><tr><th>{t("Period", "Période")}</th><th>{t("Status", "Statut")}</th><th>{t("Subtotal", "Sous-total")}</th><th>{t("Tax", "Taxes")}</th><th>{t("Total", "Total")}</th><th>{t("Due", "Échéance")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>{fmt(i.period_start)} – {fmt(i.period_end)}</td>
              <td><span className={"pill " + (STATUS[i.status] || "pgrey")}>{statusLabel(i.status)}</span></td>
              <td>{money(i.subtotal_cents)}</td><td>{money(i.tax_cents)}</td><td><b>{money(i.total_cents)}</b></td>
              <td>{i.status === "draft" ? "—" : fmt(i.due_at)}</td>
              <td><Link href={`/shipper/invoices/${i.id}`} style={{ color: "var(--accent)", fontWeight: 800 }}>{t("View", "Voir")}</Link></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>{t("No invoices yet — they’re generated when each billing cycle closes.", "Aucune facture pour l’instant — elles sont générées à la clôture de chaque cycle de facturation.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
