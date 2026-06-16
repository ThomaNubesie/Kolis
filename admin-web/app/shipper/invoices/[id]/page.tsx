"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");
const STATUS: Record<string, string> = { draft: "pgrey", open: "pgold", paid: "pg", void: "pgrey", uncollectible: "pred" };

export default function InvoiceDetail() {
  const { active } = useOrg();
  const { t } = useLang();
  // Display label for a backend invoice-status key.
  const statusLabel = (s: string) => ({
    draft: t("draft", "brouillon"), open: t("open", "ouverte"), paid: t("paid", "payée"),
    void: t("void", "annulée"), uncollectible: t("uncollectible", "irrécouvrable"),
  } as Record<string, string>)[s] || s;
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<any>(null);
  useEffect(() => { org.invoice(active.org_id, id).then(setD).catch(() => {}); }, [active.org_id, id]);

  if (!d) return <div className="sub">{t("Loading…", "Chargement…")}</div>;
  const inv = d.invoice;
  return (
    <>
      <div className="sub" style={{ cursor: "pointer" }} onClick={() => router.push("/shipper/invoices")}>← {t("Invoices", "Factures")}</div>
      <h1>{t("Invoice", "Facture")} — {fmt(inv.period_start)} {t("to", "au")} {fmt(inv.period_end)}</h1>
      <div className="sub"><span className={"pill " + (STATUS[inv.status] || "pgrey")}>{statusLabel(inv.status)}</span>{inv.status !== "draft" ? t(` · due ${fmt(inv.due_at)}`, ` · échéance ${fmt(inv.due_at)}`) : ""}</div>
      <div className="card" style={{ maxWidth: 640 }}>
        <table style={{ border: 0 }}>
          <thead><tr><th>{t("Description", "Description")}</th><th style={{ textAlign: "right" }}>{t("Amount", "Montant")}</th></tr></thead>
          <tbody>
            {(d.lines || []).map((l: any) => (
              <tr key={l.id}><td>{l.description}</td><td style={{ textAlign: "right" }}>{money(l.amount_cents)}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginLeft: "auto", width: 280, marginTop: 14 }}>
          <div className="kv"><span className="k">{t("Subtotal", "Sous-total")}</span><span className="v">{money(inv.subtotal_cents)}</span></div>
          {inv.discount_cents > 0 && <div className="kv"><span className="k">{t("Volume discount", "Rabais de volume")}</span><span className="v">−{money(inv.discount_cents)}</span></div>}
          <div className="kv"><span className="k">{t("Tax", "Taxes")} ({d.org?.province})</span><span className="v">{money(inv.tax_cents)}</span></div>
          <div className="kv" style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 8, fontSize: 15 }}>
            <span className="k" style={{ fontWeight: 800, color: "var(--ink)" }}>{t("Total due", "Total dû")}</span><span className="v" style={{ color: "var(--accent)" }}>{money(inv.total_cents)}</span>
          </div>
        </div>
        {inv.status === "open" && inv.hosted_url && (
          <button className="btn" style={{ marginTop: 14 }} onClick={() => window.open(inv.hosted_url, "_blank")}>{t("Pay now", "Payer maintenant")}</button>
        )}
        {inv.status === "draft" && <div className="warn" style={{ marginTop: 14 }}>{t("This cycle is still open — the invoice is issued when the period closes.", "Ce cycle est encore ouvert — la facture est émise à la clôture de la période.")}</div>}
        {inv.status === "paid" && <div className="sub" style={{ marginTop: 14, color: "var(--green)", fontWeight: 700 }}>✓ {t("Paid", "Payé")} {fmt(inv.paid_at)}</div>}
      </div>
    </>
  );
}
