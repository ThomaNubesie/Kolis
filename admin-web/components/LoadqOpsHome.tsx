import Link from "next/link";

// The root of admin.loadq.ca.
//
// This host shares one codebase with business.kolis.ca and quorly.ca, and `/` branched only
// on the Quorly host — so arriving at admin.loadq.ca showed the KOLIS BUSINESS landing page.
// LoadQ and Kolis are separate businesses; the LoadQ ops site should not open on a Kolis
// marketing page. The working routes (/sheet, /board) were always fine — only the front door
// was wrong.
const LINKS = [
  { href: "/sheet",    title: "Loading sheet",  sub: "The tablet at the loading point — build the line, depart cars, record incidents." },
  { href: "/settings", title: "Operating switches", sub: "The engagement, the $100 contribution, grace periods, dispatch floor." },
  { href: "/board/ottawa-universal-grocery", title: "Live board", sub: "The public board image used by the Facebook posts." },
];

export default function LoadqOpsHome() {
  return (
    <main style={S.wrap}>
      <div style={S.brand}>Load<span style={{ color: "#FF8A1A" }}>Q</span></div>
      <div style={S.sub}>Operations · Concord Express Co Inc.</div>
      <div style={S.grid}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} style={S.card}>
            <div style={S.ct}>{l.title}</div>
            <div style={S.cs}>{l.sub}</div>
          </Link>
        ))}
      </div>
      <div style={S.foot}>Sign in with your LoadQ driver account. Admin rights are required for the switches.</div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap:  { maxWidth: 620, margin: "0 auto", padding: "42px 18px 60px",
           fontFamily: "-apple-system,'Segoe UI',Roboto,Arial,sans-serif", color: "#15171C" },
  brand: { fontSize: 34, fontWeight: 900, letterSpacing: -1 },
  sub:   { fontSize: 13.5, color: "#6B7280", marginTop: 2, marginBottom: 26 },
  grid:  { display: "flex", flexDirection: "column", gap: 11 },
  card:  { display: "block", border: "1px solid #E6E9E7", borderRadius: 14, padding: "15px 16px",
           textDecoration: "none", color: "inherit", background: "#fff" },
  ct:    { fontSize: 16, fontWeight: 800 },
  cs:    { fontSize: 13, color: "#5A6273", lineHeight: 1.5, marginTop: 3 },
  foot:  { fontSize: 12, color: "#98A0AE", marginTop: 26, lineHeight: 1.55 },
};
