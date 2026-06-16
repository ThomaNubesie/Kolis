"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c?: number) => "$" + Math.round((c ?? 0) / 100).toLocaleString();

export default function Analytics() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    setD(null);
    // compute the from-date on the client to avoid SQL default churn; ISO date.
    const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    org.analytics(active.org_id, from).then(setD).catch(() => setD(false));
  }, [active.org_id, days]);

  const Tile = ({ l, n, tone, sub }: { l: string; n: string; tone?: string; sub?: string }) => (
    <div className="tile"><div className="l">{l}</div><div className="n" style={{ color: tone }}>{n}</div>{sub ? <div className="sub" style={{ marginTop: 2 }}>{sub}</div> : null}</div>
  );

  const series: { day: string; count: number }[] = d?.by_day || [];
  const max = Math.max(1, ...series.map((x) => x.count));

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("Analytics", "Statistiques")}</h1><div className="sub">{active.name} · {t(`Last ${days} days`, `${days} derniers jours`)}</div></div>
        <div className="row" style={{ gap: 6 }}>
          {[30, 90, 365].map((n) => <button key={n} className={"chip" + (days === n ? " on" : "")} onClick={() => setDays(n)}>{n === 365 ? t("1 year", "1 an") : `${n}${t("d", "j")}`}</button>)}
        </div>
      </div>

      {d === null ? <div className="sub">{t("Loading…", "Chargement…")}</div> : !d ? <div className="warn">{t("Couldn't load analytics.", "Impossible de charger les statistiques.")}</div> : (
        <>
          <div className="tiles">
            <Tile l={t("Shipments", "Envois")} n={String(d.total ?? 0)} />
            <Tile l={t("Delivered", "Livrés")} n={String(d.delivered ?? 0)} tone="#178a5e" />
            <Tile l={t("In transit", "En transit")} n={String(d.in_transit ?? 0)} tone="var(--accent)" />
            <Tile l={t("Cancelled", "Annulés")} n={String(d.cancelled ?? 0)} tone={d.cancelled ? "var(--red)" : undefined} />
            <Tile l={t("Spend", "Dépenses")} n={money(d.spend_cents)} />
            <Tile l={t("Avg delivery", "Délai moyen")} n={d.avg_delivery_hours != null ? `${d.avg_delivery_hours} h` : "—"} sub={t("pickup → delivered", "ramassage → livré")} />
            <Tile l={t("Same-day", "Jour même")} n={d.same_day_pct != null ? `${d.same_day_pct}%` : "—"} tone="#178a5e" />
          </div>

          <div className="mono">{t("Shipments per day", "Envois par jour")}</div>
          <div className="card" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 180, padding: "16px 14px" }}>
            {series.length === 0 ? <div className="sub">{t("No shipments in this period.", "Aucun envoi dans cette période.")}</div> :
              series.map((x) => (
                <div key={x.day} title={`${x.day}: ${x.count}`} style={{ flex: 1, minWidth: 2, height: `${Math.round((x.count / max) * 100)}%`, background: "var(--accent)", borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
              ))}
          </div>
        </>
      )}
    </>
  );
}
