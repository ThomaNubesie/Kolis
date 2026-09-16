"use client";
// admin.loadq.ca/certify — the last step, the one a person takes.
//
// Everything before this is automatic: the reader opens each uploaded document, extracts what
// is printed on it, checks the name against the account and the plate against the car, and
// sends back anything plainly wrong. What it may never do is approve. The by-law asks the PTC
// to attest that a driver meets the requirements, and an attestation needs someone attesting.
//
// So this screen is built for the one thing it is for: checking the machine's work quickly and
// putting a name on the result. The document is large because it is the object of the
// decision. The extracted fields are drawn ON it, not merely listed beside it, because
// comparing a list to a photo is exactly the step people skip on document nine of twenty.
// Every cross-check shows both sides — not "name mismatch" but the two names, since a policy
// in a spouse's name is a judgement call that cannot be made from a red X alone.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BRAND_AZURE, BRAND_ORANGE } from "@/components/Brand";
import {
  ShieldCheck, AlertTriangle, HelpCircle, RotateCw, Maximize2,
  Check, Undo2, FileText, Loader2,
} from "lucide-react";

const C = {
  bg: "#0B0C0F", panel: "#15171C", panel2: "#1B1E25", line: "#232833",
  ink: "#F3F4F6", muted: "#8A909C", dim: "#5B6270",
  green: "#34D399", amber: "#FBBF24", red: "#F87171",
};

type Row = {
  doc_id: string; doc_type: string; label: string | null; label_fr: string | null;
  bylaw_ref: string | null; renew_months: number | null;
  driver: string; driver_id: string; phone: string | null;
  storage_path: string | null;
  machine_status: "pass" | "uncertain" | "error";
  machine_notes: string | null;
  extracted: Extracted | null;
  expires_on: string | null; submitted_at: string;
  account_name: string | null; account_plate: string | null; account_vehicle: string | null;
};

type Extracted = {
  document_kind?: string; full_name?: string | null; expiry_date?: string | null;
  issue_date?: string | null; document_number?: string | null;
  issuing_authority?: string | null; plate?: string | null;
  concerns?: string[]; confident?: boolean; legible?: boolean;
  name_agrees?: boolean | null; plate_agrees?: boolean | null;
};

