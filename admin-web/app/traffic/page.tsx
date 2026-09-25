// admin.loadq.ca/traffic — who arrived at loadq.ca, and what sent them.
//
// Facebook reports engagements; the app stores report installs; neither says whether a post put
// anybody on the site. This reads loadq_hit, which counts one row per page view with the tag
// carried in the link (loadq.ca/?s=tk-board) or, failing a tag, the referrer's host.
//
// It reads through loadq_hit_summary()/loadq_hit_totals(), which return counts only — the raw
// rows stay behind RLS, and there is nothing personal in them to leak anyway.
export const dynamic = "force-dynamic";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Row = { day: string; source: string; hits: number; median_s: number | null };
type Totals = { hits: number; days: number; sources: number; top_source: string | null;
                median_s: number | null; measured: number };

// Seconds, read at a glance: "1 m 20" rather than 80.
const dur = (s: number | null | undefined) =>
  s == null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, "0")}`;

async function rpc<T>(fn: string, body: unknown): Promise<T[]> {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return r.ok ? r.json() : ([] as T[]);
}

const C = { bg: "#0D0F13", card: "#15171C", line: "#232833", dim: "#8A909C", warm: "#FF8A1A" };

export default async function Traffic({ searchParams }: { searchParams: { days?: string } }) {
  const days = Math.min(90, Math.max(1, parseInt(searchParams?.days || "14", 10) || 14));
  const [rows, totals] = await Promise.all([
    rpc<Row>("loadq_hit_summary", { p_days: days }),
    rpc<Totals>("loadq_hit_totals", { p_days: days }),
  ]);
  const t = totals[0];

  // Pivot to a grid: a row per source, a column per day, so a spike is visible along a line.
  const dayList = [...new Set(rows.map(r => r.day))].sort().reverse();
  const bySource = new Map<string, Map<string, number>>();
  const dwellBySource = new Map<string, number[]>();
  for (const r of rows) {
    if (!bySource.has(r.source)) bySource.set(r.source, new Map());
    bySource.get(r.source)!.set(r.day, Number(r.hits));
    if (r.median_s != null) {
      if (!dwellBySource.has(r.source)) dwellBySource.set(r.source, []);
      dwellBySource.get(r.source)!.push(Number(r.median_s));
    }
  }
  // A median of the days' medians: rough, but one unusual day cannot swamp the rest.
  const medianOf = (xs: number[]) =>
    xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
  const sources = [...bySource.entries()]
    .map(([s, m]) => ({ source: s, total: [...m.values()].reduce((a, b) => a + b, 0), days: m,
                        dwell: medianOf(dwellBySource.get(s) ?? []) }))
    .sort((a, b) => b.total - a.total);
  const peak = Math.max(1, ...rows.map(r => Number(r.hits)));

  const cell = { padding: "7px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 13 } as const;

  return (
    <main style={{ background: C.bg, color: "#E5E7EB", minHeight: "100vh", padding: "30px 22px 70px",
                   fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: 0, textAlign: "center" }}>loadq.ca — d&apos;où viennent les visites</h1>
      <p style={{ textAlign: "center", color: C.dim, fontSize: 13, margin: "6px auto 22px", maxWidth: "80ch" }}>
        {days} derniers jours · une ligne par source, une colonne par jour.{" "}
        <a href={`/traffic?days=${days === 14 ? 30 : 14}`} style={{ color: C.warm }}>
          voir {days === 14 ? "30" : "14"} jours
        </a>
      </p>

      {!t || !t.hits ? (
        <p style={{ maxWidth: "70ch", margin: "0 auto", background: C.card, border: `1px solid ${C.line}`,
                    borderRadius: 12, padding: "16px 18px", fontSize: 13.5, lineHeight: 1.7, color: "#C6CBD4" }}>
          Aucune visite enregistrée pour l&apos;instant. Le compteur ne compte qu&apos;à partir du moment où
          <b style={{ color: "#fff" }}> hit.js</b> est en ligne sur loadq.ca — et les liens publiés doivent porter
          leur étiquette, par exemple <code>loadq.ca/?s=tk-board</code>.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 22 }}>
            {[["visites", t.hits], ["temps médian", dur(t.median_s)], ["jours avec trafic", t.days],
              ["sources", t.sources], ["source principale", t.top_source ?? "—"]].map(([k, v]) => (
              <div key={String(k)} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
                                            padding: "12px 18px", minWidth: 150 }}>
                <div style={{ fontSize: 11.5, color: C.dim, textTransform: "uppercase", letterSpacing: .6 }}>{k}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto", maxWidth: 1400, margin: "0 auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", background: C.card,
                            border: `1px solid ${C.line}`, borderRadius: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: "left", color: C.dim, fontSize: 11.5 }}>SOURCE</th>
                  <th style={{ ...cell, textAlign: "right", color: C.dim, fontSize: 11.5 }}>TOTAL</th>
                  <th style={{ ...cell, textAlign: "right", color: C.dim, fontSize: 11.5 }}>TEMPS</th>
                  {dayList.map(d => (
                    <th key={d} style={{ ...cell, textAlign: "right", color: C.dim, fontSize: 11.5, whiteSpace: "nowrap" }}>
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.source}>
                    <td style={{ ...cell, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{s.source}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 800 }}>{s.total}</td>
                    <td style={{ ...cell, textAlign: "right", color: s.dwell ? "#fff" : "#3A4150" }}>{dur(s.dwell)}</td>
                    {dayList.map(d => {
                      const n = s.days.get(d) ?? 0;
                      return (
                        <td key={d} style={{ ...cell, textAlign: "right",
                              background: n ? `rgba(255,138,26,${(0.12 + 0.55 * (n / peak)).toFixed(2)})` : "transparent",
                              color: n ? "#fff" : "#3A4150" }}>
                          {n || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ maxWidth: "92ch", margin: "26px auto 0", background: "#0B0C0F", borderLeft: `3px solid ${C.warm}`,
                  borderRadius: 9, padding: "13px 16px", fontSize: 12.5, lineHeight: 1.75, color: "#C6CBD4" }}>
        <b style={{ color: "#fff" }}>« temps » est la durée médiane d&apos;une visite</b> — mesurée au moment où
        la page est quittée, donc absente quand l&apos;onglet est tué d&apos;un coup. Sous une seconde ou au-delà
        d&apos;une heure, la mesure est ignorée.{" "}
        <b style={{ color: "#fff" }}>« direct » veut dire sans étiquette :</b> quelqu&apos;un qui tape l&apos;adresse,
        ou qui arrive d&apos;une appli qui cache la provenance — TikTok et Instagram le font. C&apos;est pourquoi
        chaque publication doit porter son lien étiqueté ; sinon tout se retrouve dans « direct ».
      </p>
    </main>
  );
}
