import { ImageResponse } from "next/og";

// Admin favicon: dark tile with magenta "Ko" — distinct from the business mark.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#15131A", color: "#E11D6B", fontSize: 34, fontWeight: 800, borderRadius: 14, fontFamily: "sans-serif" }}>
        Ko
      </div>
    ),
    { ...size }
  );
}
