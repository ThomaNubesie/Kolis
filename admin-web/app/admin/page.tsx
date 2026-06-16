"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const c$ = (c?: number) => `C$${Math.round((c ?? 0) / 100)}`;

export default function Overview() {
  const router = useRouter();
  const { t } = useLang();
  const [ov, setOv] = useState<any>(null);
  const [attention, setAttention] = useState<any[]>([]);

  useEffect(() => {
    api.overview().then(setOv).catch(() => {});
    Promise.all([api.parcels("awaiting"), api.parcels("issues")])
      .then(([a, b]) => setAttention([...(a || []), ...(b || [])].slice(0, 8))).catch(() => {});
  }, []);

  const Tile = ({ l, n, tone }: { l: string; n: string; tone?: string }) => (
    <div className="tile"><div className="l">{l}</div><div className="n" style={{ color: tone }}>{n}</div></div>
  );

  return (
    <>
      <h1>{t("Overview", "Aperçu")}</h1>
      <div className="sub">{t("Today · all cities", "Aujourd’hui · toutes les villes")}</div>
      <div className="tiles">
        <Tile l={t("In transit", "En transit")} n={String(ov?.in_transit ?? 0)} />
        <Tile l={t("Awaiting driver", "En attente d’un chauffeur")} n={String(ov?.awaiting ?? 0)} tone="var(--accent)" />
        <Tile l={t("Delivered today", "Livrés aujourd’hui")} n={String(ov?.delivered_today ?? 0)} tone="#178a5e" />
        {ov?.revenue_today_cents != null && <Tile l={t("Revenue today", "Revenus du jour")} n={c$(ov?.revenue_today_cents)} />}
        {ov?.pending_payout_cents != null && <Tile l={t("Pending payouts", "Versements en attente")} n={c$(ov?.pending_payout_cents)} />}
        <Tile l={t("Open claims", "Réclamations ouvertes")} n={String(ov?.open_claims ?? 0)} tone={ov?.open_claims ? "var(--red)" : undefined} />
      </div>

      <div className="mono">{t("Needs attention", "À traiter")}</div>
      <table>
        <thead><tr><th>{t("Parcel", "Colis")}</th><th>{t("Route", "Trajet")}</th><th>{t("Status", "Statut")}</th><th></th></tr></thead>
        <tbody>
          {attention.map((p) => (
            <tr key={p.id} className="clk" onClick={() => router.push(`/admin/parcels/${p.id}`)}>
              <td>#{p.code}</td>
              <td>{p.from_city} → {p.to_city}</td>
              <td><span className={"pill " + (p.has_open_claim ? "pred" : "pmag")}>{p.has_open_claim ? t("Claim", "Réclamation") : t("Awaiting", "En attente")}</span></td>
              <td>›</td>
            </tr>
          ))}
          {attention.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>{t("Nothing needs attention 🎉", "Rien à traiter 🎉")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
