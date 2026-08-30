import { ImageResponse } from "next/og";

// Branded Quorly banner (PNG) used as the MMS image on announcement texts.
// Stable public URL: https://quorly.ca/mms-logo — Twilio fetches it as MediaUrl.
// Matches the website palette: light cream→white ground, indigo "Q" + ink "uorly",
// the four brand dots, tagline "Boards, Associations & Groups".
const INK = "#1C1B19", INDIGO = "#2F3AA3", MUTED = "#5A6472";
const DOTS = ["#E8613A", "#F2B01E", "#2FA36B", "#2F3AA3"];

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#FBF8F2,#FFFFFF)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 150, fontWeight: 900, letterSpacing: -6, lineHeight: 1 }}>
          <span style={{ color: INDIGO }}>Q</span>
          <span style={{ color: INK }}>uorly</span>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
          {DOTS.map((c) => (<div key={c} style={{ width: 30, height: 30, borderRadius: 30, background: c }} />))}
        </div>
        <div style={{ fontSize: 40, color: MUTED, marginTop: 30, fontWeight: 700, letterSpacing: -0.5 }}>Boards, Associations &amp; Groups</div>
      </div>
    ),
    { width: 1200, height: 628 }
  );
}
