"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Pickups we turned away on distance. This is the only record that the demand existed at all —
// a refused rider creates no request row — so it is the one place that can say whether the
// ceiling is protecting drivers or costing trips.
const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : "\u2014");
const tel = (p?: string | null) => (p || "").replace(/[^\d+]/g, "");

type Refusal = {
  id: string; asked_at: string; distance_km: number; max_km: number; over_by: number;
  destination: string | null; pickup_address: string | null; client: string | null; phone: string | null;
};

export default function Refusals() {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [rows, setRows] = useState<Refusal[]>([]);
  const [bands, setBands] = useState<{ band: string; refusals: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.pickupRefusals(90).catch(() => []),
      api.pickupRefusalBands(90).catch(() => []),
    ]).then(([r, b]) => { setRows((r as Refusal[]) || []); setBands((b as any[]) || []); })
      .finally(() => setLoading(false));
  }, []);

  // The near misses are the actionable number: those are trips a slightly higher ceiling recovers.
  const nearMiss = rows.filter((r) => r.over_by <= 5).length;

  return (
    <div style={{ padding: 4 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
        {fr ? "Ramassages refus\u00e9s" : "Refused pickups"}
      </h1>
      <p style={{ color: "#667", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 700 }}>
        {fr
          ? "Des demandes refus\u00e9es parce que le client \u00e9tait trop loin du point de chargement. Si beaucoup se trouvent juste au-del\u00e0 du plafond, c\u2019est le plafond qui co\u00fbte des courses \u2014 pas les clients."
          : "Requests refused because the rider was too far from the loading point. If many sit just past the ceiling, it is the ceiling costing you trips, not the customers."}
      </p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat label={fr ? "Refus \u00b7 90 j" : "Refused \u00b7 90d"} value={String(rows.length)} />
        <Stat label={fr ? "\u00c0 5 km pr\u00e8s" : "Within 5 km"} value={String(nearMiss)} tone="#b45309" />
      </div>

      {bands.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {bands.map((b) => (
            <div key={b.band} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 13px", fontSize: 12.5 }}>
              <b>{b.refusals}</b> \u00b7 {b.band}
            </div>
          ))}
        </div>
      )}

      {loading ? <p style={{ color: "#889" }}>{fr ? "Chargement\u2026" : "Loading\u2026"}</p>
        : rows.length === 0 ? <p style={{ color: "#889" }}>{fr ? "Aucun refus enregistr\u00e9." : "No refusals logged yet."}</p>
        : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((f) => (
            <div key={f.id} style={{
              border: "1px solid " + (f.over_by <= 5 ? "#fde68a" : "#e5e7eb"),
              background: f.over_by <= 5 ? "#fffbeb" : "#fff",
              borderRadius: 10, padding: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {f.client || (fr ? "(nom non donn\u00e9)" : "(no name given)")}
                  {f.phone && <> \u00b7 <a href={`tel:${tel(f.phone)}`} style={{ color: "#2563eb" }}>{f.phone}</a></>}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#b45309" }}>
                  {f.distance_km} km <span style={{ color: "#889", fontWeight: 600 }}>
                    ({fr ? "d\u00e9passe de " : "over by "}{f.over_by} km)
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "#667", marginTop: 5 }}>
                {when(f.asked_at)} \u00b7 {f.destination || "\u2014"}
                {f.pickup_address ? " \u00b7 " + f.pickup_address : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 16px", minWidth: 140 }}>
      <div style={{ fontSize: 11.5, color: "#778", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: tone || "#111827" }}>{value}</div>
    </div>
  );
}
