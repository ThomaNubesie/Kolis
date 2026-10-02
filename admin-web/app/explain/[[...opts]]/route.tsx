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
  { name: "orange", bg: "#F2760F", hi: "#FFFFFF", acc: "#15171C", mute: "rgba(255,255,255,0.97)" },
  { name: "azure", bg: "#2F6FE0", hi: "#FFFFFF", acc: "#FF8A1A", mute: "rgba(255,255,255,0.96)" },
  { name: "charcoal", bg: "#2A3040", hi: "#FFFFFF", acc: "#FF8A1A", mute: "rgba(255,255,255,0.95)" },
  { name: "cream", bg: "#F7EFE2", hi: "#15171C", acc: "#C2410C", mute: "rgba(21,23,28,0.9)" },
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
  // "30 $ la place" flat was wrong: the fare is per route (Québec–Montréal is 35 $,
  // Ottawa–Québec 65 $). The number stays, tied to the route it belongs to.
  { eyebrow: "UN PRIX PAR TRAJET · A PRICE PER ROUTE",
    big: "30 $", fr: "Ottawa–Montréal. Chaque trajet a son prix, affiché d’avance.",
    en: "$30 Ottawa–Montréal. Every route has its own price, shown before you book." },
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

// A sequence, not a rotation. The deck above explains LoadQ one card a day; this one is meant to
// be posted in order as a single slideshow about the board — what it is, how to read it, and why
// turning up beats holding a reservation. /explain/board/0/tall … /explain/board/7/tall.
//
// Card 6 says what is REQUIRED of a driver, not what has been verified of every driver. Those are
// different claims and only the first is currently true: the document system opened in September
// 2026 with a grace period, and the file is not complete. Do not "tighten" this line into "every
// driver is verified" until it is — the same sentence appears, qualified, in the insurance
// application's Appendix A, and the two must not contradict each other.
const BOARD = [
  { eyebrow: "LE TABLEAU · THE BOARD",
    fr: "Le tableau, c’est la file des voitures. En direct.",
    en: "The board is the queue of cars. Live, right now." },
  { eyebrow: "CE QU’IL MONTRE · WHAT IT SHOWS",
    fr: "Les voitures en file, et les places libres dans chacune.",
    en: "The cars in line, and the free seats in each one." },
  { eyebrow: "COMMENT S’EN SERVIR · HOW TO USE IT",
    fr: "Ouvrez l’appli, regardez le tableau, présentez-vous.",
    en: "Open the app, look at the board, turn up." },
  { eyebrow: "SANS PRESSION · NO PRESSURE",
    fr: "Aucune réservation à tenir. Vous venez quand ça vous convient.",
    en: "No booking to keep. You come when it suits you." },
  { eyebrow: "PAS D’HORAIRE · NO TIMETABLE",
    fr: "La voiture part quand elle est pleine. Rien à manquer.",
    en: "The car leaves when it fills. Nothing to miss." },
  { eyebrow: "VOUS VOYEZ AVANT · YOU SEE FIRST",
    fr: "La voiture, le chauffeur, les places : tout est là avant de partir.",
    en: "The car, the driver, the seats — all there before you leave." },
  { eyebrow: "CE QU’ON EXIGE · WHAT WE REQUIRE",
    big: "7", fr: "Sept documents exigés de chaque chauffeur LoadQ.",
    en: "Seven documents required of every LoadQ driver — licence, insurance, registration and more." },
  { eyebrow: "ESSAYEZ · TRY IT",
    fr: "Le tableau est ouvert. Regardez avant de partir.",
    en: "The board is open. Look before you go — loadq.ca/tk" },
];

