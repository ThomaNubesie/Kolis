// loadq-city-records — the trip records the Chief License Inspector may ask for.
//
// Ottawa PTC guide, data sharing: keep records "for a period of not less than 3 years" and
// make them available "within 48 hours following a request… in an accessible format".
//
// 48 hours is not long enough to invent a report under pressure, so this exists before the
// request does. CSV because that is what a regulator opens without asking anyone for help.
//
// POST { from:"2026-01-01", to:"2026-12-31", format:"csv"|"json" }  → per-trip records
// POST { year: 2026, summary: true }                                → the annual counts
// Gated by x-kolis-secret: these are passengers' movements, not a public dataset.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATE = "kolis_notify_9f3a2c7b1e6d4084";

// The guide's field order, so a column never has to be explained in a covering letter.
const COLUMNS: [string, string][] = [
  ["channel", "Channel"],
  ["trip_id", "Trip ID"],
  ["status", "Requested and fulfilled / not fulfilled"],
  ["requested_at", "Date and time requested"],
  ["fulfilled_at", "Date and time fulfilled"],
  ["cancel_reason", "Reason not fulfilled"],
  ["origin", "Geographic start point"],
  ["origin_fsa", "Start postal (FSA)"],
  ["destination", "Geographic end point"],
  ["destination_fsa", "End postal (FSA)"],
  ["driver_name", "PTC Driver full name"],
  ["plate", "PTC Vehicle licence plate"],
  ["duration_minutes", "Trip duration (minutes)"],
  ["distance_km", "Trip distance (km)"],
  ["enroute_minutes", "Minutes en route to pick up"],
  ["transporting_minutes", "Minutes transporting passengers"],
  ["passengers", "Passengers"],
];

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // A cancellation reason can contain commas, quotes and newlines — some of ours are whole
  // paragraphs. Quote everything rather than hope.
  return `"${s.replace(/"/g, '""')}"`;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== GATE)
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 });
  const db = createClient(URL_, SRK, { auth: { persistSession: false } });

  try {
    const b = await req.json().catch(() => ({} as any));

    if (b.summary) {
      const year = Number(b.year) || new Date().getFullYear();
      const { data, error } = await db.rpc("loadq_city_annual_summary", { p_year: year });
      if (error) throw error;
      return new Response(JSON.stringify(data, null, 1),
        { headers: { "Content-Type": "application/json" } });
    }

    const from = b.from ?? `${new Date().getFullYear()}-01-01`;
    const to = b.to ?? `${new Date().getFullYear()}-12-31`;
    const { data, error } = await db.rpc("loadq_city_trip_records", { p_from: from, p_to: to });
    if (error) throw error;
    if (!data?.ok) return new Response(JSON.stringify(data), { status: 403 });

    const rows = (data.rows ?? []) as Record<string, unknown>[];
    if (b.format === "json") {
      return new Response(JSON.stringify(data, null, 1),
        { headers: { "Content-Type": "application/json" } });
    }

    const head = COLUMNS.map(([, label]) => esc(label)).join(",");
    const body = rows.map((r) => COLUMNS.map(([k]) => esc(r[k])).join(",")).join("\n");
    // A leading BOM so Excel opens the accented place names correctly rather than as mojibake.
    const csv = "﻿" + head + "\n" + body + "\n";

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="LoadQ trip records ${from} to ${to}.csv"`,
        "X-Row-Count": String(rows.length),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
