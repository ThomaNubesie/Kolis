import { ImageResponse } from "next/og";

// Business home-screen icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#E11D6B", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 82, fontWeight: 800, lineHeight: 1 }}>Ko</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 4, marginTop: 8 }}>BUSINESS</div>
      </div>
    ),
    { ...size }
  );
}
