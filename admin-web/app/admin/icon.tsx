import { ImageResponse } from "next/og";

// Admin favicon: dark tile, magenta "Ko" over an "ADMIN" label.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#15131A", color: "#E11D6B", borderRadius: 14, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>Ko</div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 3, color: "#fff" }}>ADMIN</div>
      </div>
    ),
    { ...size }
  );
}
