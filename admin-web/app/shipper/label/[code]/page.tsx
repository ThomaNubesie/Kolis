"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { Printer, ArrowLeft } from "lucide-react";
import KolisLabel from "@/components/KolisLabel";

export default function Label() {
  const { code } = useParams<{ code: string }>();
  const { active } = useOrg();
  const [p, setP] = useState<any | undefined>(undefined);
  useEffect(() => { org.label(active.org_id, decodeURIComponent(code)).then(setP).catch(() => setP(null)); }, [active.org_id, code]);

  if (p === undefined) return <div style={{ padding: 30 }}>Loading…</div>;
  if (p === null) return <div style={{ padding: 30 }}>Label not found.</div>;

  return (
    <div className="page" style={{ background: "#141318", minHeight: "100vh", padding: 24 }}>
      <style>{`
        @page { size: auto; margin: 0; }
        @media print {
          /* Print ONLY the label — hide the dashboard shell — and fill the whole page */
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
          body * { visibility: hidden !important; }
          .label, .label * { visibility: visible !important; }
          .label {
            position: absolute !important; inset: 0 !important; left: 0 !important; top: 0 !important;
            transform: none !important; margin: 0 !important; box-shadow: none !important; border: none !important;
            width: 100% !important; max-width: none !important; min-height: 100vh !important; border-radius: 0 !important;
            display: flex !important; flex-direction: column !important; page-break-inside: avoid;
          }
          .qrrow { flex: 1 1 auto !important; align-items: center !important; }
          .qrrow img { width: 62mm !important; height: 62mm !important; }
          .noprint { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <div className="noprint" style={{ maxWidth: 780, margin: "0 auto 14px", display: "flex", gap: 10 }}>
        <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => window.print()}><Printer size={16} strokeWidth={2} /> Print label</button>
        <a className="btn ghost" href="/shipper/shipments" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={15} strokeWidth={2} /> Shipments</a>
      </div>
      <KolisLabel p={p} />
    </div>
  );
}
