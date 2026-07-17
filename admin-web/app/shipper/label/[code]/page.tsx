"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

// Printable Kolis shipping label (dark theme) with the pickup + delivery scan QR.
// The QR encodes "KOLIS|<parcel_id>|<kind>|<scan_token>" — the driver app parses
// it, checks the 100 m geofence, and reveals the code to the courier.
// SECURITY: the plaintext pickup/delivery codes are NEVER printed on the label —
// only the sender and recipient hold them; they confirm the handoff to the courier.
const qr = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(data)}`;

// palette
const MAG = "#E11D6B", MAG_L = "#FF5CA2", GREEN_L = "#35D6A0";
const CARD = "#1b1a22", LINE = "#34313f", TXT = "#f2f0f6", MUTED = "#9a95a3";

export default function Label() {
  const { code } = useParams<{ code: string }>();
  const { active } = useOrg();
  const [p, setP] = useState<any | undefined>(undefined);
  useEffect(() => { org.label(active.org_id, decodeURIComponent(code)).then(setP).catch(() => setP(null)); }, [active.org_id, code]);

  if (p === undefined) return <div style={{ padding: 30 }}>Loading…</div>;
  if (p === null) return <div style={{ padding: 30 }}>Label not found.</div>;
  const pickupData = `KOLIS|${p.id}|pickup|${p.scan_token}`;
  const deliverData = `KOLIS|${p.id}|delivery|${p.scan_token}`;

  // A QR sits on its own white chip so it always scans, even on the dark label.
  const QrChip = ({ data, alt }: { data: string; alt: string }) => (
    <div style={{ display: "inline-block", background: "#fff", borderRadius: 10, padding: 8 }}>
      <img src={qr(data)} alt={alt} style={{ width: 116, height: 116, maxWidth: "100%", display: "block" }} />
    </div>
  );

  return (
    <div className="page" style={{ background: "#141318", minHeight: "100vh", padding: 24 }}>
      <style>{`
        @page { size: auto; margin: 12mm; }
        @media print {
          /* Print ONLY the label — hide the entire dashboard shell — and centre it */
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
          body * { visibility: hidden !important; }
          .label, .label * { visibility: visible !important; }
          .label {
            position: absolute !important; left: 50% !important; top: 0 !important;
            transform: translateX(-50%) !important;
            margin: 0 !important; box-shadow: none !important;
            width: 150mm !important; max-width: 150mm !important; page-break-inside: avoid;
          }
          .noprint { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <div className="noprint" style={{ maxWidth: 464, margin: "0 auto 14px", display: "flex", gap: 10 }}>
        <button className="btn" onClick={() => window.print()}>🖨 Print label</button>
        <a className="btn ghost" href="/shipper/shipments">← Shipments</a>
      </div>

      <div className="label" style={{ maxWidth: 464, margin: "0 auto", background: CARD, borderRadius: 10, overflow: "hidden", border: `1px solid ${LINE}`, fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif" }}>
        <div style={{ background: MAG, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: MAG, fontWeight: 800 }}>Ko</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Kolis</div>
          <div style={{ marginLeft: "auto", fontSize: 20, fontWeight: 900 }}>{p.code}</div>
        </div>
        <div style={{ padding: "10px 18px", background: "#241019", borderBottom: `1px solid ${LINE}`, fontWeight: 800, color: "#fff", fontSize: 15 }}>{p.from_city} → {p.to_city}</div>
        <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ flex: 1, padding: "12px 18px", borderRight: `1px solid ${LINE}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>From · Sender</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginTop: 3 }}>{p.sender_name}</div>
          </div>
          <div style={{ flex: 1, padding: "12px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>To · Recipient</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginTop: 3 }}>{p.recipient_name || "—"}</div>
            <div style={{ fontSize: 11.5, color: "#b9b4c2", marginTop: 2 }}>{p.dropoff_addr || p.to_city}{p.recipient_phone ? <><br />📱 {p.recipient_phone}</> : null}</div>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, padding: "16px 12px", textAlign: "center", borderRight: `1px dashed ${LINE}` }}>
            <QrChip data={pickupData} alt="pickup QR" />
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: MAG_L, marginTop: 9 }}>Pickup</div>
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.35 }}>Courier scans here within 100 m of pickup</div>
          </div>
          <div style={{ flex: 1, padding: "16px 12px", textAlign: "center" }}>
            <QrChip data={deliverData} alt="delivery QR" />
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: GREEN_L, marginTop: 9 }}>Delivery</div>
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.35 }}>Courier scans here within 100 m of drop-off</div>
          </div>
        </div>
        <div style={{ padding: "9px 18px", textAlign: "center", fontSize: 10.5, color: MUTED, borderTop: `1px solid ${LINE}`, background: "#201f27", lineHeight: 1.4 }}>🔒 The confirmation code is held only by the sender &amp; recipient — never printed here.</div>
        <div style={{ padding: "9px 18px", textAlign: "center", fontSize: 11, color: MUTED, borderTop: `1px solid ${LINE}` }}>Scan with the <b style={{ color: MAG_L }}>Kolis driver app</b> · powered by Concord Express · kolis.ca</div>
      </div>
    </div>
  );
}
