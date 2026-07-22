"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Shared live-tracking panel for the public recipient track page and the admin
// parcel detail page. Both consume the single SECURITY-DEFINER RPC
// `kolis_track_by_code(p_code)` (safe fields only — no payout/sender/address).
// No map library / API key: the driver position is rendered with an
// OpenStreetMap embed iframe centered on the driver's last GPS fix.

export type TrackData = {
  code: string;
  status: string;
  dropoff_type: string | null;
  from_city: string | null;
  to_city: string | null;
  driver_first_name: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_updated_at: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  distance_km: number | null;
  eta_minutes: number | null;
  stale: boolean | null;
};

const STEPS_DOOR = ["requested", "matched", "picked_up", "in_transit", "delivered"];
const STEPS_HUB = ["requested", "received_at_hub", "dispatched", "in_transit", "delivered"];

export function useTracking(code: string | null | undefined) {
  // undefined = loading, null = not found, object = found
  const [data, setData] = useState<TrackData | null | undefined>(undefined);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const fetchOnce = async () => {
      try {
        const { data } = await supabase.rpc("kolis_track_by_code", { p_code: code });
        if (alive) setData((data as TrackData) ?? null);
      } catch {
        if (alive) setData((prev) => (prev === undefined ? null : prev));
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 45000); // refresh every 45s
    return () => { alive = false; clearInterval(id); };
  }, [code]);

  return data;
}

// Self-contained panel: fetches tracking for a code and renders the map + timeline.
// Used by the sender's client profile (click a package to see its current state).
export function TrackingPanel({ code, t }: { code: string; t: (en: string, fr: string) => string }) {
  const data = useTracking(code);
  if (data === undefined) return <div className="sub" style={{ padding: "8px 0" }}>{t("Loading…", "Chargement…")}</div>;
  if (data === null) return <div className="sub" style={{ padding: "8px 0" }}>{t("No tracking available.", "Aucun suivi disponible.")}</div>;
  return <LiveTracking data={data} t={t} />;
}

