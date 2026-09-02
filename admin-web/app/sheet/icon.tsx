import { ImageResponse } from "next/og";

// Browser-tab favicon for the daily sheet. LoadQ identity — orange #F97316 on
// near-black #0B0C0F (see the loadq-design-tokens note) — NOT the Kolis magenta
// tile the rest of admin-web uses. Route-scoped, so it overrides app/icon.tsx
// for /sheet only.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", background: "#0B0C0F", borderRadius: 14,
        fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: "#F97316", letterSpacing: -1 }}>LQ</div>
        <div style={{ width: 24, height: 3, background: "#F97316", borderRadius: 2, marginTop: 5 }} />
      </div>
    ),
    { ...size }
  );
}