const CHIP: Record<Row["machine_status"], { text: string; c: string; Icon: any }> = {
  // "Read cleanly" and not "approved" — the green must never read as a decision already made.
  pass:      { text: "Read cleanly — not yet certified", c: C.green, Icon: ShieldCheck },
  uncertain: { text: "Needs your eyes",                  c: C.amber, Icon: AlertTriangle },
  error:     { text: "Could not be read",                c: C.muted, Icon: HelpCircle },
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export default function Certify() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [gate, setGate] = useState<"loading" | "out" | "denied" | "ok">("loading");
  const [i, setI] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [rot, setRot] = useState(0);
  const [expiry, setExpiry] = useState("");
  const [why, setWhy] = useState("");
  const [backOpen, setBackOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rejected, setRejected] = useState<number | null>(null);

  const cur = rows && rows.length ? rows[Math.min(i, rows.length - 1)] : null;

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setGate("out"); return; }
    const { data } = await supabase.rpc("loadq_docs_to_certify");
    if (!data?.ok) { setGate("denied"); return; }
    setGate("ok");
    setRows((data.rows ?? []) as Row[]);
    const { data: ar } = await supabase.rpc("loadq_docs_auto_rejected", { p_days: 7 });
    if (ar?.ok) setRejected((ar.rows ?? []).length);
  }, []);

  useEffect(() => { load(); }, [load]);

  // A signed URL per document rather than a public bucket: these are people's licences.
  useEffect(() => {
    let dead = false;
    setUrl(null); setRot(0); setBackOpen(false);
    if (!cur?.storage_path) return;
    setExpiry(cur.expires_on ?? "");
    setWhy(cur.machine_status === "pass" ? "" : (cur.machine_notes ?? ""));
    supabase.storage.from("driver-docs").createSignedUrl(cur.storage_path, 600)
      .then(({ data }) => { if (!dead) setUrl(data?.signedUrl ?? null); });
    return () => { dead = true; };
  }, [cur?.doc_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = useCallback(async (approve: boolean) => {
    if (!cur || busy) return;
    if (!approve && !why.trim()) { setToast("Say why — the driver receives it."); return; }
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/loadq-doc-decide`,
      { method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ doc_id: cur.doc_id, approve,
                               notes: approve ? null : why.trim(),
                               expires_on: expiry || null }) },
    ).then((r) => r.json()).catch(() => ({ ok: false }));
    setBusy(false);

    if (!res?.ok) { setToast(res?.error ?? "That did not go through."); return; }
    setToast(approve
      ? `Certified — ${cur.driver}. Your name is on it.${res.driver_verified ? " All seven documents now current." : ""}`
      : res.notified ? `Sent back to ${cur.driver}.`
                     : `Sent back — but no SMS reached ${cur.driver}.`);
    setRows((r) => (r ?? []).filter((x) => x.doc_id !== cur.doc_id));
    setI((n) => Math.max(0, Math.min(n, (rows?.length ?? 1) - 2)));
    if (!approve) setRejected((n) => (n ?? 0));
  }, [cur, why, expiry, busy, rows]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  // Twenty documents should not need the mouse.
  const keyRef = useRef({ decide, backOpen, len: 0, i });
  keyRef.current = { decide, backOpen, len: rows?.length ?? 0, i };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      const s = keyRef.current;
      if (k === "a") s.decide(true);
      else if (k === "r") setBackOpen((b) => !b);
      else if (k === "j") setI((n) => Math.min(n + 1, s.len - 1));
      else if (k === "k") setI((n) => Math.max(n - 1, 0));
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  if (gate === "loading") return <Shell><Mid>Loading…</Mid></Shell>;
  if (gate === "out") return <Shell><Mid>Sign in to certify documents.</Mid></Shell>;
  if (gate === "denied") return <Shell><Mid>This screen is for administrators.</Mid></Shell>;

  return (
    <Shell>
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "13px 20px",
                       borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.5 }}>
            Load<span style={{ color: BRAND_ORANGE }}>Q</span>
          </div>
          <div style={{ fontSize: 10.5, letterSpacing: 0.5, color: C.muted, marginTop: 1 }}>
            CERTIFICATION · VÉRIFICATION DES DOCUMENTS
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {rejected !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                        color: C.muted, background: C.panel2, border: `1px solid ${C.line}`,
                        borderRadius: 8, padding: "6px 11px" }}>
            Auto-rejected this week{" "}
            <b style={{ color: rejected ? C.amber : C.muted, fontWeight: 700 }}>{rejected}</b>
          </div>
        )}
        <div style={{ fontSize: 12.5, color: C.muted }}>
          <b style={{ color: C.ink }}>{rows?.length ? Math.min(i, rows.length - 1) + 1 : 0}</b>
          {" of "}<b style={{ color: C.ink }}>{rows?.length ?? 0}</b> waiting
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "272px minmax(0,1fr) 372px",
                    height: "calc(100vh - 53px)" }}>
        {/* queue — doubtful first, not oldest first */}
        <div style={{ borderRight: `1px solid ${C.line}`, overflowY: "auto", background: C.panel }}>
          <div style={{ padding: "12px 15px 9px", fontSize: 10.5, letterSpacing: 0.5, color: C.dim }}>
            NEEDS A PERSON · doubtful first
          </div>
          {!rows?.length && (
            <div style={{ padding: "50px 20px", textAlign: "center", color: C.dim }}>
              Nothing waiting.<br />
              <span style={{ fontSize: 12 }}>Every document has been certified.</span>
            </div>
          )}
          {(rows ?? []).map((r, n) => (
            <div key={r.doc_id} onClick={() => setI(n)}
                 style={{ display: "flex", gap: 10, padding: "11px 15px",
                          borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                          alignItems: "flex-start",
                          background: n === i ? C.panel2 : undefined,
                          boxShadow: n === i ? `inset 3px 0 0 ${BRAND_ORANGE}` : undefined }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flex: "none",
                            background: CHIP[r.machine_status].c }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.driver}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                  {r.label ?? r.doc_type}
                </div>
                <div style={{ fontSize: 10.5, color: C.dim, marginTop: 3 }}>{ago(r.submitted_at)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* the document */}
        <div style={{ overflowY: "auto", padding: 22, display: "flex",
                      flexDirection: "column", alignItems: "center", gap: 13 }}>
          {cur && (
            <>
              <div style={{ display: "flex", gap: 7, alignItems: "center",
                            fontSize: 11.5, color: C.muted }}>
                <Tool onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw size={13} /> Rotate</Tool>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                     style={{ textDecoration: "none" }}>
                    <Tool><Maximize2 size={13} /> Full size</Tool>
                  </a>
                )}
                <span style={{ marginLeft: 6 }}>
                  Uploaded {new Date(cur.submitted_at).toLocaleString("en-CA",
                    { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>

              <div style={{ background: "#fff", borderRadius: 12, padding: 15, width: "100%",
                            maxWidth: 620, boxShadow: "0 14px 44px rgba(0,0,0,.5)" }}>
                {url
                  ? <img src={url} alt="" style={{ width: "100%", borderRadius: 8, display: "block",
                                                   transform: `rotate(${rot}deg)`,
                                                   transition: "transform .18s" }} />
                  : <div style={{ padding: "60px 20px", textAlign: "center", color: "#9CA3AF" }}>
                      <Loader2 size={22} style={{ opacity: .6 }} /><div style={{ marginTop: 8 }}>
                      {cur.storage_path ? "Opening…" : "No file on this document."}</div>
                    </div>}
              </div>

              <div style={{ fontSize: 11.5, color: C.dim, textAlign: "center", maxWidth: 560 }}>
                Check the fields on the right against the document itself before certifying.
              </div>
            </>
          )}
          {!cur && <Mid>Queue empty.</Mid>}
        </div>

        {/* the decision */}
        <div style={{ borderLeft: `1px solid ${C.line}`, overflowY: "auto",
                      background: C.panel, opacity: cur ? 1 : 0.35 }}>
          {cur && <Panel {...{ cur, expiry, setExpiry, why, setWhy, backOpen,
                               setBackOpen, decide, busy }} />}
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
                      background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10,
                      padding: "11px 17px", fontSize: 13, boxShadow: "0 10px 30px #0009", zIndex: 9 }}>
          {toast}
        </div>
      )}
    </Shell>
  );
}

function Panel({ cur, expiry, setExpiry, why, setWhy, backOpen, setBackOpen, decide, busy }: any) {
  const x: Extracted = cur.extracted ?? {};
  const chip = CHIP[cur.machine_status as Row["machine_status"]];

  // Both sides of every cross-check. A name that does not match may be a spouse's insurance
  // policy, which is a decision — and it cannot be made from a red X alone.
  const read: [string, string, { cmp?: string; v?: "ok" | "bad" }?][] = useMemo(() => {
    const r: [string, string, { cmp?: string; v?: "ok" | "bad" }?][] = [];
    if (x.document_kind) r.push(["Document", x.document_kind]);
    if (x.full_name !== undefined) r.push(["Name", x.full_name ?? "—",
      { cmp: `account: ${cur.account_name}`, v: x.name_agrees === false ? "bad" : x.name_agrees ? "ok" : undefined }]);
    if (x.document_number) r.push(["Number", x.document_number]);
    if (x.plate !== undefined && x.plate !== null) r.push(["Plate", x.plate,
      { cmp: cur.account_plate ? `vehicle on file: ${cur.account_plate}` : "no vehicle on file",
        v: x.plate_agrees === false ? "bad" : x.plate_agrees ? "ok" : undefined }]);
    if (x.issue_date) r.push(["Issued", x.issue_date]);
    if (x.expiry_date !== undefined) r.push(["Expires", x.expiry_date ?? "— none visible",
      { cmp: cur.expires_on && !x.expiry_date ? "" : undefined }]);
    if (x.issuing_authority) r.push(["Issued by", x.issuing_authority]);
    return r;
  }, [cur.doc_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Sec>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>{cur.driver}</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
          {cur.label ?? cur.doc_type}
          {cur.label_fr ? ` · ${cur.label_fr}` : ""}
        </div>
        {cur.bylaw_ref && (
          <div style={{ fontSize: 11, color: C.dim, marginTop: 5 }}>
            You are attesting under {cur.bylaw_ref}
          </div>
        )}
      </Sec>

      <Sec>
        <Lbl>AUTOMATED READ</Lbl>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999,
                       padding: "5px 11px", fontSize: 12, fontWeight: 700,
                       background: chip.c + "1F", color: chip.c }}>
          <chip.Icon size={14} /> {chip.text}
        </span>
        {cur.machine_notes && (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10,
                        borderLeft: `2px solid ${cur.machine_status === "pass" ? C.line : C.amber}`,
                        paddingLeft: 11 }}>
            {cur.machine_notes}
          </div>
        )}
      </Sec>

      {read.length > 0 && (
        <Sec>
          <Lbl>READ FROM THE DOCUMENT</Lbl>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <tbody>
              {read.map(([k, v, meta], n) => (
                <tr key={n}>
                  <td style={{ padding: "6px 0", color: C.muted, width: 104,
                               verticalAlign: "top", borderBottom: `1px solid ${C.line}` }}>{k}</td>
                  <td style={{ padding: "6px 0", fontWeight: 600, verticalAlign: "top",
                               borderBottom: `1px solid ${C.line}` }}>
                    {v}
                    {meta?.cmp ? (
                      <span style={{ display: "block", marginTop: 2, fontSize: 11.5, fontWeight: 400,
                                     color: meta.v === "ok" ? C.green : meta.v === "bad" ? C.red : C.muted }}>
                        {meta.v === "ok" ? "✓ " : meta.v === "bad" ? "✗ " : "· "}{meta.cmp}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sec>
      )}

      <Sec>
        <Lbl>EXPIRY ON FILE</Lbl>
        <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
               style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.ink,
                        borderRadius: 8, padding: "8px 10px", font: "inherit", width: "100%" }} />
        <div style={{ fontSize: 11, color: C.dim, marginTop: 5 }}>
          {x.expiry_date
            ? "Read off the document. Correct it if the machine got it wrong."
            : "Nothing readable — type it from the document."}
        </div>
      </Sec>

      <div style={{ padding: "15px 17px", display: "grid", gap: 9, position: "sticky", bottom: 0,
                    background: C.panel, borderTop: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, textAlign: "center" }}>
          The automated read prepares this decision.<br />It does not make it.
        </div>
        <Btn onClick={() => decide(true)} disabled={busy}
             style={{ background: C.green, color: "#06281C" }}>
          {busy ? <Loader2 size={16} /> : <Check size={16} />} Certify · Approve <Kbd>A</Kbd>
        </Btn>
        <Btn onClick={() => setBackOpen((b: boolean) => !b)} disabled={busy}
             style={{ border: `1.5px solid ${C.red}55`, color: C.red }}>
          <Undo2 size={16} /> Send back <Kbd>R</Kbd>
        </Btn>
      </div>

      {backOpen && (
        <div style={{ padding: "15px 17px", borderTop: `1px solid ${C.line}`, background: C.panel2 }}>
          <Lbl>WHY — the driver receives this</Lbl>
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2}
                    style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink,
                             borderRadius: 8, padding: "8px 10px", font: "inherit", width: "100%" }} />
          <div style={{ fontSize: 11, color: C.dim, margin: "11px 0 6px" }}>
            SMS to {cur.phone ?? "— no number on file"}
          </div>
          {/* The machine's note becomes the driver's message, so it has to read like something
              a person would write to them — not like an internal status. */}
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10,
                        padding: "11px 13px", fontSize: 12.5, lineHeight: 1.55,
                        whiteSpace: "pre-wrap" }}>
{`LoadQ — votre document (${cur.label_fr ?? cur.label}) n'a pas pu etre accepte :
${why || "…"}

Reprenez la photo dans l'application LoadQ.

Your ${cur.label ?? cur.doc_type} could not be accepted. Please re-upload it in the LoadQ app.`}
          </div>
          <Btn onClick={() => decide(false)} disabled={busy}
               style={{ marginTop: 11, border: `1.5px solid ${C.red}55`, color: C.red }}>
            {busy ? <Loader2 size={16} /> : <Undo2 size={16} />} Send it
          </Btn>
        </div>
      )}
    </>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────── */
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ minHeight: "100vh", background: C.bg, color: C.ink,
                fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" }}>
    {children}
  </div>
);
const Mid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "70px 20px", textAlign: "center", color: C.dim }}>{children}</div>
);
const Sec = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "15px 17px", borderBottom: `1px solid ${C.line}` }}>{children}</div>
);
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10.5, letterSpacing: 0.5, color: C.dim, marginBottom: 9 }}>{children}</div>
);
const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span style={{ background: "#00000055", border: `1px solid ${C.line}`, borderRadius: 4,
                 padding: "1px 5px", fontSize: 10.5, opacity: 0.75 }}>{children}</span>
);
function Tool({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
            style={{ display: "inline-flex", alignItems: "center", gap: 5,
                     border: `1px solid ${C.line}`, borderRadius: 7, padding: "4px 10px",
                     fontSize: 11.5, color: C.muted, background: "none", cursor: "pointer" }}>
      {children}
    </button>
  );
}
function Btn({ children, onClick, disabled, style }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                     borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14,
                     border: 0, background: "none", cursor: disabled ? "default" : "pointer",
                     opacity: disabled ? 0.55 : 1, width: "100%", ...style }}>
      {children}
    </button>
  );
}
