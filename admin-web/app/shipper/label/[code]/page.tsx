"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { Printer, ArrowLeft } from "lucide-react";
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
  const { active } = useOrg();
  const [p, setP] = useState<any | undefined>(undefined);
  const [thermal, setThermal] = useState(false);
  useEffect(() => { org.label(active.org_id, decodeURIComponent(code)).then(setP).catch(() => setP(null)); }, [active.org_id, code]);

  if (p === undefined) return <div style={{ padding: 30 }}>Loading…</div>;
  if (p === null) return <div style={{ padding: 30 }}>Label not found.</div>;

  const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 13px", borderRadius: 9, fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "1px solid " + (on ? "#E11D6B" : "#3a3742"), background: on ? "#E11D6B" : "transparent", color: on ? "#fff" : "#cbb9c0" });

  return (
    <div className="page" style={{ background: "#141318", minHeight: "100vh", padding: 24 }}>
      <style>{thermal ? THERMAL_CSS : STD_CSS}</style>
      <div className="noprint" style={{ maxWidth: 780, margin: "0 auto 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => window.print()}><Printer size={16} strokeWidth={2} /> Print label</button>
        <a className="btn ghost" href="/shipper/shipments" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={15} strokeWidth={2} /> Shipments</a>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <span style={{ color: "#8a8f9c", fontSize: 12 }}>Format:</span>
          <button onClick={() => setThermal(false)} style={chip(!thermal)}>Standard</button>
          <button onClick={() => setThermal(true)} style={chip(thermal)}>Thermal 4×6″</button>
        </div>
      </div>
      <KolisLabel p={p} thermal={thermal} />
    </div>
  );
}
