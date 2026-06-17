"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";

// Public, no-auth branded tracking page. Reads kolis_track(code) (safe fields only).
const STEPS_DOOR = ["requested", "matched", "picked_up", "in_transit", "delivered"];
const STEPS_HUB = ["requested", "received_at_hub", "dispatched", "in_transit", "delivered"];

export default function Track() {
  const { code } = useParams<{ code: string }>();
  const { t, lang } = useLang();
  const [p, setP] = useState<any | undefined>(undefined);

  useEffect(() => {
    supabase.rpc("kolis_track", { p_code: decodeURIComponent(code) }).then(({ data }) => setP(data ?? null));
  }, [code]);

  const label = (s: string) => ({
    requested: t("Requested", "Demandé"),
    matched: t("Matched with courier", "Jumelé à un livreur"),
    received_at_hub: t("Received at hub", "Reçu au point relais"),
    dispatched: t("Dispatched", "Expédié"),
    picked_up: t("Picked up", "Ramassé"),
    in_transit: t("Out for delivery", "En cours de livraison"),
    delivered: t("Delivered", "Livré"),
    cancelled: t("Cancelled", "Annulé"),
  } as Record<string, string>)[s] || s;

  const day = (s?: string) => (s ? new Date(s).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" }) : "");

  // White-label: wear the business's brand when the parcel carries one.
  const brand = (p && (p as any).brand) || null;
  const accent = brand?.color || "#E11D6B";

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFC", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 520, padding: "28px 20px 60px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          {brand?.logo
            ? <img src={brand.logo} alt={brand.name || "Kolis"} style={{ height: 30, maxWidth: 200, objectFit: "contain" }} />
            : <div style={{ fontWeight: 900, fontSize: 22, color: accent }}>{brand?.name || "Kolis"}</div>}
          <LangToggle />
        </div>

        {p === undefined ? <div className="sub">{t("Loading…", "Chargement…")}</div>
          : p === null ? (
            <div className="card" style={{ textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 40 }}>🔍</div>
              <h2>{t("Parcel not found", "Colis introuvable")}</h2>
              <div className="sub">{t("Check the tracking code and try again.", "Vérifiez le code de suivi et réessayez.")}</div>
            </div>
          ) : (() => {
            const steps = p.dropoff_type === "hub" ? STEPS_HUB : STEPS_DOOR;
            const cur = p.status === "cancelled" ? -1 : steps.indexOf(p.status);
            return (
              <>
                <div className="card" style={{ marginBottom: 14 }}>
                  <div className="mono">{t("Tracking", "Suivi")}</div>
                  <h1 style={{ margin: "2px 0 6px" }}>#{p.code}</h1>
                  <div className="sub">{p.from_city} → {p.to_city}{p.courier ? ` · ${t("Courier", "Livreur")}: ${p.courier}` : ""}</div>
                  {p.status === "delivered" && p.delivered_at ? <div className="pill pg" style={{ display: "inline-block", marginTop: 10 }}>{t("Delivered", "Livré")} · {day(p.delivered_at)}</div> : null}
                  {p.status === "cancelled" ? <div className="pill pred" style={{ display: "inline-block", marginTop: 10 }}>{t("Cancelled", "Annulé")}</div> : null}
                </div>

                <div className="card">
                  {steps.map((s, i) => {
                    const done = cur >= 0 && i < cur, active = i === cur;
                    const color = done ? "#178a5e" : active ? accent : "#D7D7DE";
                    return (
                      <div key={s} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 26, height: 26, borderRadius: 13, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{done ? "✓" : ""}</div>
                          {i < steps.length - 1 ? <div style={{ width: 3, height: 34, background: i < cur ? "#178a5e" : "#E7E7EE" }} /> : null}
                        </div>
                        <div style={{ paddingTop: 2 }}>
                          <div style={{ fontWeight: active || done ? 800 : 500, color: active || done ? "#1a1722" : "#9b97a6", fontSize: 15 }}>{label(s)}</div>
                          {active ? <div style={{ color: accent, fontSize: 12.5 }}>{t("In progress", "En cours")}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="sub" style={{ textAlign: "center", marginTop: 20, fontSize: 12 }}>
                  {brand
                    ? `${t("Delivered by", "Livré par")} ${brand.name}${brand.powered_by ? " · powered by Kolis" : ""}`
                    : t("Delivered by Kolis · Concord Express Co Inc.", "Livré par Kolis · Concord Express Co Inc.")}
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
}
