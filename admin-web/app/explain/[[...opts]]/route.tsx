import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { paletteIndexFor, torontoDayIndex } from "../../../lib/loadqDay";

// GET /explain         → the explainer card of the day, 1600×900, in the colour of the day
//     /explain/2       → that card in particular (0-based)
//     /explain/tall    → 1080×1920 for TikTok; /explain/2/tall for a particular one
//     /explain/p3      → force a palette, previews only
//
// NOT /card: that route is the driver's PTC identification card, which the by-law requires.
//
// The flyer says where you can go; this says what LoadQ actually is. A noon post that shows only
// a landmark assumes the reader already knows what the queue is — most do not. One card rides
// with every noon post, and which one advances by day so the page is not repeating itself.
//
// Same Satori rules as app/flyer: children of a flex container must be a real array with keys,
// text goes in a plain block with a width, and no glyph means tofu — "⇄" is drawn as a path.
export const runtime = "nodejs";

const DAYS = [
  { name: "orange", bg: "#F2760F", hi: "#FFFFFF", acc: "#15171C", mute: "rgba(255,255,255,0.88)" },
  { name: "azure", bg: "#2F6FE0", hi: "#FFFFFF", acc: "#FF8A1A", mute: "rgba(255,255,255,0.84)" },
  { name: "charcoal", bg: "#2A3040", hi: "#FFFFFF", acc: "#FF8A1A", mute: "rgba(255,255,255,0.78)" },
  { name: "cream", bg: "#F7EFE2", hi: "#15171C", acc: "#C2410C", mute: "rgba(21,23,28,0.74)" },
];

// French large, English under it — the audience is both, and the French line is the one that
// carries the idea. Kept short enough to read while scrolling past.
const CARDS = [
  { eyebrow: "EN DIRECT · LIVE",
    fr: "LoadQ, c’est la file d’attente des voitures.",
    en: "LoadQ is the car queue — live, in the app." },
  { eyebrow: "COMMENT ÇA MARCHE · HOW IT WORKS",
    fr: "Les chauffeurs font la file. Vous voyez les places qui restent.",
    en: "Drivers line up at the pickup point. You see the seats still open." },
  { eyebrow: "PAS D’HORAIRE · NO TIMETABLE",
    fr: "La voiture part dès qu’elle est pleine.",
    en: "The car leaves as soon as it fills — no schedule to miss." },
  { eyebrow: "LE MÊME PRIX POUR TOUS · ONE PRICE",
    big: "30 $", fr: "la place.",
    en: "$30 a seat. The same price for everyone, every day." },
  { eyebrow: "RÉSERVEZ · RESERVE",
    fr: "Réservez votre place, ou présentez-vous.",
    en: "Reserve your seat in the app, or simply turn up at the point." },
  { eyebrow: "ON VIENT VOUS CHERCHER · WE COME TO YOU",
    fr: "Pas moyen de vous rendre au départ ? On passe vous prendre.",
    en: "Can’t reach the pickup point? We’ll collect you — from $12.99." },
  { eyebrow: "PORTE-À-PORTE · DOOR TO DOOR",
    fr: "Porte-à-porte vers 64 villes, sur réservation.",
    en: "Door to door to 64 towns, booked ahead." },
  { eyebrow: "VOUS SAVEZ QUI CONDUIT · YOU KNOW THE CAR",
    fr: "La voiture, le chauffeur, les places : tout est sur le tableau.",
    en: "The car, the driver, the seats — all on the board before you go." },
  { eyebrow: "COLIS AUSSI · PARCELS TOO",
    fr: "Votre colis prend la même voiture.",
    en: "Your parcel rides the same run — kolis.ca" },
  { eyebrow: "LES DEUX SENS · BOTH WAYS",
    fr: "Tous les jours, dans les deux sens.",
    en: "Every day, in both directions — Ottawa, Montréal, Québec." },
];

const SHAPES = {
  wide: { w: 1600, h: 900, left: 72, width: 1300, mark: 84, eyebrow: 24, fr: 76, en: 34, big: 150, footTop: 760 },
  tall: { w: 1080, h: 1920, left: 72, width: 912, mark: 92, eyebrow: 27, fr: 84, en: 40, big: 190, footTop: 1500 },
};


