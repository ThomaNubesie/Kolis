"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { Printer, ArrowLeft, Download, Mail, Send, X, Check } from "lucide-react";
import KolisLabel from "@/components/KolisLabel";

// Print CSS for the standard (letter, fills the page) vs thermal (4×6") variants.
const STD_CSS = `
  @page { size: auto; margin: 0; }
  @media print {
    html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
    body * { visibility: hidden !important; }
    .label, .label * { visibility: visible !important; }
    .label { position: absolute !important; inset: 0 !important; transform: none !important; margin: 0 !important; box-shadow: none !important; border: none !important; width: 100% !important; max-width: none !important; min-height: 100vh !important; border-radius: 0 !important; display: flex !important; flex-direction: column !important; }
    .qrrow { flex: 1 1 auto !important; align-items: center !important; }
    .qrrow img { width: 62mm !important; height: 62mm !important; }
    .noprint { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }`;
const THERMAL_CSS = `
  @page { size: 4in 6in; margin: 0; }
  @media print {
    html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
    body * { visibility: hidden !important; }
    .label, .label * { visibility: visible !important; }
    .label { position: absolute !important; inset: 0 !important; transform: none !important; margin: 0 !important; box-shadow: none !important; border: none !important; width: 4in !important; max-width: none !important; min-height: 6in !important; border-radius: 0 !important; display: flex !important; flex-direction: column !important; }
    .qrrow { flex: 1 1 auto !important; align-items: center !important; }
    .qrrow img { width: 38mm !important; height: 38mm !important; }
    .noprint { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }`;

export default function Label() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const goBack = () => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push("/shipper/shipments"); };
  const { active } = useOrg();
  const [p, setP] = useState<any | undefined>(undefined);
  const [thermal, setThermal] = useState(false);
  const decoded = decodeURIComponent(code);
  useEffect(() => { org.label(active.org_id, decoded).then(setP).catch(() => setP(null)); }, [active.org_id, decoded]);

  // ── Download / email the label as a PDF ──
  const [dlBusy, setDlBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fmt = () => (thermal ? "thermal" : "standard") as "standard" | "thermal";
  useEffect(() => { if (p?.recipient_email && !emailTo) setEmailTo(p.recipient_email); }, [p]); // eslint-disable-line

  const download = async () => {
    setDlBusy(true);
    try {
      const res = await org.labelPdf(active.org_id, decoded, fmt());
      const bytes = Uint8Array.from(atob(res.pdf_base64), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = res.filename || `${decoded}-label.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) { alert(e?.message || "Couldn't generate the PDF."); }
    setDlBusy(false);
  };

  const sendEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo.trim())) { setEmailMsg({ ok: false, text: "Enter a valid email address." }); return; }
    setEmailBusy(true); setEmailMsg(null);
    try {
      await org.emailLabel(active.org_id, decoded, emailTo.trim(), fmt());
      setEmailMsg({ ok: true, text: `Label emailed to ${emailTo.trim()} as a PDF.` });
    } catch (e: any) { setEmailMsg({ ok: false, text: e?.message || "The email could not be sent." }); }
    setEmailBusy(false);
  };

  if (p === undefined) return <div style={{ padding: 30 }}>Loading…</div>;
  if (p === null) return <div style={{ padding: 30 }}>Label not found.</div>;

  const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 13px", borderRadius: 9, fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "1px solid " + (on ? "#E11D6B" : "#3a3742"), background: on ? "#E11D6B" : "transparent", color: on ? "#fff" : "#cbb9c0" });
  const dkBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "#232028", color: "#fff", border: "1px solid #383442", borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" };

  return (
    <div className="page" style={{ background: "#141318", minHeight: "100vh", padding: 24 }}>
      <style>{thermal ? THERMAL_CSS : STD_CSS}</style>
      <div className="noprint" style={{ maxWidth: 780, margin: "0 auto 14px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => window.print()}><Printer size={16} strokeWidth={2} /> Print label</button>
          <button style={{ ...dkBtn, opacity: dlBusy ? 0.6 : 1 }} disabled={dlBusy} onClick={download}><Download size={16} strokeWidth={2} /> {dlBusy ? "Preparing…" : "Download PDF"}</button>
          <button style={{ ...dkBtn, ...(emailOpen ? { borderColor: "#E11D6B" } : {}) }} onClick={() => { setEmailOpen((v) => !v); setEmailMsg(null); }}><Mail size={16} strokeWidth={2} /> Email label</button>
          <button className="btn ghost" onClick={goBack} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={15} strokeWidth={2} /> Back</button>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
            <span style={{ color: "#8a8f9c", fontSize: 12 }}>Format:</span>
            <button onClick={() => setThermal(false)} style={chip(!thermal)}>Standard</button>
            <button onClick={() => setThermal(true)} style={chip(thermal)}>Thermal 4×6″</button>
          </div>
        </div>

        {emailOpen && (
          <div style={{ marginTop: 12, background: "#1c1a21", border: "1px solid #2f2b35", borderRadius: 12, padding: 14 }}>
            <label style={{ color: "#e7e2ea", fontSize: 12, fontWeight: 800, display: "block", marginBottom: 8 }}>Email this label as a PDF</label>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="name@email.com" type="email"
                style={{ flex: 1, minWidth: 220, background: "#100e14", border: "1px solid #35313d", borderRadius: 9, padding: "10px 12px", color: "#fff", fontSize: 13 }} />
              <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7, opacity: emailBusy ? 0.6 : 1 }} disabled={emailBusy} onClick={sendEmail}>
                <Send size={15} strokeWidth={2} /> {emailBusy ? "Sending…" : "Send label"}
              </button>
            </div>
            <div style={{ color: "#8a8f9c", fontSize: 11.5, marginTop: 8 }}>Attaches {p.code} as a print-ready PDF ({thermal ? "thermal 4×6″" : "standard"}){". Defaults to the recipient's email."}</div>
            {emailMsg && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 12.5, fontWeight: 700, color: emailMsg.ok ? "#3ddc97" : "#ff8080" }}>
                {emailMsg.ok ? <Check size={14} strokeWidth={2.6} /> : <X size={14} strokeWidth={2.6} />}{emailMsg.text}
              </div>
            )}
          </div>
        )}
      </div>
      <KolisLabel p={p} thermal={thermal} />
    </div>
  );
}