// The same board, but as a walkthrough: the six taps between opening the app and reading the
// queue. Steps are taken from the app itself — app/(app)/zone-select.tsx and app/(app)/queue.tsx
// in the LoadQ repo — not from memory, so the button names match what is actually on screen.
//
// Note that "Watch" and "Join" are the real labels and are in ENGLISH in the app, on a screen that
// is otherwise not localised. The slides quote them as they appear rather than translating them,
// because a viewer following along is looking for that exact word. If zone-select is ever
// localised, these two slides have to change with it.
const WALK = [
  { eyebrow: "VOIR AVANT DE PARTIR · SEE BEFORE YOU GO",
    fr: "Le tableau en direct, en six gestes.",
    en: "The live board, in six taps." },
  { eyebrow: "ÉTAPE 1 · STEP 1", big: "1",
    fr: "Ouvrez LoadQ. Votre région est détectée toute seule.",
    en: "Open LoadQ. Your region is detected for you." },
  { eyebrow: "ÉTAPE 2 · STEP 2", big: "2",
    fr: "Choisissez la région : Ottawa, Gatineau, Montréal, Québec, Laval, Toronto.",
    en: "Pick the region — Ottawa, Gatineau, Montréal, Québec, Laval, Toronto." },
  { eyebrow: "ÉTAPE 3 · STEP 3", big: "3",
    fr: "Choisissez le point de chargement. Nom, adresse et distance s’affichent.",
    en: "Pick the loading point. Name, address and distance are shown." },
  { eyebrow: "ÉTAPE 4 · STEP 4", big: "4",
    fr: "Touchez « Watch ». Pas besoin d’être sur place pour regarder.",
    en: "Tap “Watch”. You don’t have to be there to look." },
  { eyebrow: "ÉTAPE 5 · STEP 5", big: "5",
    fr: "Le tableau s’ouvre, groupé par destination.",
    en: "The board opens, grouped by destination." },
  { eyebrow: "ÉTAPE 6 · STEP 6", big: "6",
    fr: "Trouvez votre destination : les voitures en file et les places libres.",
    en: "Find your destination — the cars in line and the seats still free." },
  { eyebrow: "C’EST TOUT · THAT’S IT",
    fr: "Vous savez avant même de sortir de chez vous.",
    en: "You know before you even leave the house — loadq.ca/tk" },
];

const DECKS: Record<string, typeof CARDS> = { board: BOARD, walk: WALK };

// The teleprompter's own colours — the ground these lines are read from.
const TELEPROMPTER = { name: "teleprompter", bg: "#14171D", hi: "#FFFFFF", acc: "#FF8A1A",
                       mute: "rgba(255,255,255,0.95)" };

const SHAPES = {
  wide: { w: 1600, h: 900, left: 72, width: 1300, mark: 84, eyebrow: 24, fr: 74, en: 42, big: 150, footTop: 760 },
  tall: { w: 1080, h: 1920, left: 72, width: 912, mark: 92, eyebrow: 27, fr: 80, en: 48, big: 190, footTop: 1500 },
};


export async function GET(req: NextRequest, { params }: { params: { opts?: string[] } }) {
  const opts = (params.opts ?? []).map(o => decodeURIComponent(o).toLowerCase());
  const bad = opts.filter(o => o !== "tall" && !/^p[0-3]$/.test(o) && !/^\d+$/.test(o) && !(o in DECKS));
  if (bad.length) return new Response(`unknown option: ${bad[0]}`, { status: 404 });

  const L = SHAPES[opts.includes("tall") ? "tall" : "wide"];
  // The explainer does NOT wear the colour of the day. It is the teleprompter: black ground,
  // white line, orange tag. The flyer and the boards carry the day's colour; this card carries
  // the explanation, and keeping it constant is what makes it recognisable across a week as the
  // bit that tells you how the thing works. /explain/p0..p3 still forces a palette for previews.
  const forced = opts.find(o => /^p[0-3]$/.test(o));
  const p = forced ? DAYS[parseInt(forced.slice(1), 10)] : TELEPROMPTER;
  const picked = opts.find(o => /^\d+$/.test(o));
  // A named deck is a sequence meant to be posted in order; without one the daily rotation below
  // applies to the general deck.
  const deck = DECKS[opts.find(o => o in DECKS) ?? ""] ?? CARDS;
  // No card asked for: the day chooses, so a fortnight of noon posts explains ten different
  // things and only then comes round again.
  const i = picked ? Math.min(deck.length - 1, parseInt(picked, 10))
                   : ((torontoDayIndex() % deck.length) + deck.length) % deck.length;
  const c = deck[i];

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
          <div style={{ width: L.width, fontSize: L.fr, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1.5 }}>{c.fr}</div>
          {/* The English used to sit at 0.78 opacity and a size below the French, which on a
              phone read as a caption nobody finishes. Same family, close in size, nearly full
              strength: a second language, not a footnote. */}
          <div style={{ width: L.width, marginTop: 24, fontSize: L.en, fontWeight: 600,
                        lineHeight: 1.26, color: p.mute }}>{c.en}</div>
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