// The Canadian flag, drawn rather than typed: Satori has no emoji font, so 🇨🇦 renders as tofu.
// Divs, not one SVG: Satori is dependable with boxes and shaky with nested transforms.
function flag(h: number) {
  const w = Math.round(h * 2);
  const bar = Math.round(w * 0.25);
  return (
    <div style={{ display: "flex", width: w, height: h, borderRadius: 3, overflow: "hidden",
                  border: "1px solid rgba(0,0,0,0.15)" }}>
      <div style={{ display: "flex", width: bar, height: h, background: "#D52B1E" }} />
      <div style={{ display: "flex", width: w - bar * 2, height: h, background: "#FFFFFF",
                    alignItems: "center", justifyContent: "center" }}>
        <svg width={Math.round(h * 0.78)} height={Math.round(h * 0.78)} viewBox="0 0 512 512">
          <path fill="#D52B1E" d="M256 48l-30 56c-3 6-9 5-15 2l-22-11 16 87c3 16-8 16-14 9l-38-43-6 22c-1 3-4 6-9 5l-48-10 13 46c3 10 5 14-3 17l-17 8 83 67c8 6 11 9 8 19l-7 24 79-9c5 0 8 2 8 7l-4 84h22l-4-84c0-5 3-7 8-7l79 9-7-24c-3-10 0-13 8-19l83-67-17-8c-8-3-6-7-3-17l13-46-48 10c-5 1-8-2-9-5l-6-22-38 43c-6 7-17 7-14-9l16-87-22 11c-6 3-12 4-15-2z" />
        </svg>
      </div>
      <div style={{ display: "flex", width: bar, height: h, background: "#D52B1E" }} />
    </div>
  );
}

export async function GET(req: NextRequest, { params }: { params: { opts?: string[] } }) {
  const opts = (params.opts ?? []).map(o => decodeURIComponent(o).toLowerCase());
  const bad = opts.filter(o => o !== "tall" && !/^p[0-3]$/.test(o) && !/^\d+$/.test(o));
  if (bad.length) return new Response(`unknown option: ${bad[0]}`, { status: 404 });

  const L = SHAPES[opts.includes("tall") ? "tall" : "wide"];
  const forced = opts.find(o => /^p[0-3]$/.test(o));
  const p = DAYS[forced ? parseInt(forced.slice(1), 10) : paletteIndexFor(new Date())];
  const picked = opts.find(o => /^\d+$/.test(o));
  // No card asked for: the day chooses, so a fortnight of noon posts explains ten different
  // things and only then comes round again.
  const i = picked ? Math.min(CARDS.length - 1, parseInt(picked, 10))
                   : ((torontoDayIndex() % CARDS.length) + CARDS.length) % CARDS.length;
  const c = CARDS[i];

  const origin = new URL(req.url).origin;
  const font = async (f: string) => fetch(`${origin}/fonts/${f}`).then(r => r.arrayBuffer());
  const [black, semi, medium] = await Promise.all([
    font("Archivo-Black.woff"), font("Archivo-SemiBold.woff"), font("Archivo-Medium.woff"),
  ]);

  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
                    justifyContent: "space-between", background: p.bg, color: p.hi,
                    fontFamily: "Archivo", padding: `${Math.round(L.h * 0.09)}px ${L.left}px` }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: L.mark, fontWeight: 900, letterSpacing: L.mark * -0.035, lineHeight: 1 }}>
            <span>Load</span><span style={{ color: p.acc }}>Q</span>
          </div>
          <div style={{ width: L.width, marginTop: 14, fontSize: L.eyebrow, fontWeight: 600,
                        letterSpacing: 5, color: p.acc }}>{c.eyebrow}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: L.width }}>
          {c.big
            ? <div style={{ width: L.width, fontSize: L.big, fontWeight: 900, lineHeight: 0.95, letterSpacing: -8 }}>{c.big}</div>
            : null}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {flag(Math.round(L.fr * 0.34))}
            <div style={{ width: L.width - Math.round(L.fr * 0.34) * 2 - 26, marginLeft: 26,
                          fontSize: L.fr, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1.5 }}>{c.fr}</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", marginTop: 30 }}>
            {flag(Math.round(L.en * 0.44))}
            <div style={{ width: L.width - Math.round(L.en * 0.44) * 2 - 26, marginLeft: 26,
                          fontSize: L.en, fontWeight: 500, lineHeight: 1.28, color: p.mute }}>{c.en}</div>
          </div>
        </div>

        <div style={{ display: "flex", width: L.width, fontSize: Math.round(L.en * 0.95), fontWeight: 600 }}>
          <span>Le tableau en direct — </span>
          <span style={{ color: p.acc, fontWeight: 900 }}>{opts.includes("tall") ? "loadq.ca/tk" : "loadq.ca/fb"}</span>
        </div>
      </div>
    ),
    {
      width: L.w, height: L.h,
      fonts: [
        { name: "Archivo", data: black, weight: 900, style: "normal" },
        { name: "Archivo", data: semi, weight: 600, style: "normal" },
        { name: "Archivo", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
  const out = new Response(img.body, img);
  out.headers.set("Cache-Control", "public, max-age=1800");
  return out;
}
