// Shared printable Kolis shipping label. Two variants:
//   • standard  — light-gray body, magenta header, dark footer (inkjet/laser)
//   • thermal   — pure black-on-white, sized for 4×6" thermal barcode printers
// SECURITY: the plaintext pickup/delivery codes are NEVER printed — only the QR
// (KOLIS|<parcel_id>|<kind>|<scan_token>), scannable by the assigned courier.
const qr = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(data)}`;

export default function KolisLabel({ p, thermal = false }: { p: any; thermal?: boolean }) {
  const pickupData = `KOLIS|${p.id}|pickup|${p.scan_token}`;
  const deliverData = `KOLIS|${p.id}|delivery|${p.scan_token}`;

  // Palette per variant.
  const C = thermal
    ? { card: "#fff", line: "#000", txt: "#000", muted: "#333", headBg: "#fff", headTxt: "#000", routeBg: "#fff", routeTxt: "#000", capA: "#000", capB: "#000", footBg: "#fff", footTxt: "#000", footLink: "#000", chip: "#fff" }
    : { card: "#EBE9E4", line: "#CFCBC2", txt: "#1b1a22", muted: "#6B6675", headBg: "#E11D6B", headTxt: "#fff", routeBg: "#FBEEF4", routeTxt: "#B81558", capA: "#B81558", capB: "#0E4A38", footBg: "#201f27", footTxt: "#9a95a3", footLink: "#FF5CA2", chip: "#fff" };

  const QrChip = ({ data, alt }: { data: string; alt: string }) => (
    <div style={{ display: "inline-block", background: C.chip, borderRadius: thermal ? 0 : 12, padding: thermal ? 4 : 10, border: thermal ? "1px solid #000" : "none" }}>
      <img src={qr(data)} alt={alt} style={{ width: 200, height: 200, maxWidth: "100%", display: "block" }} />
    </div>
  );

  return (
    <div className="label" style={{ maxWidth: thermal ? 400 : 780, margin: "0 auto", background: C.card, borderRadius: thermal ? 0 : 12, overflow: "hidden", border: `${thermal ? 1.5 : 1}px solid ${C.line}`, fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ background: C.headBg, color: C.headTxt, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, borderBottom: thermal ? `2px solid ${C.line}` : "none" }}>
        <div style={{ width: 40, height: 40, borderRadius: thermal ? 6 : 11, background: thermal ? "#fff" : "#fff", color: thermal ? "#000" : "#E11D6B", border: thermal ? "1.5px solid #000" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17 }}>Ko</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Kolis</div>
        <div style={{ marginLeft: "auto", fontSize: 27, fontWeight: 900, letterSpacing: 1 }}>{p.code}</div>
      </div>
      <div style={{ padding: "12px 22px", background: C.routeBg, borderBottom: `${thermal ? 1.5 : 1}px solid ${C.line}`, fontWeight: 800, color: C.routeTxt, fontSize: 19 }}>{p.from_city} → {p.to_city}</div>
      <div style={{ display: "flex", borderBottom: `${thermal ? 1.5 : 1}px solid ${C.line}` }}>
        <div style={{ flex: 1, padding: "11px 18px", borderRight: `${thermal ? 1.5 : 1}px solid ${C.line}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.muted }}>From · Sender</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.txt, marginTop: 3 }}>{p.sender_name}</div>
        </div>
        <div style={{ flex: 1, padding: "11px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.muted }}>To · Recipient</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.txt, marginTop: 3 }}>{p.recipient_name || "—"}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{p.dropoff_addr || p.to_city}{p.recipient_phone ? <><br />{p.recipient_phone}</> : null}</div>
        </div>
      </div>
      <div className="qrrow" style={{ display: "flex" }}>
        <div style={{ flex: 1, padding: "14px 12px", textAlign: "center", borderRight: `1px dashed ${C.line}` }}>
          <QrChip data={pickupData} alt="pickup QR" />
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.capA, marginTop: 10 }}>Pickup</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.3 }}>Courier scans within 100 m of pickup</div>
        </div>
        <div style={{ flex: 1, padding: "14px 12px", textAlign: "center" }}>
          <QrChip data={deliverData} alt="delivery QR" />
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.capB, marginTop: 10 }}>Delivery</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.3 }}>Courier scans within 100 m of drop-off</div>
        </div>
      </div>
      <div style={{ padding: "8px 18px", textAlign: "center", fontSize: 10.5, color: C.footTxt, borderTop: `${thermal ? 1.5 : 1}px solid ${C.line}`, background: C.footBg, lineHeight: 1.4 }}>{thermal ? "" : "🔒 "}The confirmation code is held only by the sender &amp; recipient — never printed here.</div>
      <div style={{ padding: "8px 18px", textAlign: "center", fontSize: 11, color: C.footTxt, background: C.footBg, borderTop: thermal ? "none" : "1px solid #3a3742" }}>Scan with the <b style={{ color: C.footLink }}>Kolis driver app</b> · powered by Concord Express · kolis.ca</div>
    </div>
  );
}
