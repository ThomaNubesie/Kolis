import { ImageResponse } from "next/og";

// A branded Quorly banner (PNG) used as the MMS image on announcement texts.
// Stable public URL: https://quorly.ca/mms-logo — Twilio fetches it as MediaUrl.
// Solid indigo background (MMS clients render transparency as black).
const DOTS = ["#E8613A", "#F2B01E", "#2FA36B", "#2F3AA3"];

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#2F3AA3", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 150, fontWeight: 900, color: "#FFFFFF", letterSpacing: -6, lineHeight: 1 }}>Quorly</div>
        <div style={{ display: "flex", gap: 18, marginTop: 28 }}>
          {DOTS.map((c) => (<div key={c} style={{ width: 30, height: 30, borderRadius: 30, background: c }} />))}
        </div>
        <div style={{ fontSize: 38, color: "#C9CEF0", marginTop: 30, fontWeight: 600 }}>Boards &amp; associations</div>
      </div>
    ),
    { width: 1200, height: 628 }
  );
}
