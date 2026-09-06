import { ImageResponse } from "next/og";
import { headers } from "next/headers";

// Home-screen icon. Host-aware like the favicon, and the same QUORUM RING — eight
// seats around a table — so the tab and the home screen are one mark.
//
// iOS composites apple-touch icons onto an opaque background and clips them to its
// own shape, so this one CANNOT be transparent the way the favicon is. It sits on an
// indigo tile instead, and the seats are drawn in white and the brand colours that
// hold up against indigo — the purple of the palette does not, so white takes its
// place rather than leaving a seat that vanishes.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const ON_INDIGO = ["#E0574A", "#2F8F6B", "#E0A83B", "#FFFFFF"];

// Eight seats, evenly spaced, computed rather than hand-placed.
function seats(box: number, radius: number, dot: number) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { i, left: box / 2 + Math.cos(a) * radius - dot / 2, top: box / 2 + Math.sin(a) * radius - dot / 2 };
  });
}

export default function AppleIcon() {
  const quorly = /quorly/i.test(headers().get("host") || "");
  if (quorly) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#2F3AA3" }}>
          <div style={{
            position: "absolute", left: 90 - 56, top: 90 - 56, width: 112, height: 112,
            borderRadius: 112, border: "7px solid #FFFFFF", opacity: 0.3,
          }} />
          {seats(180, 56, 38).map((s) => (
            <div key={s.i} style={{
              position: "absolute", left: s.left, top: s.top, width: 38, height: 38, borderRadius: 38,
              background: s.i % 2 ? "rgba(255,255,255,0.55)" : ON_INDIGO[(s.i / 2) | 0],
            }} />
          ))}
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
