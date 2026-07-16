"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

// Printable Kolis shipping label with the pickup + delivery scan QR codes.
// The QR encodes "KOLIS|<parcel_id>|<kind>|<scan_token>" — the driver app parses
// it, checks the 100 m geofence, and reveals the code.
const qr = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(data)}`;

export default function Label() {
  const { code } = useParams<{ code: string }>();
  const { active } = useOrg();
  const [p, setP] = useState<any | undefined>(undefined);
  useEffect(() => { org.label(active.org_id, decodeURIComponent(code)).then(setP).catch(() => setP(null)); }, [active.org_id, code]);

  if (p === undefined) return <div style={{ padding: 30 }}>Loading…</div>;
  if (p === null) return <div style={{ padding: 30 }}>Label not found.</div>;
  const pickupData = `KOLIS|${p.id}|pickup|${p.scan_token}`;
  const deliverData = `KOLIS|${p.id}|delivery|${p.scan_token}`;

  return (
    <div style={{ background: "#eee", minHeight: "100vh", padding: 24 }}>
      <style>{`@media print { .noprint{display:none!important} body{background:#fff} .label{box-shadow:none!important;border:none!important} }`}</style>
      <div className="noprint" style={{ maxWidth: 464, margin: "0 auto 14px", display: "flex", gap: 10 }}>
        <button className="btn" onClick={() => window.print()}>🖨 Print label</button>
        <a className="btn ghost" href="/shipper/shipments">← Shipments</a>
      </div>

      <div className="label" style={{ maxWidth: 464, margin: "0 auto", background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #cbc7be", fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif" }}>
        <div style={{ background: "#E11D6B", color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#E11D6B", fontWeight: 800 }}>Ko</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Kolis</div>
          <div style={{ marginLeft: "auto", fontSize: 20, fontWeight: 900 }}>{p.code}</div>
        </div>
        <div style={{ padding: "10px 18px", background: "#FBF3F7", borderBottom: "1px solid #E4E0D8", fontWeight: 800, color: "#141420", fontSize: 15 }}>{p.from_city} → {p.to_city}</div>
        <div style={{ display: "flex", borderBottom: "1px solid #E4E0D8" }}>
          <div style={{ flex: 1, padding: "12px 18px", borderRight: "1px solid #E4E0D8" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#9a958c" }}>From · Sender</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#141420", marginTop: 3 }}>{p.sender_name}</div>
          </div>
          <div style={{ flex: 1, padding: "12px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#9a958c" }}>To · Recipient</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#141420", marginTop: 3 }}>{p.recipient_name || "—"}</div>
            <div style={{ fontSize: 11.5, color: "#6B6675", marginTop: 2 }}>{p.dropoff_addr || p.to_city}{p.recipient_phone ? <><br />📱 {p.recipient_phone}</> : null}</div>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, padding: "16px 12px", textAlign: "center", borderRight: "1px dashed #E4E0D8" }}>
            <img src={qr(pickupData)} alt="pickup QR" style={{ width: 118, height: 118 }} />
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#B81558", marginTop: 9 }}>Pickup code</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 5, color: "#141420" }}>{p.pickup_code}</div>
            <div style={{ fontSize: 10.5, color: "#6B6675", marginTop: 3 }}>Driver scans within 100 m to pick up</div>
          </div>
          <div style={{ flex: 1, padding: "16px 12px", textAlign: "center" }}>
            <img src={qr(deliverData)} alt="delivery QR" style={{ width: 118, height: 118 }} />
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#0E4A38", marginTop: 9 }}>Delivery code</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 5, color: "#141420" }}>{p.delivery_code}</div>
            <div style={{ fontSize: 10.5, color: "#6B6675", marginTop: 3 }}>Recipient's code, scanned at drop-off</div>
          </div>
        </div>
        <div style={{ padding: "10px 18px", textAlign: "center", fontSize: 11, color: "#9a958c", borderTop: "1px solid #E4E0D8" }}>Scan with the <b style={{ color: "#E11D6B" }}>Kolis driver app</b> · powered by Concord Express · kolis.ca</div>
      </div>
    </div>
  );
}
