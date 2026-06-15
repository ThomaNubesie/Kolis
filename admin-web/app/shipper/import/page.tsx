"use client";
import { useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

// Minimal CSV parser (handles quoted fields + commas). Header row required.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = split(l); const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export default function BulkImport() {
  const { active } = useOrg();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [err, setErr] = useState("");

  const onFile = async (file: File) => {
    setErr(""); setResults(null);
    try { setRows(parseCsv(await file.text())); }
    catch { setErr("Could not read that CSV."); }
  };

  const submit = async () => {
    setBusy(true); setErr("");
    // A stable stamp so re-importing the same file dedups on client_ref.
    const stamp = `csv${rows.length}`;
    // Map CSV columns → RPC row shape; client_ref makes retries idempotent.
    const payload = rows.map((r, i) => ({
      client_ref: r.client_ref || `${stamp}-${i}`,
      to_name: r.to_name, to_phone: r.to_phone, to_email: r.to_email,
      to_city: r.to_city, from_city: r.from_city || "Ottawa", to_address: r.to_address,
      size: r.size || "small", dropoff_type: r.dropoff_type || "door",
      declared_value_cents: r.declared_value_cents,
    }));
    try { setResults(await org.bulkCreate(active.org_id, payload)); }
    catch (e: any) { setErr(e?.message || "Import failed."); }
    setBusy(false);
  };

  const ok = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <>
      <h1>Bulk import</h1>
      <div className="sub">Upload a CSV to create many shipments at once. Columns: <code>to_name, to_phone, to_city, to_address, size, declared_value_cents</code> (+ optional <code>client_ref, from_city, dropoff_type</code>).</div>
      <div className="card" style={{ maxWidth: 620 }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {rows.length > 0 && <div className="sub" style={{ marginTop: 10 }}>{rows.length} row(s) parsed.</div>}
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        {rows.length > 0 && !results && (
          <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>{busy ? "Importing…" : `Import ${rows.length} shipments`}</button>
        )}
      </div>
      {results && (
        <div className="card" style={{ maxWidth: 620 }}>
          <b>{ok} created</b>{failed.length ? <span className="pill pred" style={{ marginLeft: 8 }}>{failed.length} failed</span> : null}
          {failed.length > 0 && (
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Row</th><th>Error</th></tr></thead>
              <tbody>{failed.map((r) => <tr key={r.index}><td>{r.index}</td><td style={{ color: "var(--red)" }}>{r.error}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
