"use client";
import { useMemo, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { emailOk, phoneOk, nameOk, cityOk } from "@/lib/validate";

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
  const { t } = useLang();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [err, setErr] = useState("");

  const onFile = async (file: File) => {
    setErr(""); setResults(null);
    try { setRows(parseCsv(await file.text())); }
    catch { setErr(t("Could not read that CSV.", "Impossible de lire ce fichier CSV.")); }
  };

  // Validate every parsed row before allowing the import (same checks as the
  // create/clients forms): name, phone, served city, address, and email if given.
  const issues = useMemo(() => rows.map((r, i) => {
    const p: string[] = [];
    if (!nameOk(r.to_name)) p.push(t("name", "nom"));
    if (!phoneOk(r.to_phone)) p.push(t("phone", "téléphone"));
    if (!cityOk(r.to_city)) p.push(t("city not served", "ville non desservie"));
    if (r.from_city && !cityOk(r.from_city)) p.push(t("from_city not served", "ville de départ non desservie"));
    if (!(r.to_address || "").trim()) p.push(t("address", "adresse"));
    if ((r.to_email || "").trim() && !emailOk(r.to_email)) p.push(t("email", "courriel"));
    return { row: i + 1, problems: p };
  }).filter((x) => x.problems.length), [rows, t]);

  const submit = async () => {
    if (issues.length) { setErr(t(`Fix ${issues.length} row(s) before importing.`, `Corrigez ${issues.length} ligne(s) avant l’import.`)); return; }
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
    catch (e: any) { setErr(e?.message || t("Import failed.", "Échec de l’import.")); }
    setBusy(false);
  };

  const ok = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <>
      <h1>{t("Bulk import", "Import en lot")}</h1>
      <div className="sub">{t("Upload a CSV to create many shipments at once. Columns:", "Téléversez un CSV pour créer plusieurs envois à la fois. Colonnes :")} <code>to_name, to_phone, to_city, to_address, size, declared_value_cents</code> {t("(+ optional", "(+ optionnel")} <code>to_email, client_ref, from_city, dropoff_type</code>). {t("Cities must be served cities; phones 10 digits; emails valid.", "Les villes doivent être desservies ; téléphones à 10 chiffres ; courriels valides.")}</div>
      <div className="card" style={{ maxWidth: 620 }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {rows.length > 0 && <div className="sub" style={{ marginTop: 10 }}>{t(`${rows.length} row(s) parsed.`, `${rows.length} ligne(s) analysée(s).`)}{issues.length === 0 ? " ✓" : ""}</div>}
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        {issues.length > 0 && (
          <div style={{ marginTop: 12, background: "rgba(220,38,38,.06)", border: "1px solid rgba(220,38,38,.25)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: "#b91c1c", marginBottom: 6 }}>{t(`${issues.length} row(s) need fixing before import`, `${issues.length} ligne(s) à corriger avant l’import`)}</div>
            <div style={{ maxHeight: 160, overflow: "auto", fontSize: 12, color: "#7a2420", lineHeight: 1.7 }}>
              {issues.slice(0, 20).map((x) => <div key={x.row}><b>{t("Row", "Ligne")} {x.row}:</b> {x.problems.join(", ")}</div>)}
              {issues.length > 20 && <div>… {t(`and ${issues.length - 20} more`, `et ${issues.length - 20} de plus`)}</div>}
            </div>
          </div>
        )}
        {rows.length > 0 && !results && (
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || issues.length > 0} onClick={submit}>{busy ? t("Importing…", "Import en cours…") : t(`Import ${rows.length} shipments`, `Importer ${rows.length} envois`)}</button>
        )}
      </div>
      {results && (
        <div className="card" style={{ maxWidth: 620 }}>
          <b>{t(`${ok} created`, `${ok} créés`)}</b>{failed.length ? <span className="pill pred" style={{ marginLeft: 8 }}>{t(`${failed.length} failed`, `${failed.length} échoués`)}</span> : null}
          {failed.length > 0 && (
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>{t("Row", "Ligne")}</th><th>{t("Error", "Erreur")}</th></tr></thead>
              <tbody>{failed.map((r) => <tr key={r.index}><td>{r.index}</td><td style={{ color: "var(--red)" }}>{r.error}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
