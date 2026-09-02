import { ImageResponse } from "next/og";

// Home-screen icon — this is what appears when the tablet does "Add to Home
// Screen", so it is the thing the writer taps every morning.
//
// LoadQ colours, but deliberately DISTINCT from the LoadQ app's own icon: the
// same tablet may well have both, and two identical icons side by side would be
// a daily source of taps into the wrong place. Hence the "FEUILLE" label.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", background: "#0B0C0F", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, color: "#F97316", letterSpacing: -3 }}>LQ</div>
        <div style={{ width: 62, height: 5, background: "#F97316", borderRadius: 3, margin: "14px 0 12px" }} />
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 3, color: "#8A909C" }}>FEUILLE</div>
      </div>
    ),
    { ...size }
  );
}
