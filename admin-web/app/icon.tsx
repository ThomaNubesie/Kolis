import { ImageResponse } from "next/og";

// Business favicon: magenta tile, "Ko" wordmark over a "BUSINESS" label.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
