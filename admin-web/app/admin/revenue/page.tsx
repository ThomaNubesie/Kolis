"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const money = (c?: number) => "C$" + ((c ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Revenue() {
  const { t } = useLang();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [range, setRange] = useState<"month" | "all">("month");
  const [err, setErr] = useState("");

  const load = (r: "month" | "all") => {
    setErr(""); setData(null);
    const args: [string?, string?] = r === "all" ? ["2020-01-01", "2999-01-01"] : [undefined, undefined];
    api.revenue(args[0], args[1]).then((d) => { if (d == null) setErr(t("You don't have access to revenue.", "Vous n’avez pas accès aux revenus.")); else setData(d); }).catch((e) => setErr(e?.message || t("Failed to load.", "Échec du chargement.")));
  };
  useEffect(() => { load(range); }, [range]);

  const Tile = ({ l, n, tone, sub }: { l: string; n: string; tone?: string; sub?: string }) => (
    <div className="tile"><div className="l">{l}</div><div className="n" style={{ color: tone }}>{n}</div>{sub ? <div className="sub" style={{ marginTop: 2 }}>{sub}</div> : null}</div>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("Revenue", "Revenus")}</h1><div className="sub">{range === "all" ? t("All time", "Depuis le début") : t("This month", "Ce mois-ci")} · {t("Stripe TEST mode until launch", "Stripe en mode TEST jusqu’au lancement")}</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className={"chip" + (range === "month" ? " on" : "")} onClick={() => setRange("month")}>{t("This month", "Ce mois-ci")}</button>
          <button className={"chip" + (range === "all" ? " on" : "")} onClick={() => setRange("all")}>{t("All time", "Depuis le début")}</button>
        </div>
      </div>

      {err ? <div className="warn">{err}</div> : !data ? <div className="sub">{t("Loading…", "Chargement…")}</div> : (
        <>
          <div className="tiles">
            <Tile l={t("Platform fees earned", "Frais de plateforme perçus")} n={money(data.platform_fees_cents)} tone="#178a5e" sub={t("15% on fleet payouts", "15 % sur les versements aux flottes")} />
            <Tile l={t("Billed to shippers", "Facturé aux expéditeurs")} n={money(data.invoiced_cents)} sub={t("invoices + pay-as-you-go", "factures + paiement à l’usage")} />
            <Tile l={t("Collected", "Encaissé")} n={money(data.collected_cents)} tone="#178a5e" sub={t("paid invoices + card charges", "factures payées + débits carte")} />
            <Tile l={t("Outstanding (unpaid)", "Impayé")} n={money(data.outstanding_cents)} tone={data.outstanding_cents ? "var(--accent)" : undefined} />
            <Tile l={t("Payouts owed to fleets", "Versements dus aux flottes")} n={money(data.payouts_owed_cents)} tone={data.payouts_owed_cents ? "var(--red)" : undefined} />
          </div>

          <div className="mono">{t("By organization", "Par organisation")}</div>
          <table>
            <thead><tr><th>{t("Organization", "Organisation")}</th><th>{t("Invoiced", "Facturé")}</th><th>{t("Outstanding", "Impayé")}</th><th>{t("Platform fees", "Frais de plateforme")}</th></tr></thead>
            <tbody>
              {(data.by_org || []).map((o: any) => (
                <tr key={o.org_id} onClick={() => router.push(`/admin/revenue/${o.org_id}`)} style={{ cursor: "pointer" }} title={t("View transactions", "Voir les transactions")}>
                  <td><b style={{ color: "#B81558" }}>{o.name}</b> <span style={{ color: "var(--t3)" }}>›</span></td>
                  <td>{money(o.invoiced_cents)}</td>
                  <td style={{ color: o.outstanding_cents ? "var(--accent)" : "var(--t3)" }}>{money(o.outstanding_cents)}</td>
                  <td>{money(o.fees_cents)}</td>
                </tr>
              ))}
              {(data.by_org || []).length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>{t("No organizations yet.", "Aucune organisation.")}</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
