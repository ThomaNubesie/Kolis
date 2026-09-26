import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { paletteIndexFor, torontoDayIndex } from "../../../../lib/loadqDay";

// GET /flyer/<key>  → the destination flyer, drawn now, in today's colour.
//
//   key    = a loadq_flyer_assets key ("Alexandra Bridge", "Île d'Orléans", …)
//          | "today"  → the destination of the day, so a caller needs no knowledge of the pick
//   /tall    1080×1920 for TikTok; without it, 1600×900 for Facebook
//   /p0../p3 forces a palette — previews only; the posts ask for neither.
//
// Shape and palette are PATH segments, not query parameters, because Netlify's CDN caches this
// route by path alone: asking for ?size=tall and then the plain URL served the tall image for
// both, and a ?p=3 preview would have parked the cream flyer on the public URL for half an hour.
// One URL per variant, and each caches correctly.
//
// One artwork, two shapes: the Facebook flyer and the TikTok frame are the same words, the same
// photo and the same colour of the day, so a day's posts read as one set wherever they land.
//
// Why a render and not a stored image: the flyer series was 20 JPEGs composed in orange and
// uploaded once, so the artwork could not follow the daily colour, and changing one line meant
// re-exporting twenty files. Drawn here, the colour comes from the date and the words come from
// the database — the same way /board already works.
//
// SATORI RULES, the same ones app/tiktok/[kind]/[id]/route.tsx was bitten by:
//   1. children of a flex container must be a real ARRAY with keys, never a <>fragment</>;
//   2. a div with display:flex makes its text a flex ITEM, which does not wrap — text goes in a
//      plain block with an explicit width;
//   3. no glyph, no character: "⇄" is not in Archivo and renders as tofu, so the double arrow is
//      drawn as a path. Same reason the leaf is a path and not 🍁.
//
// Fonts are WOFF (TrueType flavour) served from public/fonts: Satori reads ttf/otf/woff but NOT
// woff2, and the Google Fonts API hands you EOT or woff2 unless the request looks like an old
// browser. A wrong format fails at render time with "Unsupported OpenType signature".
// Node, not edge: the render decodes a ~200 KB JPEG and six fonts.
export const runtime = "nodejs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Everything that differs between the wide and tall shapes lives here; the tree below is drawn
// once from these numbers. TikTok keeps the bottom ~340px and the right ~190px for its own
// caption and buttons, so nothing that must be read goes there.
const SHAPES = {
  wide: {
    w: 1600, h: 900, left: 60, panel: 800, strip: 700, headMax: 58,
    photo: { w: 1030, h: 900, top: 0, right: 0, dir: "" },
    pill: 44, leaf: 18, mark: 74, headTop: 214, headBox: 62, subTop: 288, sub: 20, subLS: 4.5,
    blockTop: 344, l1: 31, l2: 24, l3: 22, stripTop: 506, stripF: 21, ruleTop: 556,
    capTop: 574, capH: 21, capFr: 23, capEn: 19, btnTop: 790, www: 26,
    creditRight: 18, creditBottom: 12, creditLeft: null as number | null, creditTop: null as number | null,
    link: "loadq.ca/fb",
  },
  tall: {
    w: 1080, h: 1920, left: 64, panel: 952, strip: 826, headMax: 77,
    photo: { w: 1080, h: 1100, top: 330, right: 0, dir: "tall/" },
    pill: 72, leaf: 22, mark: 112, headTop: 300, headBox: 84, subTop: 398, sub: 25, subLS: 5.5,
    blockTop: 1004, l1: 40, l2: 30, l3: 28, stripTop: 1188, stripF: 27, ruleTop: 1258,
    capTop: 1278, capH: 26, capFr: 29, capEn: 24, btnTop: 1486, www: 33,
    creditRight: null as number | null, creditBottom: null as number | null, creditLeft: 64, creditTop: 1558,
    link: "loadq.ca/tk",
  },
};

