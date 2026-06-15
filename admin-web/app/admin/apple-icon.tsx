import { ImageResponse } from "next/og";

// Admin home-screen icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#15131A", color: "#E11D6B", fontSize: 96, fontWeight: 800, fontFamily: "sans-serif" }}>
        Ko
      </div>
    ),
    { ...size }
  );
}
