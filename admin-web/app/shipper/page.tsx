"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  requested: "pgrey", received_at_hub: "pgold", matched: "pmag", dispatched: "pblue",
  picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred",
};

export default function ShipperOverview() {
  const { active } = useOrg();
  const { t } = useLang();
  const [ov, setOv] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    org.overview(active.org_id).then(setOv).catch(() => {});
    org.shipments(active.org_id, "all", null).then((r) => setRows(r.slice(0, 8))).catch(() => {});
  }, [active.org_id]);

  return (
    <>
      <h1>{t("Overview", "Aperçu")}</h1>
      <div className="sub">{active.name} · {active.kyb_status === "verified" ? t("KYB verified", "KYB vérifié") : t("KYB ", "KYB ") + active.kyb_status}{active.status === "suspended" ? t(" · ⚠️ suspended", " · ⚠️ suspendu") : ""}</div>
      <div className="tiles">
        <div className="tile"><div className="l">{t("In transit", "En transit")}</div><div className="n">{ov?.in_transit ?? "—"}</div></div>
        <div className="tile"><div className="l">{t("Awaiting pickup", "En attente de ramassage")}</div><div className="n">{ov?.awaiting ?? "—"}</div></div>
        <div className="tile"><div className="l">{t("Delivered (30d)", "Livrés (30j)")}</div><div className="n">{ov?.delivered_30d ?? "—"}</div></div>
        <div className="tile"><div className="l">{t("Accrued this cycle", "Cumulé ce cycle")}</div><div className="n">{ov ? money(ov.accrued_cents) : "—"}</div></div>
      </div>
      <div className="toolbar"><h1 style={{ fontSize: 16 }}>{t("Recent shipments", "Envois récents")}</h1><Link className="btn" style={{ marginLeft: "auto" }} href="/shipper/create">+ {t("New shipment", "Nouvel envoi")}</Link></div>
      <table>
        <thead><tr><th>{t("Code", "Code")}</th><th>{t("Route", "Trajet")}</th><th>{t("Recipient", "Destinataire")}</th><th>{t("Status", "Statut")}</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}><td>{p.code}</td><td>{p.from_city} → {p.to_city}</td><td>{p.recipient_name || "—"}</td>
              <td><span className={"pill " + (STATUS[p.status] || "pgrey")}>{p.status.replace(/_/g, " ")}</span></td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>{t("No shipments yet.", "Aucun envoi pour l’instant.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
