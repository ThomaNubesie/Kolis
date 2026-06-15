import { ImageResponse } from "next/og";

// Business link-preview thumbnail (shown when business.kolis.ca is shared).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Kolis for Business";

export default function OpengraphImage() {
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
