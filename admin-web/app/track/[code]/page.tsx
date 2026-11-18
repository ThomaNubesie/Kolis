"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";
import { LiveTracking, useTracking } from "@/components/LiveTracking";
import { SearchX, Radio, ArrowRight } from "lucide-react";

// Public, no-auth branded tracking page. Reads kolis_track(code) (safe fields only).
const STEPS_DOOR = ["requested", "matched", "picked_up", "in_transit", "delivered"];
const STEPS_HUB = ["requested", "received_at_hub", "dispatched", "in_transit", "delivered"];

export default function Track() {
  const { code } = useParams<{ code: string }>();
  const search = useSearchParams();
  const { t, lang, setLang } = useLang();
  const [p, setP] = useState<any | undefined>(undefined);
  // Journey timeline. Photos/cards only with the private token from the SMS/email
  // link (?t=…) — KL codes are guessable, so the code alone shows steps, not photos.
  const [ev, setEv] = useState<{ full: boolean; token: string | null; events: any[] } | null>(null);
  const [showLive, setShowLive] = useState(false);
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
    supabase.rpc("kolis_track_events", { p_code: decoded, p_token: search.get("t") }).then(({ data }) => setEv((data as any) ?? null));
  }, [decoded, search]);

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

  const when = (s: string) => new Date(s).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
              <SearchX size={40} color="#9b97a6" strokeWidth={1.8} />
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

                {ev && ev.events.length > 0 ? (
                  <div className="card">
                    {/* Open step on top (design option 1), live map one tap away (option 2). */}
                    {p.status !== "delivered" && p.status !== "cancelled" ? (
                      <TlRow color={accent} last={false} title={`${t("Delivery", "Livraison")} · ${p.to_city}`}
                        sub={live?.eta_minutes != null ? t(`Arriving in about ${live.eta_minutes} min`, `Arrivée dans environ ${live.eta_minutes} min`) : t("On its way", "En route")}>
                        {live ? (
                          <button className="btn" style={{ marginTop: 8, background: accent, color: "#fff" }} onClick={() => setShowLive((v) => !v)}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Radio size={15} strokeWidth={2.4} />{showLive ? t("Hide live tracking", "Masquer le suivi") : t("Live tracking", "Suivi en direct")}</span>
                          </button>
                        ) : null}
                        {showLive && live ? <div style={{ marginTop: 10 }}><LiveTracking data={live} accent={accent} t={t} /></div> : null}
                      </TlRow>
                    ) : null}
                    {[...ev.events].reverse().map((e, i, arr) => (
                      <TlRow key={i} color="#178a5e" done last={i === arr.length - 1}
                        title={`${e.kind === "picked_up" ? t("Picked up", "Ramassé") : e.kind === "delivered" ? t("Delivered", "Livré") : (e.city || t("Stop", "Étape"))} · ${when(e.at)}`}
                        sub={e.kind === "picked_up" ? p.from_city : e.kind === "delivered" ? p.to_city : t("On the way to ", "En route vers ") + p.to_city}>
                        {ev.full && (e.photo || e.id) ? (
                          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                            {e.photo ? <img src={e.photo} alt="" style={{ width: 72, height: 52, objectFit: "cover", borderRadius: 8 }} /> : null}
                            {e.id && ev.token ? <a href={`/card/${ev.token}/${e.id}`} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 800, fontSize: 13, textDecoration: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{t("View card", "Voir la carte")}<ArrowRight size={14} strokeWidth={2.4} /></span></a> : null}
                          </div>
                        ) : null}
                      </TlRow>
                    ))}
                    {!ev.full ? <div className="sub" style={{ fontSize: 12, marginTop: 4 }}>{t("Photos are in the link we texted / emailed you.", "Les photos sont dans le lien reçu par SMS / courriel.")}</div> : null}
                  </div>
                ) : (
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
                )}

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

// One row of the journey timeline: dot + rail, title, subtitle, optional extras.
function TlRow({ color, done, last, title, sub, children }: { color: string; done?: boolean; last: boolean; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: done ? color : "#fff", border: `3px solid ${color}`, boxSizing: "border-box" }} />
        {!last ? <div style={{ flex: 1, width: 2, background: done ? "#178a5e" : "#E7E7EE", minHeight: 16 }} /> : null}
      </div>
      <div style={{ flex: 1, paddingBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1722" }}>{title}</div>
        {sub ? <div style={{ fontSize: 12.5, color: "#6b6675", marginTop: 1 }}>{sub}</div> : null}
        {children}
      </div>
    </div>
  );
}
