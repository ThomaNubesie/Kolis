// Shared printable Kolis shipping label (light-gray body, magenta header, dark
// footer). Rendered by the single-label page and the bulk "print all" page.
// SECURITY: the plaintext pickup/delivery codes are NEVER printed — only the QR
// (KOLIS|<parcel_id>|<kind>|<scan_token>), scannable by the assigned courier.
const qr = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(data)}`;

const MAG = "#E11D6B";
const CARD = "#EBE9E4", LINE = "#CFCBC2", TXT = "#1b1a22", MUTED = "#6B6675";
const CAP_MAG = "#B81558", CAP_GREEN = "#0E4A38";
const FOOT_BG = "#201f27", FOOT_TXT = "#9a95a3", FOOT_LINK = "#FF5CA2";

const QrChip = ({ data, alt }: { data: string; alt: string }) => (
  <div style={{ display: "inline-block", background: "#fff", borderRadius: 12, padding: 10 }}>
    <img src={qr(data)} alt={alt} style={{ width: 200, height: 200, maxWidth: "100%", display: "block" }} />
  </div>
);

export default function KolisLabel({ p }: { p: any }) {
  const pickupData = `KOLIS|${p.id}|pickup|${p.scan_token}`;
  const deliverData = `KOLIS|${p.id}|delivery|${p.scan_token}`;
  return (
    <div className="label" style={{ maxWidth: 780, margin: "0 auto", background: CARD, borderRadius: 12, overflow: "hidden", border: `1px solid ${LINE}`, fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ background: MAG, color: "#fff", padding: "18px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: MAG, fontWeight: 800, fontSize: 18 }}>Ko</div>
        <div style={{ fontSize: 23, fontWeight: 800 }}>Kolis</div>
        <div style={{ marginLeft: "auto", fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>{p.code}</div>
      </div>
      <div style={{ padding: "13px 24px", background: "#FBEEF4", borderBottom: `1px solid ${LINE}`, fontWeight: 800, color: CAP_MAG, fontSize: 20 }}>{p.from_city} → {p.to_city}</div>
      <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ flex: 1, padding: "12px 18px", borderRight: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>From · Sender</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginTop: 3 }}>{p.sender_name}</div>
        </div>
        <div style={{ flex: 1, padding: "12px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>To · Recipient</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginTop: 3 }}>{p.recipient_name || "—"}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{p.dropoff_addr || p.to_city}{p.recipient_phone ? <><br />📱 {p.recipient_phone}</> : null}</div>
        </div>
      </div>
      <div className="qrrow" style={{ display: "flex" }}>
        <div style={{ flex: 1, padding: "16px 12px", textAlign: "center", borderRight: `1px dashed ${LINE}` }}>
          <QrChip data={pickupData} alt="pickup QR" />
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: CAP_MAG, marginTop: 12 }}>Pickup</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.35 }}>Courier scans here within 100 m of pickup</div>
        </div>
        <div style={{ flex: 1, padding: "16px 12px", textAlign: "center" }}>
          <QrChip data={deliverData} alt="delivery QR" />
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: CAP_GREEN, marginTop: 12 }}>Delivery</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.35 }}>Courier scans here within 100 m of drop-off</div>
        </div>
      </div>
      <div style={{ padding: "9px 18px", textAlign: "center", fontSize: 10.5, color: FOOT_TXT, borderTop: `1px solid ${LINE}`, background: FOOT_BG, lineHeight: 1.4 }}>🔒 The confirmation code is held only by the sender &amp; recipient — never printed here.</div>
      <div style={{ padding: "9px 18px", textAlign: "center", fontSize: 11, color: FOOT_TXT, background: FOOT_BG, borderTop: "1px solid #3a3742" }}>Scan with the <b style={{ color: FOOT_LINK }}>Kolis driver app</b> · powered by Concord Express · kolis.ca</div>
    </div>
  );
}
