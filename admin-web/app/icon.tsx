import { ImageResponse } from "next/og";
import { headers } from "next/headers";

// Favicon (browser tab). Host-aware: the Quorly domain gets the QUORUM RING —
// eight seats around a table, four of them in the brand colours — on a transparent
// background; every other host keeps the Kolis · Business magenta "Ko" tile.
// Reading headers() opts this route into per-request render.
//
// WHY A RING AND NOT THE OLD "Q + four dots". A tab icon is 16 pixels. Four separate
// dots with gaps between them collapse into grey mush at that size, so the palette
// that identified the brand was exactly the part that disappeared. The ring carries
// the same four colours as large shapes instead, and it keeps working on a dark tab
// strip — no single colour has to do the work alone, which is what killed a lone
// indigo glyph on near-black chrome.
//
// It is also the only mark here that means something: a quorum is people around a
// table, and that is what the product is for.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const INDIGO = "#2F3AA3";
const BRAND = ["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"];

// Eight seats, evenly spaced, starting at the top. Positions are computed rather
// than hand-placed so the ring stays true if the size or count ever changes.
function seats(box: number, radius: number, dot: number) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return {
      i,
      left: box / 2 + Math.cos(a) * radius - dot / 2,
      top: box / 2 + Math.sin(a) * radius - dot / 2,
    };
  });
}

export default function Icon() {
  const quorly = /quorly/i.test(headers().get("host") || "");

  if (quorly) {
    const BOX = 64, R = 20, DOT = 14;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
          {/* the table the seats sit around — faint, so it reads as a hint at 16px */}
          <div style={{
            position: "absolute", left: BOX / 2 - R, top: BOX / 2 - R,
            width: R * 2, height: R * 2, borderRadius: R * 2,
            border: `3px solid ${INDIGO}`, opacity: 0.26,
          }} />
          {seats(BOX, R, DOT).map((s) => (
            <div key={s.i} style={{
              position: "absolute", left: s.left, top: s.top,
              width: DOT, height: DOT, borderRadius: DOT,
              // Alternating brand colour and indigo: four of the eight carry the
              // palette, the rest hold the ring together.
              background: s.i % 2 ? INDIGO : BRAND[(s.i / 2) | 0],
            }} />
          ))}
        </div>
      ),
      { ...size }
    );
  }

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
