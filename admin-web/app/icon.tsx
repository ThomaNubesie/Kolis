import { ImageResponse } from "next/og";

// Business favicon: magenta tile with the "Ko" wordmark.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#E11D6B", color: "#fff", fontSize: 34, fontWeight: 800, borderRadius: 14, fontFamily: "sans-serif" }}>
        Ko
      </div>
    ),
    { ...size }
  );
}
