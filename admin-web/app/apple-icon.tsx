import { ImageResponse } from "next/og";
import { headers } from "next/headers";

// Home-screen icon. Host-aware like the favicon. iOS renders apple-touch icons
// on an opaque background, so the Quorly variant uses an indigo tile (not
// transparent) with a white "Q" + four brand dots; other hosts keep Kolis.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const DOTS = ["#E8613A", "#F2B01E", "#2FA36B", "#FFFFFF"];

export default function AppleIcon() {
  const quorly = /quorly/i.test(headers().get("host") || "");
  if (quorly) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#2F3AA3", color: "#fff", fontFamily: "sans-serif" }}>
          <div style={{ fontSize: 108, fontWeight: 900, lineHeight: 1, letterSpacing: -4 }}>Q</div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {DOTS.map((c) => (<div key={c} style={{ width: 16, height: 16, borderRadius: 16, background: c }} />))}
          </div>
        </div>
      ),
      { ...size }
    );
  }
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
