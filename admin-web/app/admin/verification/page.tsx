"use client";
import { useCallback, useEffect, useState } from "react";
import { api, supabase } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Driver documents waiting on a decision. The mobile app has had this screen for a while; the web
// admin did not, which meant the backlog was only visible to whoever had the app open.
//
// Worth knowing while you work this queue: machine pre-reading runs through loadq-doc-verify, and
// it returns reader_unavailable whenever the Anthropic balance is empty. Anything submitted during
// such a gap has had no automatic check at all — the eye on it here is the only one.
const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");

const TABS: [string, string, string][] = [
  ["pending", "Waiting", "En attente"],
  ["approved", "Approved", "Approuvés"],
  ["rejected", "Rejected", "Refusés"],
  ["expired", "Expired", "Expirés"],
  ["all", "All", "Tous"],
];

const LABEL: Record<string, [string, string]> = {
  drivers_license: ["Driver's licence", "Permis de conduire"],
  insurance: ["Insurance", "Assurance"],
  registration: ["Registration", "Immatriculation"],
  police_record_check: ["Police record check", "Vérification policière"],
  driving_record: ["Driving record", "Dossier de conduite"],
  charges_declaration: ["Charges declaration", "Déclaration d'accusations"],
  safety_certificate: ["Safety certificate", "Certificat de sécurité"],
};

type Row = {
  doc_id: string; driver_id: string; full_name: string | null; phone: string | null;
  email: string | null; plate: string | null; doc_type: string; status: string;
  storage_path: string; expires_on: string | null; doc_number: string | null;
  review_notes: string | null; submitted_at: string | null; driver_verified: boolean;
};

export default function Verification() {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((t = tab) => {
    setLoading(true);
    api.docsQueue(t).then((d) => setRows((d as Row[]) || [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [tab]);
  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line

  const view = async (path: string) => {
    const { data } = await supabase.storage.from("driver-docs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else alert(fr ? "Impossible d'ouvrir le document." : "Could not open the document.");
  };

  const decide = async (r: Row, decision: "approved" | "rejected") => {
    // A rejection with no reason gives the driver nothing to fix, so it is asked for rather than
    // optional — they see this text in the app.
    let notes: string | null = null;
    if (decision === "rejected") {
      notes = window.prompt(fr ? "Raison du refus (le chauffeur la verra) :" : "Reason for rejection (the driver sees this):");
      if (notes === null) return;
      if (!notes.trim()) { alert(fr ? "Une raison est requise." : "A reason is required."); return; }
    }
    setBusy(r.doc_id);
    try { await api.docReview(r.doc_id, decision, notes); load(); }
    catch (e: any) { alert(e?.message || "failed"); }
    finally { setBusy(null); }
  };

  const chip = (st: string) => {
    const map: Record<string, [string, string, string, string]> = {
      pending:  ["#fff7ed", "#9a3412", "Waiting", "En attente"],
      approved: ["#ecfdf5", "#065f46", "Approved", "Approuvé"],
      rejected: ["#fef2f2", "#991b1b", "Rejected", "Refusé"],
      expired:  ["#f3f4f6", "#374151", "Expired", "Expiré"],
    };
    const [bg, c, en, f] = map[st] || ["#f3f4f6", "#374151", st, st];
    return <span style={{ background: bg, color: c, fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999 }}>{fr ? f : en}</span>;
  };

  return (
    <div style={{ padding: 4 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
        {fr ? "Vérification des chauffeurs" : "Driver verification"}
      </h1>
      <p style={{ color: "#667", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 700 }}>
        {fr
          ? "Documents soumis, en attente d'une décision. Ouvrez le fichier, puis approuvez ou refusez — un refus exige une raison, que le chauffeur verra."
          : "Submitted documents waiting on a decision. Open the file, then approve or reject — a rejection requires a reason, which the driver sees."}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, en, f]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: "1px solid " + (tab === k ? "#111827" : "#e5e7eb"),
            background: tab === k ? "#111827" : "#fff", color: tab === k ? "#fff" : "#374151",
          }}>{fr ? f : en}</button>
        ))}
      </div>

      {loading ? <p style={{ color: "#889" }}>{fr ? "Chargement…" : "Loading…"}</p>
        : rows.length === 0 ? <p style={{ color: "#889" }}>{fr ? "Rien ici." : "Nothing here."}</p>
        : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.doc_id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>
                    {r.full_name || (fr ? "(sans nom)" : "(no name)")}{" "}
                    {r.driver_verified && <span style={{ fontSize: 11.5, color: "#065f46", fontWeight: 700 }}>✓ {fr ? "vérifié" : "verified"}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#556", marginTop: 2 }}>
                    {(LABEL[r.doc_type] || [r.doc_type, r.doc_type])[fr ? 1 : 0]}
                    {r.plate ? " · " + r.plate : ""}{r.phone ? " · " + r.phone : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {chip(r.status)}
                  <div style={{ fontSize: 12, color: "#778", marginTop: 4 }}>{when(r.submitted_at)}</div>
                </div>
              </div>

              {(r.doc_number || r.expires_on || r.review_notes) && (
                <div style={{ fontSize: 12.5, color: "#667", marginTop: 8, lineHeight: 1.5 }}>
                  {r.doc_number && <>{fr ? "N° " : "No. "}{r.doc_number}{" · "}</>}
                  {r.expires_on && <>{fr ? "expire " : "expires "}{r.expires_on}</>}
                  {r.review_notes && <div style={{ fontStyle: "italic", marginTop: 3 }}>“{r.review_notes}”</div>}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => view(r.storage_path)} style={btn("#fff", "#111827")}>
                  {fr ? "Ouvrir le document" : "Open document"}
                </button>
                {r.status === "pending" && (
                  <>
                    <button disabled={busy === r.doc_id} onClick={() => decide(r, "approved")} style={btn("#111827", "#fff")}>
                      {fr ? "Approuver" : "Approve"}
                    </button>
                    <button disabled={busy === r.doc_id} onClick={() => decide(r, "rejected")} style={btn("#fff", "#991b1b")}>
                      {fr ? "Refuser" : "Reject"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn = (bg: string, c: string) => ({
  padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
  cursor: "pointer", border: "1px solid #d1d5db", background: bg, color: c,
});