// One palette per day, the same four and the same order as the TikTok pack
// (app/tiktok/[kind]/[id]/route.tsx) and the board (app/board/[zone]/route.tsx). Everything
// posted on a given day carries one colour; which day wears which is lib/loadqDay.ts.
const DAYS = [
  { name: "orange", bg: "#F2760F", bgRGB: "242,118,15", hi: "#FFFFFF", acc: "#15171C",
    mute: "rgba(255,255,255,0.88)", rule: "rgba(21,23,28,0.45)", van: "#15171C",
    pillBg: "#15171C", wwwBg: "#15171C", wwwFg: "#FFFFFF" },
  { name: "azure", bg: "#2F6FE0", bgRGB: "47,111,224", hi: "#FFFFFF", acc: "#FF8A1A",
    mute: "rgba(255,255,255,0.84)", rule: "rgba(255,255,255,0.45)", van: "#FF8A1A",
    pillBg: "#E5252A", wwwBg: "#FFFFFF", wwwFg: "#1F4FB0" },
  { name: "charcoal", bg: "#2A3040", bgRGB: "42,48,64", hi: "#FFFFFF", acc: "#FF8A1A",
    mute: "rgba(255,255,255,0.76)", rule: "rgba(255,255,255,0.35)", van: "#FF8A1A",
    pillBg: "#E5252A", wwwBg: "#2F6FE0", wwwFg: "#FFFFFF" },
  { name: "cream", bg: "#F7EFE2", bgRGB: "247,239,226", hi: "#15171C", acc: "#C2410C",
    mute: "rgba(21,23,28,0.74)", rule: "rgba(21,23,28,0.3)", van: "#FF8A1A",
    pillBg: "#E5252A", wwwBg: "#2F6FE0", wwwFg: "#FFFFFF" },
];
type Day = (typeof DAYS)[0];

function palette(d: Date, force: string | null): Day {
  const i = force ? parseInt(force, 10) : paletteIndexFor(d);
  return DAYS[((i % DAYS.length) + DAYS.length) % DAYS.length];
}

// Must match slug() in scripts/build_flyer_photos.py, which writes public/flyer/<slug>.jpg.
function flyerSlug(key: string) {
  return key.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Asset = {
  key: string; city_a: string; city_b: string; cap_head: string; cap_fr: string; cap_en: string;
  board: boolean; photo_by: string; photo_lic: string; last_posted_on: string | null;
};

async function assets(): Promise<Asset[]> {
  const r = await fetch(
    `${SB}/rest/v1/loadq_flyer_assets?active=eq.true&order=key` +
    `&select=key,city_a,city_b,cap_head,cap_fr,cap_en,board,photo_by,photo_lic,last_posted_on`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, cache: "no-store" },
  );
  return r.ok ? r.json() : [];
}

// "today" resolves to the destination the noon Facebook flyer claimed for today. The morning
// board post runs BEFORE that claim, so before 12:30 there is nothing stamped — it then falls
// back to the date-driven slot, which is also what the TikTok pack shows, so the morning lead
// and the noon post still agree unless the SQL picker overrides it.
function pickToday(rows: Asset[], now: Date): Asset | undefined {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);
  return rows.find(r => r.last_posted_on === today) ?? rows[((torontoDayIndex(now) % rows.length) + rows.length) % rows.length];
}

// The leaf, drawn: Satori has no emoji font, and 🍁 is orange in the fonts that do have it,
// which vanishes on a red pill.
function leaf(size: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ marginRight: 9 }}>
      <path fill="#fff" d="M256 48l-30 56c-3 6-9 5-15 2l-22-11 16 87c3 16-8 16-14 9l-38-43-6 22c-1 3-4 6-9 5l-48-10 13 46c3 10 5 14-3 17l-17 8 83 67c8 6 11 9 8 19l-7 24 79-9c5 0 8 2 8 7l-4 84h22l-4-84c0-5 3-7 8-7l79 9-7-24c-3-10 0-13 8-19l83-67-17-8c-8-3-6-7-3-17l13-46-48 10c-5 1-8-2-9-5l-6-22-38 43c-6 7-17 7-14-9l16-87-22 11c-6 3-12 4-15-2z" />
    </svg>
  );
}

// The two-way arrow of the flyer headline, as a path.
function swap(size: number, color: string) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 40 25" style={{ margin: "0 14px" }}>
      <path d="M3 9h28l-7-7 3-2 11 10-11 10-3-2 7-7H3z" fill={color} transform="translate(0,-1)" />
      <path d="M37 19H9l7 7-3 2L2 18 13 8l3 2-7 7h28z" fill={color} transform="translate(0,3)" />
    </svg>
  );
}

