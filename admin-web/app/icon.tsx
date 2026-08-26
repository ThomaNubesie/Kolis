import { ImageResponse } from "next/og";
import { headers } from "next/headers";

// Favicon (browser tab). Host-aware: the Quorly domain gets the Quorly "Q" +
// four brand dots (transparent bg); every other host keeps the Kolis · Business
// magenta "Ko" tile. Reading headers() opts this route into per-request render.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const DOTS = ["#E8613A", "#F2B01E", "#2FA36B", "#2F3AA3"];

export default function Icon() {
  const quorly = /quorly/i.test(headers().get("host") || "");
  if (quorly) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: "#2F3AA3", letterSpacing: -2 }}>Q</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {DOTS.map((c) => (<div key={c} style={{ width: 8, height: 8, borderRadius: 8, background: c }} />))}
          </div>
        </div>
      ),
      { ...size }
    );
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#E11D6B", color: "#fff", borderRadius: 14, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>Ko</div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 3 }}>BUSINESS</div>
      </div>
    ),
    { ...size }
  );
}
