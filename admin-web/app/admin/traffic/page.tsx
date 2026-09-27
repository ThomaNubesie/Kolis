"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// The same counts as /traffic, inside the logged-in admin so it sits with everything else.
//
// Facebook reports engagements and the app stores report installs; neither says whether a post put
// anybody on the site. This reads loadq_hit through summary RPCs that return counts only — the raw
// rows stay behind RLS, and there is no IP or cookie in them to leak in the first place.
type Row = { day: string; source: string; hits: number; median_s: number | null };
type Totals = { hits: number; days: number; sources: number; top_source: string | null; median_s: number | null; measured: number };

// Seconds read at a glance: "1 m 20" rather than 80.
const dur = (s: number | null | undefined) =>
  s == null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, "0")}`;

const RANGES = [7, 30, 90];

export default function Traffic() {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [tot, setTot] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.hitSummary(days).catch(() => []),
      api.hitTotals(days).catch(() => []),
    ]).then(([s, t]) => {
      setRows((s as Row[]) || []);
      setTot(((t as Totals[]) || [])[0] ?? null);
    }).finally(() => setLoading(false));
  }, [days]);

  // One line per source, summed across the days, because "where did they come from" is the
  // question the daily grid makes you do arithmetic to answer.
  const bySource = Object.values(
    rows.reduce((acc: Record<string, { source: string; hits: number; med: number[] }>, r) => {
      const k = r.source || "(direct)";
      acc[k] = acc[k] || { source: k, hits: 0, med: [] };
      acc[k].hits += r.hits;
      if (r.median_s != null) acc[k].med.push(r.median_s);
      return acc;
    }, {})
  ).sort((a, b) => b.hits - a.hits);

  return (
    <div style={{ padding: 4 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
        {fr ? "Trafic du site" : "Site traffic"}
      </h1>
      <p style={{ color: "#667", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 700 }}>
        {fr
          ? "Qui est arrivé sur loadq.ca, et ce qui l'y a envoyé — d'après l'étiquette du lien, sinon le site référent. Aucune adresse IP, aucun témoin."
          : "Who arrived at loadq.ca and what sent them — from the tag in the link, or failing that the referring host. No IP addresses, no cookies."}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {RANGES.map((d) => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: "1px solid " + (days === d ? "#111827" : "#e5e7eb"),
            background: days === d ? "#111827" : "#fff", color: days === d ? "#fff" : "#374151",
          }}>{d} {fr ? "jours" : "days"}</button>
        ))}
      </div>

      {tot && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <Stat label={fr ? "Visites" : "Visits"} value={String(tot.hits ?? 0)} />
          <Stat label={fr ? "Sources" : "Sources"} value={String(tot.sources ?? 0)} />
          <Stat label={fr ? "Meilleure source" : "Top source"} value={tot.top_source || "—"} />
          <Stat label={fr ? "Temps médian" : "Median time"} value={dur(tot.median_s)} />
        </div>
      )}

      {loading ? <p style={{ color: "#889" }}>{fr ? "Chargement…" : "Loading…"}</p>
        : bySource.length === 0 ? <p style={{ color: "#889" }}>{fr ? "Aucune visite sur la période." : "No visits in this range."}</p>
        : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#778", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6 }}>
              <th style={th}>{fr ? "Source" : "Source"}</th>
              <th style={{ ...th, textAlign: "right" }}>{fr ? "Visites" : "Visits"}</th>
              <th style={{ ...th, textAlign: "right" }}>{fr ? "Temps médian" : "Median time"}</th>
            </tr>
          </thead>
          <tbody>
            {bySource.map((s) => (
              <tr key={s.source} style={{ borderTop: "1px solid #eef0f3" }}>
                <td style={td}><b>{s.source}</b></td>
                <td style={{ ...td, textAlign: "right" }}>{s.hits}</td>
                <td style={{ ...td, textAlign: "right", color: "#667" }}>
                  {s.med.length ? dur(Math.round(s.med.reduce((a, b) => a + b, 0) / s.med.length)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = { padding: "6px 8px", fontWeight: 800 } as const;
const td = { padding: "9px 8px" } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 16px", minWidth: 130 }}>
      <div style={{ fontSize: 11.5, color: "#778", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
