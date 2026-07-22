"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";
import { LiveTracking, useTracking } from "@/components/LiveTracking";

// Public, no-auth branded tracking page. Reads kolis_track(code) (safe fields only).
const STEPS_DOOR = ["requested", "matched", "picked_up", "in_transit", "delivered"];
const STEPS_HUB = ["requested", "received_at_hub", "dispatched", "in_transit", "delivered"];

export default function Track() {
  const { code } = useParams<{ code: string }>();
  const search = useSearchParams();
  const { t, lang, setLang } = useLang();
  const [p, setP] = useState<any | undefined>(undefined);
  const decoded = decodeURIComponent(code);
  // Live driver position + ETA (separate safe RPC, refreshed every 45s).
  const live = useTracking(decoded);

  // Honor a ?lang=fr|en query param (e.g. links from emails/SMS).
  useEffect(() => {
    const q = search.get("lang");
    if (q === "fr" || q === "en") setLang(q);
  }, [search, setLang]);

  useEffect(() => {
    supabase.rpc("kolis_track", { p_code: decoded }).then(({ data }) => setP(data ?? null));
  }, [decoded]);

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
                  {live ? (
                    <LiveTracking data={live} accent={accent} t={t} />
                  ) : (
                    steps.map((s, i) => {
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
                    })
                  )}
                </div>

                {/* Turn recipients into senders — download the Kolis app / visit kolis.ca */}
                <div style={{ background: "linear-gradient(135deg,#fff,#FBEFF5)", border: "1px solid #F3D9E6", borderRadius: 16, padding: 18, marginTop: 16, textAlign: "center" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: "#E11D6B", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 19 }}>Ko</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1722", margin: "10px 0 3px" }}>{t("Send your own parcels with Kolis", "Envoyez vos propres colis avec Kolis")}</div>
                  <div className="sub" style={{ fontSize: 12.5 }}>{t("A driver already heading to your city carries it — same-day.", "Un chauffeur déjà en route vers votre ville le transporte — le jour même.")}</div>
                  <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 12 }}>
                    <a href="https://apps.apple.com/app/id6778120565" style={{ background: "#000", color: "#fff", borderRadius: 9, padding: "8px 15px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}> App Store</a>
                    <a href="https://play.google.com/store/apps/details?id=ca.kolis.app" style={{ background: "#000", color: "#fff", borderRadius: 9, padding: "8px 15px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>▶ Google Play</a>
                  </div>
                  <a href="https://kolis.ca" style={{ display: "inline-block", marginTop: 12, color: "#E11D6B", fontWeight: 800, textDecoration: "none", fontSize: 13.5, borderBottom: "2px solid rgba(225,29,107,.35)" }}>kolis.ca →</a>
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
