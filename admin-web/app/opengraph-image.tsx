import { ImageResponse } from "next/og";
import { headers } from "next/headers";

// Link-preview thumbnail. Host-aware, exactly like app/icon.tsx: quorly.ca gets
// the Quorly card, every other host keeps Kolis · Business.
//
// This is what a pasted link renders as in iMessage, WhatsApp, Slack and every
// other unfurler. Without the split, sharing quorly.ca showed a magenta "Ship
// more. Bill monthly." card for a product that has nothing to do with shipping.
// Reading headers() opts this route into per-request render.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Quorly — decide together, on the record";

const DOTS = ["#E8613A", "#F2B01E", "#2FA36B", "#2F3AA3"];

export default function OpengraphImage() {
  const quorly = /quorly/i.test(headers().get("host") || "");

  if (quorly) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#FAF8F4", color: "#1C1B19", fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700 }}>
            <div style={{ width: 72, height: 72, background: "#2F3AA3", color: "#fff", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 22, fontSize: 40, fontWeight: 900 }}>Q</div>
            Quorly
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            {DOTS.map((c) => (<div key={c} style={{ width: 16, height: 16, borderRadius: 16, background: c }} />))}
          </div>
          <div style={{ fontSize: 74, fontWeight: 800, marginTop: 24, lineHeight: 1.05, color: "#2F3AA3" }}>Decide together, on the record.</div>
          <div style={{ fontSize: 30, opacity: 0.75, marginTop: 18 }}>Boards, associations and committees — every entry timed, numbered and signed.</div>
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #E11D6B 0%, #9c1048 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 72, height: 72, background: "#fff", color: "#E11D6B", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 22, fontSize: 38, fontWeight: 800 }}>Ko</div>
          Kolis for Business
        </div>
        <div style={{ fontSize: 74, fontWeight: 800, marginTop: 34, lineHeight: 1.05 }}>Ship more. Bill monthly.</div>
        <div style={{ fontSize: 30, opacity: 0.85, marginTop: 18 }}>Net-terms shipping for businesses · by Concord Express</div>
      </div>
    ),
    { ...size }
  );
}
