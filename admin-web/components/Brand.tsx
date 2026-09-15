// LoadQ and Concord Express marks for the sheet.
//
// The wordmark follows the SAME rule as the app's components/Wordmark.tsx, which is the one
// definition of the mark:
//   · the Q is ALWAYS #FF8A1A and never the theme accent;
//   · "Load" takes only the colour the background allows — ink on a light one, white on a
//     dark one;
//   · no plate, no box.
// Before this the sheet wrote "LOAD Q" in caps in the band colour, which is a different mark
// from the one on the letterhead and on every screen of the app.

export const BRAND_ORANGE = "#FF8A1A";
export const BRAND_INK = "#15171C";
// LoadQ's action colour, from the app's constants/colors.ts and the board PNG. Defined once
// here so the sheet, the seat panel and the board cannot drift into three different blues.
export const BRAND_AZURE = "#4C82F0";

// Perceived lightness decides the "Load" colour, so a new theme is handled without editing
// this file — same calculation as the app's brandInk().
export function inkOn(bg: string): string {
  const hex = (bg || "#FFFFFF").replace("#", "");
  if (hex.length < 6) return BRAND_INK;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? BRAND_INK : "#FFFFFF";
}

export function Wordmark({ on, size = 20 }: { on: string; size?: number }) {
  return (
    <span style={{ fontWeight: 900, fontSize: size, letterSpacing: -0.5, color: inkOn(on), lineHeight: 1 }}>
      Load<span style={{ color: BRAND_ORANGE }}>Q</span>
    </span>
  );
}

// The CE monogram as it appears on concordexpress.ca (/network/ce.svg) — inlined rather than
// hotlinked, because the tablet lives on a parking-lot connection and should not be fetching
// a logo from another domain to render its own footer.
export function ConcordMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Concord Express" style={{ flex: "none" }}>
      <rect width="40" height="40" rx="9" fill="#2ECC8F" />
      <text x="20" y="27.5" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif"
            fontSize="16" fontWeight="800" letterSpacing="-0.5" fill="#0A1F1A">CE</text>
    </svg>
  );
}

type FootPal = { ink2: string; faint: string; line: string };

// Bottom of the sheet: who operates it, and everything she runs, reachable in one tap.
//
// The ConcordXpress app itself is deliberately absent — it is on TestFlight and Play internal
// testing, so a public link would send a driver to a page they cannot install from.
export function ConcordFooter({ C }: { C: FootPal }) {
  const a: React.CSSProperties = { color: C.ink2, textDecoration: "none", borderBottom: `1px solid ${C.line}` };
  const dot = <span style={{ color: C.faint, margin: "0 7px" }}>·</span>;

  return (
    <footer style={{ marginTop: 26, paddingTop: 16, paddingBottom: 26, borderTop: `1px solid ${C.line}`,
      textAlign: "center", fontSize: 12.5, lineHeight: 1.9, color: C.ink2 }}>
      <a href="https://concordexpress.ca" target="_blank" rel="noopener noreferrer"
         style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
                  color: C.ink2, fontWeight: 700, fontSize: 13.5 }}>
        <ConcordMark /> Concord Express Co Inc.
      </a>

      <div style={{ marginTop: 8 }}>
        <a href="https://concordexpress.ca" target="_blank" rel="noopener noreferrer" style={a}>concordexpress.ca</a>
        {dot}
        <a href="https://loadq.ca" target="_blank" rel="noopener noreferrer" style={a}>loadq.ca</a>
        {dot}
        <a href="https://kolis.ca" target="_blank" rel="noopener noreferrer" style={a}>kolis.ca</a>
      </div>

      <div style={{ marginTop: 4, color: C.faint, fontSize: 12 }}>
        <b style={{ color: C.ink2, fontWeight: 700 }}>LoadQ</b>{" "}
        <a href="https://apps.apple.com/ca/app/loadq/id6770652996" target="_blank" rel="noopener noreferrer" style={a}>App&nbsp;Store</a>
        {dot}
        <a href="https://play.google.com/store/apps/details?id=ca.loadq.app" target="_blank" rel="noopener noreferrer" style={a}>Google&nbsp;Play</a>
      </div>
      <div style={{ color: C.faint, fontSize: 12 }}>
        <b style={{ color: C.ink2, fontWeight: 700 }}>Kolis</b>{" "}
        <a href="https://apps.apple.com/ca/app/kolis/id6778120565" target="_blank" rel="noopener noreferrer" style={a}>App&nbsp;Store</a>
        {dot}
        <a href="https://play.google.com/store/apps/details?id=ca.kolis.app" target="_blank" rel="noopener noreferrer" style={a}>Google&nbsp;Play</a>
      </div>
    </footer>
  );
}