const van = (color: string) => (
  <svg width={84} height={35} viewBox="0 0 70 29" fill="none">
    <g stroke={color}>
      <path d="M3.4 20.6V10.6a3.2 3.2 0 0 1 3.2-3.2h28.9c.9 0 1.8.4 2.4 1.1l5.2 5.9h6.6a7.3 7.3 0 0 1 7.3 7.3v.6a1.4 1.4 0 0 1-1.4 1.4h-4.5a4.6 4.6 0 0 0-9.2 0H21.1a4.6 4.6 0 0 0-9.2 0H4.8a1.4 1.4 0 0 1-1.4-1.4z" strokeWidth={2.3} strokeLinejoin="round" />
      <path d="M10.5 8.2v6.2M19.6 8.2v6.2M28.7 8.2v6.2M36.4 9.4l4.1 4.6" strokeWidth={1.7} strokeLinecap="round" opacity={0.5} />
      <path d="M3.4 14.4h39.7" strokeWidth={1.7} opacity={0.5} />
      <circle cx="16.5" cy="23.6" r="4.3" strokeWidth={2.3} />
      <circle cx="45.9" cy="23.6" r="4.3" strokeWidth={2.3} />
    </g>
  </svg>
);

export async function GET(req: NextRequest, { params }: { params: { key: string; opts?: string[] } }) {
  const opts = (params.opts ?? []).map(o => decodeURIComponent(o).toLowerCase());
  const bad = opts.filter(o => o !== "tall" && !/^p[0-3]$/.test(o));
  if (bad.length) return new Response(`unknown option: ${bad[0]}`, { status: 404 });
  const forced = opts.find(o => /^p[0-3]$/.test(o));
  const origin = new URL(req.url).origin;
  const now = new Date();
  const p = palette(now, forced ? forced.slice(1) : null);
  const L = SHAPES[opts.includes("tall") ? "tall" : "wide"];

  const rows = await assets();
  if (!rows.length) return new Response("no flyer assets", { status: 503 });
  const raw = decodeURIComponent(params.key || "");
  // By key ("Île d'Orléans") or by slug ("ile-d-orleans"): the Facebook function rewrites the
  // old stored file name loadq-flyer-<slug>.jpg to this route, and it holds the slug, not the key.
  const a = raw === "today"
    ? pickToday(rows, now)
    : rows.find(r => r.key === raw) ?? rows.find(r => flyerSlug(r.key) === flyerSlug(raw));
  if (!a) return new Response("unknown flyer", { status: 404 });

  const font = async (file: string) =>
    fetch(`${origin}/fonts/${file}`).then(r => r.arrayBuffer());
  const [black, semi, medium, serifSemi, serif, serifIt] = await Promise.all([
    font("Archivo-Black.woff"), font("Archivo-SemiBold.woff"), font("Archivo-Medium.woff"),
    font("SourceSerif4-SemiBold.woff"), font("SourceSerif4-Regular.woff"), font("SourceSerif4-Italic.woff"),
  ]);

  // Satori cannot measure text, so both the headline and the caption are sized by estimate.
  //
  // Headline: Archivo Black caps run about 0.70em wide and the arrow takes another ~1.4em.
  // MONTRÉAL ⇄ ÎLE D'ORLÉANS is the longest of the twenty; at the earlier 0.62 it ran off the
  // right edge of the tall frame, so the factor is deliberately generous.
  const chars = a.city_a.length + a.city_b.length;
  const head = Math.min(L.headMax, Math.floor(L.panel / (0.70 * chars + 1.4)));

  // Caption: Source Serif runs about 0.48em per character, so a line holds strip/(0.48*size)
  // characters. Shrink both caption sizes together until the block clears the buttons — the
  // English line of Île d'Orléans used to run underneath www.loadq.ca.
  const room = L.btnTop - L.capTop - 14;
  const lines = (t: string, size: number) => Math.ceil((t.length * 0.48 * size) / L.strip);
  let capFr = L.capFr, capEn = L.capEn;
  const blockH = () =>
    L.capH * 1.2 + 6 + lines(a.cap_fr, capFr) * capFr * 1.34 + 5 + lines(a.cap_en, capEn) * capEn * 1.34;
  while (blockH() > room && capFr > 17) { capFr -= 1; capEn -= 1; }
  const [l1, l2] = a.board
    ? ["Tous les jours, dans les deux sens.", "Every day, both ways. Book on the LoadQ app."]
    : ["Porte-à-porte, sur réservation.", "Door-to-door, booked ahead. On the LoadQ app."];
  const text = (t: string, style: React.CSSProperties) =>
    <div style={{ width: L.panel, ...style }}>{t}</div>;

  const badge = (small: string, big: string, mark: React.ReactElement) => (
    <div style={{ display: "flex", alignItems: "center", background: "#000", color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "7px 13px" }}>
      {mark}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 9 }}>
        <div style={{ fontSize: 11, fontFamily: "Archivo", fontWeight: 600, opacity: 0.85 }}>{small}</div>
        <div style={{ fontSize: 17, fontFamily: "Archivo", fontWeight: 600 }}>{big}</div>
      </div>
    </div>
  );

  // The photo, then the colour of the day washed over it: from the left on the wide flyer, from
  // the top and bottom on the tall one, so the text always sits on colour and the landmark
  // always sits in clear air.
  const washes = L.photo.top === 0
    ? [
        <div key="wash" style={{ position: "absolute", top: 0, left: 520, width: 620, height: L.h, display: "flex",
                                 backgroundImage: `linear-gradient(to right, rgb(${p.bgRGB}) 0%, rgba(${p.bgRGB},0.92) 22%, rgba(${p.bgRGB},0.45) 62%, rgba(${p.bgRGB},0) 100%)` }} />,
      ]
    : [
        <div key="washTop" style={{ position: "absolute", top: L.photo.top - 1, left: 0, width: L.w, height: 300, display: "flex",
                                    backgroundImage: `linear-gradient(to bottom, rgb(${p.bgRGB}) 0%, rgba(${p.bgRGB},0.7) 28%, rgba(${p.bgRGB},0.25) 65%, rgba(${p.bgRGB},0) 100%)` }} />,
        <div key="washBot" style={{ position: "absolute", top: 820, left: 0, width: L.w, height: L.h - 820, display: "flex",
                                    backgroundImage: `linear-gradient(to bottom, rgba(${p.bgRGB},0) 0%, rgba(${p.bgRGB},0.74) 17%, rgba(${p.bgRGB},0.93) 35%, rgb(${p.bgRGB}) 58%)` }} />,
      ];

  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative",
                    background: p.bg, color: p.hi, fontFamily: "Archivo" }}>
        <img src={`${origin}/flyer/${L.photo.dir}${flyerSlug(a.key)}.jpg`} width={L.photo.w} height={L.photo.h}
             style={{ position: "absolute", top: L.photo.top, right: L.photo.right }} />
        {washes}

        <div style={{ position: "absolute", left: L.left, top: L.pill, display: "flex", alignItems: "center",
                      background: p.pillBg, color: "#fff", borderRadius: 999, padding: "9px 22px 9px 18px",
                      fontSize: L.leaf + 3, fontWeight: 600 }}>
          {leaf(L.leaf)}Made in Canada
        </div>

        <div style={{ position: "absolute", left: L.left, top: L.pill + 60, display: "flex",
                      fontSize: L.mark, fontWeight: 900, letterSpacing: L.mark * -0.035, lineHeight: 1 }}>
          <span style={{ color: p.hi }}>Load</span><span style={{ color: p.acc }}>Q</span>
        </div>

        <div style={{ position: "absolute", left: L.left, top: L.headTop, height: L.headBox,
                      display: "flex", alignItems: "center",
                      fontSize: head, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>
          <span>{a.city_a}</span>{swap(head * 0.72, p.acc)}<span>{a.city_b}</span>
        </div>

        <div style={{ position: "absolute", left: L.left, top: L.subTop, display: "flex" }}>
          {text("NAVETTE INTERURBAINE · INTERCITY SHUTTLE",
                { fontSize: L.sub, fontWeight: 600, letterSpacing: L.subLS, color: p.acc })}
        </div>

        <div style={{ position: "absolute", left: L.left, top: L.blockTop, width: L.panel, display: "flex", flexDirection: "column" }}>
          {text(l1, { fontSize: L.l1, fontWeight: 600 })}
          {text(l2, { marginTop: 6, fontSize: L.l2, fontWeight: 500, color: p.mute })}
          <div style={{ display: "flex", marginTop: 10, fontSize: L.l3, alignItems: "baseline" }}>
            <span style={{ color: p.acc, fontWeight: 600 }}>Colis aussi · kolis.ca</span>
            <span style={{ color: p.mute, marginLeft: 10, fontWeight: 500 }}>Parcels on the same run — Kolis</span>
          </div>
        </div>

        {/* route strip: origin left, destination right, the shuttle driving that way */}
        <div style={{ position: "absolute", left: L.left, top: L.stripTop, width: L.strip, display: "flex",
                      alignItems: "center", fontSize: L.stripF, fontWeight: 600 }}>
          <span>{a.city_a}</span>
          <div style={{ display: "flex", flex: 1, height: 2, background: p.rule, margin: "0 14px" }} />
          {van(p.van)}
          <div style={{ display: "flex", flex: 1, height: 2, background: p.rule, margin: "0 14px" }} />
          <span>{a.city_b}</span>
        </div>
        <div style={{ position: "absolute", left: L.left, top: L.ruleTop, width: L.strip, height: 2, display: "flex", background: p.rule }} />

        <div style={{ position: "absolute", left: L.left, top: L.capTop, width: L.strip, display: "flex", flexDirection: "column" }}>
          <div style={{ width: L.strip, fontFamily: "Source Serif 4", fontWeight: 600, fontSize: L.capH, letterSpacing: 2, color: p.acc }}>{a.cap_head}</div>
          <div style={{ width: L.strip, marginTop: 6, fontFamily: "Source Serif 4", fontSize: capFr, lineHeight: 1.34 }}>{a.cap_fr}</div>
          <div style={{ width: L.strip, marginTop: 5, fontFamily: "Source Serif 4", fontStyle: "italic", fontSize: capEn, lineHeight: 1.34, color: p.mute }}>{a.cap_en}</div>
        </div>

        <div style={{ position: "absolute", left: L.left, top: L.btnTop, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", background: p.wwwBg, color: p.wwwFg, fontSize: L.www, fontWeight: 600,
                        borderRadius: 999, padding: "11px 26px", marginRight: 12 }}>{L.link}</div>
          {badge("DISPONIBLE SUR", "Google Play",
            <svg width={19} height={21} viewBox="0 0 22 24">
              <path d="M2 1.5l12 10.5L2 22.5z" fill="#34A853" />
              <path d="M2 1.5l12 10.5 4-3.5z" fill="#4285F4" />
              <path d="M2 22.5l12-10.5 4 3.5z" fill="#EA4335" />
              <path d="M14 12l4-3.5 3 1.8c.8.6.8 2.8 0 3.4l-3 1.8z" fill="#FBBC04" />
            </svg>)}
          <div style={{ display: "flex", marginLeft: 12 }}>
            {badge("Télécharger dans", "l’App Store",
              <svg width={17} height={21} viewBox="0 0 20 24" fill="#fff">
                <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5.1c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
              </svg>)}
          </div>
        </div>

        {/* The photo credit. CC BY requires it, so it belongs on the artwork itself — on the wide
            flyer it sits on the photo, on the tall one under the buttons, on colour.
            On the photo it gets a dark chip: a shadow alone vanished against bright water. */}
        <div style={{ position: "absolute", display: "flex", fontSize: 15, fontWeight: 500,
                      ...(L.creditLeft != null
                        ? { left: L.creditLeft, top: L.creditTop!, color: p.mute }
                        : { right: L.creditRight!, bottom: L.creditBottom!, color: "rgba(255,255,255,0.92)",
                            background: "rgba(11,12,15,0.62)", borderRadius: 8, padding: "5px 11px" }) }}>
          Photo : {a.photo_by} · Wikimedia Commons · {a.photo_lic}
        </div>
      </div>
    ),
    {
      width: L.w, height: L.h,
      fonts: [
        { name: "Archivo", data: black, weight: 900, style: "normal" },
        { name: "Archivo", data: semi, weight: 600, style: "normal" },
        { name: "Archivo", data: medium, weight: 500, style: "normal" },
        { name: "Source Serif 4", data: serifSemi, weight: 600, style: "normal" },
        { name: "Source Serif 4", data: serif, weight: 400, style: "normal" },
        { name: "Source Serif 4", data: serifIt, weight: 400, style: "italic" },
      ],
    },
  );

  // Half an hour: long enough that a shared post is not re-rendered per viewer, short enough
  // that a caption fix shows up the same day.
  const out = new Response(img.body, img);
  out.headers.set("Cache-Control", "public, max-age=1800");
  return out;
}
