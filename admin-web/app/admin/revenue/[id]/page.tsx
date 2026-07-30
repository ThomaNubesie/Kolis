"use client";
import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";
import { ArrowLeft, ChevronDown, ChevronRight, Package, ReceiptText, ShieldCheck } from "lucide-react";

const money = (c?: number) => "C$" + ((c ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PILL: Record<string, string> = {
  delivered: "pg", paid: "pg", cancelled: "pred", open: "pgold", received_at_hub: "pgold",
  requested: "pgrey", matched: "pmag", dispatched: "pblue", picked_up: "pblue", in_transit: "pblue",
};

export default function OrgTransactions() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang } = useLang();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.orgTransactions(id).then((d) => { if (d == null) setErr(t("You don't have access to revenue.", "Vous n’avez pas accès aux revenus.")); else setData(d); }).catch((e) => setErr(e?.message || t("Failed to load.", "Échec du chargement.")));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const when = (s?: string) => s ? new Date(s).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const day = (s?: string | null) => s ? new Date(s).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const pill = (s: string) => <span className={"pill " + (PILL[s] || "pgrey")}>{s.replace(/_/g, " ")}</span>;

  const txns: any[] = data?.transactions || [];
  const total = txns.filter((x) => x.status !== "cancelled").reduce((a, x) => a + (x.amount_cents || 0), 0);

  const KV = ({ k, v }: { k: React.ReactNode; v: any }) => (v === null || v === undefined || v === "" ? null :
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 13 }}><span style={{ color: "var(--t3)", minWidth: 150 }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>);

  const shipmentDetail = (d: any) => {
    const charged = (d.price_cents || 0) + (d.tax_cents || 0) + (d.insurance_premium_cents || 0) - (d.credit_applied_cents || 0);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div>
          <div className="mono" style={{ marginBottom: 4 }}>{t("Shipment", "Envoi")}</div>
          <KV k={t("Route", "Trajet")} v={`${d.from_city} → ${d.to_city}`} />
          <KV k={t("Size", "Taille")} v={d.size} />
          <KV k={t("Pickup", "Ramassage")} v={d.dropoff_type} />
          <KV k={t("Recipient", "Destinataire")} v={d.recipient_name} />
          <KV k={t("Phone", "Téléphone")} v={d.recipient_phone} />
          <KV k={t("Email", "Courriel")} v={d.recipient_email} />
          <KV k={t("Contents", "Contenu")} v={d.contents} />
          <KV k={t("Driver", "Chauffeur")} v={d.driver_name} />
          <KV k={t("Delivered", "Livré")} v={d.delivered_at ? when(d.delivered_at) : t("not yet", "pas encore")} />
        </div>
        <div>
          <div className="mono" style={{ marginBottom: 4 }}>{t("Charge breakdown", "Détail des frais")}</div>
          <KV k={t("Shipping", "Expédition")} v={money(d.price_cents)} />
          {d.insured ? <KV k={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ShieldCheck size={12} /> {t("Insurance (5%)", "Assurance (5 %)")}</span>} v={money(d.insurance_premium_cents)} /> : null}
          <KV k={t("Tax", "Taxe")} v={money(d.tax_cents)} />
          {d.credit_applied_cents ? <KV k={t("Kolis credit", "Crédit Kolis")} v={"− " + money(d.credit_applied_cents)} /> : null}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6, fontWeight: 800 }}><span>{t("Charged", "Débité")}</span><span>{money(charged)}</span></div>
          <div style={{ marginTop: 10 }}>
            <KV k={t("Declared value", "Valeur déclarée")} v={d.declared_value_cents ? money(d.declared_value_cents) : "—"} />
            <KV k={t("Payment", "Paiement")} v={d.stripe_payment_intent_id?.startsWith("credit_") ? t("Kolis credit", "Crédit Kolis") : t("Card", "Carte")} />
            <KV k="Stripe" v={d.stripe_payment_intent_id} />
          </div>
        </div>
      </div>
    );
  };

  const invoiceDetail = (d: any) => (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div>
          <div className="mono" style={{ marginBottom: 4 }}>{t("Invoice", "Facture")}</div>
          <KV k={t("Period", "Période")} v={`${day(d.period_start)} – ${day(d.period_end)}`} />
          <KV k={t("Status", "Statut")} v={d.status} />
          <KV k={t("Due", "Échéance")} v={day(d.due_at)} />
          <KV k={t("Paid", "Payé")} v={d.paid_at ? when(d.paid_at) : t("unpaid", "impayé")} />
        </div>
        <div>
          <div className="mono" style={{ marginBottom: 4 }}>{t("Amounts", "Montants")}</div>
          <KV k={t("Subtotal", "Sous-total")} v={money(d.subtotal_cents)} />
          {d.discount_cents ? <KV k={t("Discount", "Rabais")} v={"− " + money(d.discount_cents)} /> : null}
          <KV k={t("Tax", "Taxe")} v={money(d.tax_cents)} />
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6, fontWeight: 800 }}><span>{t("Total", "Total")}</span><span>{money(d.total_cents)}</span></div>
          {d.hosted_url ? <a className="sub" href={d.hosted_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#B81558", fontWeight: 700 }}>{t("Stripe invoice ↗", "Facture Stripe ↗")}</a> : null}
        </div>
      </div>
      {(d.line_items || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="mono" style={{ marginBottom: 4 }}>{t("Line items", "Postes")} ({d.line_items.length})</div>
          <table><tbody>
            {d.line_items.map((li: any, i: number) => (
              <tr key={i}><td><b>{li.code}</b></td><td className="sub">{li.from_city} → {li.to_city}</td><td style={{ textAlign: "right" }}>{money((li.price_cents || 0) + (li.tax_cents || 0))}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button className="btn ghost" onClick={() => router.push("/admin/revenue")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={15} strokeWidth={2} /> {t("Revenue", "Revenus")}</button>
      <h1 style={{ marginTop: 12 }}>{data?.org?.name || "…"}</h1>
      <div className="sub">
        {!data ? t("Loading…", "Chargement…") : t(`${txns.length} transaction(s) · ${money(total)} billed`, `${txns.length} transaction(s) · ${money(total)} facturé`)}
        {data?.org ? ` · ${data.org.payg ? t("pay-as-you-go", "paiement à l’usage") : t("net terms", "conditions nettes")}` : ""}
        {data?.org?.credit_cents > 0 ? ` · ${t("credit", "crédit")} ${money(data.org.credit_cents)}` : ""}
      </div>

      {err ? <div className="warn" style={{ marginTop: 12 }}>{err}</div> : !data ? <div className="sub" style={{ marginTop: 12 }}>{t("Loading…", "Chargement…")}</div> : txns.length === 0 ? (
        <div className="card sub" style={{ marginTop: 12 }}>{t("No transactions yet.", "Aucune transaction.")}</div>
      ) : (
        <table style={{ marginTop: 14 }}>
          <thead><tr><th style={{ width: 24 }}></th><th>{t("Date", "Date")}</th><th>{t("Type", "Type")}</th><th>{t("Reference", "Référence")}</th><th>{t("Status", "Statut")}</th><th style={{ textAlign: "right" }}>{t("Amount", "Montant")}</th></tr></thead>
          <tbody>
            {txns.map((x) => {
              const isOpen = !!open[x.id];
              return (
                <Fragment key={x.id}>
                  <tr onClick={() => setOpen((o) => ({ ...o, [x.id]: !o[x.id] }))} style={{ cursor: "pointer" }}>
                    <td>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{when(x.date)}</td>
                    <td>{x.kind === "shipment"
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Package size={13} strokeWidth={2} />{t("Shipment", "Envoi")}</span>
                      : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><ReceiptText size={13} strokeWidth={2} />{t("Invoice", "Facture")}</span>}</td>
                    <td><b>{x.ref}</b></td>
                    <td>{pill(x.status)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{money(x.amount_cents)}</td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={6} style={{ background: "var(--cardAlt)", padding: "14px 16px" }}>
                      {x.kind === "shipment" ? shipmentDetail(x.detail) : invoiceDetail(x.detail)}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