// OSM embed URL with a marker. `tight` = street-level zoom (house/number visible),
// used once delivered; otherwise a wider view that follows the driver's route.
function osmUrl(lat: number, lng: number, tight = false) {
  const dLng = tight ? 0.0016 : 0.15;
  const dLat = tight ? 0.0011 : 0.1;
  const bbox = `${lng - dLng}%2C${lat - dLat}%2C${lng + dLng}%2C${lat + dLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function etaLabel(mins: number, t: (en: string, fr: string) => string) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0) return `≈ ${h}h ${String(m).padStart(2, "0")}m`;
  return t(`≈ ${m} min`, `≈ ${m} min`);
}

function minsAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function LiveTracking({
  data,
  accent = "#E11D6B",
  t,
}: {
  data: TrackData;
  accent?: string;
  t: (en: string, fr: string) => string;
}) {
  const label = (s: string) =>
    (({
      requested: t("Requested", "Demandé"),
      matched: t("Matched", "Jumelé"),
      received_at_hub: t("Received at hub", "Reçu au point relais"),
      dispatched: t("Dispatched", "Expédié"),
      picked_up: t("Picked up", "Ramassé"),
      in_transit: t("In transit", "En transit"),
      delivered: t("Delivered", "Livré"),
      cancelled: t("Cancelled", "Annulé"),
    } as Record<string, string>)[s] || s);

  const steps = data.dropoff_type === "hub" ? STEPS_HUB : STEPS_DOOR;
  const isDelivered = data.status === "delivered";
  const isDone = isDelivered || data.status === "cancelled";
  // Delivered is terminal: push `cur` past the last step so every step (incl.
  // "Delivered") renders as done/✓ rather than the last one showing "In progress".
  const cur = data.status === "cancelled" ? -1 : isDelivered ? steps.length : steps.indexOf(data.status);
  const hasDriver = data.driver_lat != null && data.driver_lng != null;
  // The map is ALWAYS shown when we have any coordinate: the live driver while in
  // transit, or the delivery destination once delivered (never the stale GPS).
  const mapLat = isDelivered ? data.dest_lat : (hasDriver ? data.driver_lat : data.dest_lat);
  const mapLng = isDelivered ? data.dest_lng : (hasDriver ? data.driver_lng : data.dest_lng);
  const hasMap = mapLat != null && mapLng != null;
  const showFacts = hasDriver && !isDone; // ETA / distance / stale-GPS only while in transit

  return (
    <div>
      {/* Timeline + map, side by side; map stretches to the timeline's height */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        {/* Status timeline */}
        <div style={{ flex: "0 1 190px", minWidth: 170 }}>
          {steps.map((s, i) => {
            const done = cur >= 0 && i < cur;
            const active = i === cur;
            const color = done ? "#178a5e" : active ? accent : "#D7D7DE";
            return (
              <div key={s} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{done ? "✓" : ""}</div>
                  {i < steps.length - 1 ? <div style={{ width: 3, height: 30, background: i < cur ? "#178a5e" : "#E7E7EE" }} /> : null}
                </div>
                <div style={{ paddingTop: 2 }}>
                  <div style={{ fontWeight: active || done ? 800 : 500, color: active || done ? "#1a1722" : "#9b97a6", fontSize: 14 }}>{label(s)}</div>
                  {active ? <div style={{ color: accent, fontSize: 12 }}>{t("In progress", "En cours")}</div> : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Map — beside the timeline; always shown (driver in transit, destination once delivered) */}
        {hasMap ? (
          <div style={{ flex: "3 1 380px", minWidth: 300, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12.5, color: "#5A6B63", marginBottom: 6 }}>
            {isDelivered ? (
              <span style={{ color: "#178a5e", fontWeight: 700 }}>📍 {t("Delivered", "Livré")}{data.to_city ? ` · ${data.to_city}` : ""}</span>
            ) : hasDriver && data.driver_first_name ? (
              <>🚐 {data.driver_first_name}{" "}
                {data.driver_updated_at ? (
                  <span style={{ color: data.stale ? "#b07a00" : "#178a5e", fontWeight: 700 }}>
                    · {data.stale ? t("position may be stale", "position possiblement périmée") + " — " : ""}
                    {t(`updated ${minsAgo(data.driver_updated_at)} min ago`, `mis à jour il y a ${minsAgo(data.driver_updated_at)} min`)}
                  </span>
                ) : null}
              </>
            ) : (
              <span>📍 {t("Destination", "Destination")}{data.to_city ? ` · ${data.to_city}` : ""}</span>
            )}
          </div>
          <iframe
            title="map"
            src={osmUrl(mapLat as number, mapLng as number, isDelivered)}
            style={{ width: "100%", flex: 1, minHeight: 210, border: 0, borderRadius: 12 }}
            loading="lazy"
          />
          </div>
        ) : null}
      </div>

      {/* Facts: ETA · distance left — only while in progress */}
      {showFacts && (data.eta_minutes != null || data.distance_km != null) ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
          {data.eta_minutes != null ? (
            <div style={{ flex: "1 1 130px" }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".5px", color: "#8A978F", fontWeight: 700 }}>{t("Time to delivery", "Temps de livraison")}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#178a5e", marginTop: 3 }}>{etaLabel(data.eta_minutes, t)}</div>
            </div>
          ) : null}
          {data.distance_km != null ? (
            <div style={{ flex: "1 1 130px" }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".5px", color: "#8A978F", fontWeight: 700 }}>{t("Distance left", "Distance restante")}</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{t(`~${Math.round(data.distance_km)} km left`, `~${Math.round(data.distance_km)} km restants`)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showFacts && data.stale ? (
        <div className="warn" style={{ marginTop: 14 }}>
          ⚠️ {t("The driver's GPS hasn't updated recently — the position and ETA are a best estimate from the last known fix.", "Le GPS du chauffeur n'a pas été mis à jour récemment — la position et l'estimation sont basées sur la dernière position connue.")}
        </div>
      ) : null}
    </div>
  );
}
