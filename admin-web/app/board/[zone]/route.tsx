import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { CAR_SLUGS } from "../../../lib/carSlugs";
import { paletteIndexFor } from "../../../lib/loadqDay";

// GET /board?zone=<zone_id>  → a 1080×1350 PNG of that zone's live queue.
//
// This is the board itself, not a picture of it: it renders from loadq_board_public()
// at request time, so the tablet at the loading point, the website and Facebook all show
// the same thing without anything having to push updates around.
//
// Cache-Control is two hours by deliberate choice. Rendering per request would hammer the
// database from every tablet refresh; a 2-hour edge cache means the board is current
// within the window that was asked for, and costs one query per zone per two hours no
// matter how many screens are watching.
//
// Driver names come back as INITIALS from the RPC — this route is public and must not
// expose the roster. See loadq_board_public().
// Node, not edge: the render decodes several vehicle PNGs, which exceeded the edge
// function's memory and returned a 500 with an empty body.
export const runtime = "nodejs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// The board's own furniture — the car cards — never changes: it stays dark on every palette so
// the queue reads the same at a glance from a tablet at the loading point, and so a board photo
// is recognisable whatever day it was taken.
const C = {
  bg: "#15171C", surface: "#1B1E25", card: "#232733", cardAlt: "#2C313F",
  border: "#3E4453", t1: "#FFFFFF", t2: "#AEB6C4", t3: "#7C8697",
  azure: "#4C82F0", orange: "#FF8A1A", yellow: "#F5C842", green: "#3FD08A",
};

// What DOES change is the surround: page background, header band and the text on them. One
// palette per day, the same four the TikTok pack and the Facebook flyer use, so everything
// posted on a given day carries one colour. Which day wears which: lib/loadqDay.ts.
const DAYS = [
  { bg: "#F2760F", head: "#15171C", on: "#FFFFFF", on2: "rgba(255,255,255,.80)", rule: "#15171C" }, // Orange
  { bg: "#2F6FE0", head: "#15171C", on: "#FFFFFF", on2: "rgba(255,255,255,.80)", rule: "#FF8A1A" }, // Azure
  { bg: "#2A3040", head: "#171B24", on: "#FFFFFF", on2: "rgba(255,255,255,.78)", rule: "#4C82F0" }, // Charcoal
  { bg: "#F7EFE2", head: "#15171C", on: "#15171C", on2: "rgba(21,23,28,.72)",    rule: "#C2410C" }, // Cream
];
function dayPalette(d: Date, override?: string | null) {
  const i = override != null && override !== "" ? parseInt(override, 10) : paletteIndexFor(d);
  return DAYS[((i % DAYS.length) + DAYS.length) % DAYS.length];
}

// Made in Canada, short form, for the board posts.
//
// The leaf is drawn as a path, NOT the 🍁 emoji. Two independent reasons, either one fatal:
// this renderer is Satori, which has no emoji font at all and would produce tofu or nothing;
// and the emoji is orange in every emoji font that does have it, so on this red pill it
// disappeared entirely the last time it was tried. A white path on red depends on no font.
function MIC({ scale = 1 }: { scale?: number }) {
  const px = (n: number) => Math.round(n * scale);
  return (
    <div style={{ display: "flex", alignItems: "center", background: "#F91515", color: "#fff",
                  borderRadius: 999, padding: `${px(7)}px ${px(16)}px`,
                  fontSize: px(20), fontWeight: 800, letterSpacing: 0.3 }}>
      <svg width={px(20)} height={px(20)} viewBox="0 0 512 512" style={{ marginRight: px(9) }}>
        <path fill="#fff" d="M256 48l-30 56c-3 6-9 5-15 2l-22-11 16 87c3 16-8 16-14 9l-38-43-6 22c-1 3-4 6-9 5l-48-10 13 46c3 10 5 14-3 17l-17 8 83 67c8 6 11 9 8 19l-7 24 79-9c5 0 8 2 8 7l-4 84h22l-4-84c0-5 3-7 8-7l79 9-7-24c-3-10 0-13 8-19l83-67-17-8c-8-3-6-7-3-17l13-46-48 10c-5 1-8-2-9-5l-6-22-38 43c-6 7-17 7-14-9l16-87-22 11c-6 3-12 4-15-2z" />
      </svg>
      M.I.C.
    </div>
  );
}

type Car = {
  position: number; status: string; driver: string | null;
  make: string | null; model: string | null; year: number | null; color: string | null;
  seats: number | null; seats_boarded: number; seats_taken: number; seats_left: number;
};
type Board = {
  zone_id: string; zone: string; address: string | null;
  from_city: string; to_city: string; cars: number; seats_free: number;
  loading: number; list: Car[];
};

// Resolves a vehicle to a pre-sized local image. Fetching cdn.imagin.studio during the
// render killed it outright -- five foreign round trips plus decoding 1200x750 PNGs
// returned a 500 with an empty body on both edge and node runtimes. These are fetched
// once by scripts/fetch_cars.py, resized to 380px, and served from this origin.
//
// LICENSING — READ BEFORE TOUCHING THIS. scripts/fetch_cars.py uses customer="img", which is
// imagin.studio's PUBLIC DEMO key. It stamps an "IMAGE studio" watermark across every car, and
// those watermarked images go out on every board post to Facebook. Their terms also state the
// images "may never be downloaded, cached on server side, distributed or modified" — which is
// exactly what fetch_cars.py and public/cars do.
//
// This was replaced with drawn vehicles on 19 Sept and restored the same day at the owner's
// explicit direction, with the above stated and understood. It is a business decision, not an
// oversight. The clean exits are a paid licence, or driver-uploaded photos into
// vehicles.image_url (the column exists; it is null on all 164 active vehicles).
const MODEL_FAMILY: Record<string, string> = {
  "hiace": "hiace", "hiace long": "hiace", "urvan": "urvan", "sprinter": "sprinter",
  "coaster": "coaster", "land cruiser": "land-cruiser", "prado": "land-cruiser-prado",
  "fortuner": "fortuner", "corolla": "corolla", "accord": "accord", "logan": "logan",
  "oddessey": "odyssey", "grand  caravan": "grand-caravan", "grand caravan": "grand-caravan",
  "town & country": "town-country", "rav4 prime (phev)": "rav4", "santa fe xl": "santa-fe",
  "santa fe": "santa-fe", "outlander sport": "outlander", "mazda5": "mazda5",
};
function carSlug(make?: string | null, model?: string | null, color?: string | null) {
  if (!make || !model) return null;
  const m = model.toLowerCase().trim().replace(/[ ]+/g, " ");
  const family = MODEL_FAMILY[m] || m.split(" ")[0];
  const raw = make.toLowerCase().trim() + "-" + family + "-" + (color || "default").toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return CAR_SLUGS.has(slug) ? slug : null;
}

// Paint colours, for the drawn vehicle below. Anything unrecognised falls back to a neutral
// grey rather than guessing — a wrong colour is worse than no colour when the whole point is
// helping someone spot their car.
//
// The outline is NOT simply a darker shade of the body. These sit on a #232733 card, so a dark
// car outlined in a darker colour is two invisible things on top of each other: black rendered
// as #2A2E37 body with #0B0C0F ink was a silhouette that could not be seen at all. Dark bodies
// therefore get a LIGHTER outline than themselves, which is the opposite of the instinct and
// the only thing that reads on a dark board.
const PAINT: Record<string, { body: string; ink: string }> = {
  white:  { body: "#F2F3F5", ink: "#8A909C" },
  silver: { body: "#C9CDD4", ink: "#6B7280" },
  grey:   { body: "#9AA1AC", ink: "#4B5563" },
  gray:   { body: "#9AA1AC", ink: "#4B5563" },
  black:  { body: "#31363F", ink: "#9AA1AC" },   // lighter ink: dark-on-dark is unreadable
  red:    { body: "#D64545", ink: "#7F1D1D" },
  blue:   { body: "#3B6FD4", ink: "#93B0EC" },   // ditto — navy on #232733 disappears
  green:  { body: "#2F8F6B", ink: "#8FD9BF" },
  brown:  { body: "#8A6A4B", ink: "#4A3728" },
  beige:  { body: "#D9CFBC", ink: "#8A7B63" },
  gold:   { body: "#C9A961", ink: "#7A6432" },
  orange: { body: "#FF8A1A", ink: "#9A4A00" },
  yellow: { body: "#E8C547", ink: "#8A6D00" },
  purple: { body: "#7C5CEF", ink: "#C4B5FD" },
};

// The vehicle, drawn — the FALLBACK when no photo matches this make/model/colour.
//
// Briefly this replaced the photos outright, because the photos come from cdn.imagin.studio
// under their public demo key and carry an "IMAGE studio" watermark. Restoring them is a
// deliberate decision taken with that known. See the note above carSlug.
//
// It still earns its place here: a vehicle with no matching slug previously rendered NOTHING,
// leaving a blank gap in the row. A tinted outline is better than a hole.
function Vehicle({ color }: { color?: string | null }) {
  const key = (color || "").toLowerCase().trim();
  const p = PAINT[key] ?? { body: "#9AA1AC", ink: "#4B5563" };
  return (
    <svg width={186} height={77} viewBox="0 0 70 29">
      <path
        d="M3.4 20.6V10.6a3.2 3.2 0 0 1 3.2-3.2h28.9c.9 0 1.8.4 2.4 1.1l5.2 5.9h6.6
           a7.3 7.3 0 0 1 7.3 7.3v.6a1.4 1.4 0 0 1-1.4 1.4h-4.5a4.6 4.6 0 0 0-9.2 0H21.1
           a4.6 4.6 0 0 0-9.2 0H4.8a1.4 1.4 0 0 1-1.4-1.4z"
        fill={p.body} stroke={p.ink} strokeWidth={1.6} strokeLinejoin="round"
      />
      <path d="M10.5 8.2v6.2M19.6 8.2v6.2M28.7 8.2v6.2M36.4 9.4l4.1 4.6"
            stroke={p.ink} strokeWidth={1.3} strokeLinecap="round" opacity={0.55} fill="none" />
      <path d="M3.4 14.4h39.7" stroke={p.ink} strokeWidth={1.3} opacity={0.55} fill="none" />
      <circle cx={16.5} cy={23.6} r={4.3} fill="none" stroke={p.ink} strokeWidth={2} />
      <circle cx={45.9} cy={23.6} r={4.3} fill="none" stroke={p.ink} strokeWidth={2} />
    </svg>
  );
}

// The seat glyph from components/SeatSvg.tsx, same five rectangles. Free seats use a
// lighter stroke than the app's — on a screen read from across a room the app's #3E4453
// at 35% opacity disappears entirely.
function Seat({ state }: { state: "boarded" | "held" | "free" }) {
  const c = state === "boarded" ? C.azure : state === "held" ? C.yellow : "#7E8798";
  const fill = state === "free" ? "transparent" : c;
  const bg = state === "free" ? "transparent" : c + "38";
  return (
    <svg width="19" height="24" viewBox="0 0 36 44">
      <rect x="7" y="0" width="22" height="7" rx="3.5" fill={fill} stroke={c} strokeWidth="2" />
      <rect x="0" y="9" width="5" height="14" rx="2.5" fill={fill} stroke={c} strokeWidth="2" />
      <rect x="7" y="8" width="22" height="18" rx="3" fill={bg} stroke={c} strokeWidth="2" />
      <rect x="31" y="9" width="5" height="14" rx="2.5" fill={fill} stroke={c} strokeWidth="2" />
      <rect x="3" y="28" width="30" height="7" rx="3" fill={fill} stroke={c} strokeWidth="2" />
    </svg>
  );
}

export async function GET(req: NextRequest, { params }: { params: { zone: string } }) {
  const origin = new URL(req.url).origin;   // Satori needs absolute image URLs
  const zoneId = decodeURIComponent(params.zone || "");

  const res = await fetch(`${SB}/rest/v1/rpc/loadq_board_public`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const boards: Board[] = res.ok ? await res.json() : [];
  const b = boards.find((x) => x.zone_id === zoneId) ?? boards[0];


  // Date AND time in the one pill, rather than a second timestamp lower down the image. The pill
  // keeps its green dot, so it still reads as "this is live" while saying which day it is —
  // which is what a reader scrolling past a board post actually needs to know.
  const now = new Date();
  const dayPart = new Intl.DateTimeFormat("fr-CA", {
    weekday: "short", day: "numeric", month: "short", timeZone: "America/Toronto",
  }).format(now);
  const timePart = new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto",
  }).format(now);
  const stamp = `${dayPart} · ${timePart}`;

  // Colour of the day. ?p=0..3 forces one, for previews only — the posts pass no p.
  // nextUrl: Netlify hands the handler a URL with no query string (see app/flyer).
  const D = dayPalette(now, (req.nextUrl?.searchParams ?? new URL(req.url).searchParams).get("p"));

  // No board for this zone: say so plainly rather than rendering an empty frame that
  // looks like a loading failure.
  //
  // This branch MUST NOT be cached. It used to return the ImageResponse directly, which keeps
  // Next's default `immutable, max-age=31536000` — so the failure case was cached for a YEAR
  // while the success case below was cached for two hours. One momentary empty read froze a
  // zone's board permanently: Ottawa showed "no cars" through a morning with eight cars in
  // the line, because the image had been rendered once at 1 a.m. when the line really was
  // empty. An empty board is a transient state and must always be re-rendered.
  if (!b) {
    const empty = new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", background: D.bg, color: D.on2,
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", fontSize: 40, fontFamily: "sans-serif" }}>
          <div style={{ color: D.on, fontSize: 56, fontWeight: 800 }}>Aucune voiture en file</div>
          <div style={{ display: "flex", marginTop: 14 }}>No cars in line right now · loadq.ca</div>
          <div style={{ display: "flex", marginTop: 26 }}><MIC /></div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 24 }}>{stamp}</div>
        </div>
      ),
      { width: 1080, height: 1350 },
    );
    const eout = new Response(empty.body, empty);
    eout.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    return eout;
  }

  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: D.bg, color: C.t1,
                    display: "flex", flexDirection: "column", fontFamily: "sans-serif" }}>
        {/* header — stays dark on every palette, so the wordmark and route read the same way */}
        <div style={{ display: "flex", flexDirection: "column", background: D.head,
                      borderBottom: `3px solid ${D.rule}`, padding: "22px 30px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>
              Load<span style={{ color: C.orange }}>Q</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", background: "rgba(63,208,138,.12)",
                          border: `1px solid #2F8F6B`, borderRadius: 20, padding: "5px 13px",
                          fontSize: 20, fontWeight: 700, color: C.green }}>
              <svg width="9" height="9" viewBox="0 0 9 9" style={{ marginRight: 7 }}><circle cx="4.5" cy="4.5" r="4.5" fill={C.green} /></svg>
              {stamp}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, marginTop: 11 }}>
            {b.from_city.toUpperCase()}
            <span style={{ color: C.orange, margin: "0 12px" }}>→</span>
            {b.to_city.toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: 20, color: C.t2, marginTop: 4 }}>
            {b.zone}{b.address ? ` · ${b.address}` : ""}
          </div>
        </div>

        {/* cars */}
        <div style={{ display: "flex", flexDirection: "column", padding: "14px 30px", gap: 11 }}>
          {b.list.slice(0, 8).map((c, i) => {
            const loading = c.status === "loading";
            const seats = c.seats ?? 0;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 13,
                    // Opaque, not a translucent azure wash: the wash picked up whatever palette
                    // was behind it and on Cream turned near-white, hiding the driver's name.
                    background: loading ? "#1B2436" : C.card,
                    border: `1px solid ${loading ? C.azure : C.border}`,
                    borderRadius: 14, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      width: 48, height: 48, borderRadius: 24, background: C.cardAlt,
                      fontSize: 17, fontWeight: 700 }}>
                  {(c.driver || "?").replace(". ", "").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 22, fontWeight: 700 }}>{c.driver || "—"}</div>
                  <div style={{ display: "flex", fontSize: 16, color: C.t3, marginTop: 2 }}>
                    {[c.make ? c.make[0] + c.make.slice(1).toLowerCase() : "", c.model, c.year, c.color]
                      .filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 5 }}>
                    {Array.from({ length: Math.min(seats, 8) }).map((_, s) => (
                      <Seat key={s} state={s < c.seats_boarded ? "boarded" : s < c.seats_taken ? "held" : "free"} />
                    ))}
                    <span style={{ fontSize: 15, color: C.t2, marginLeft: 8 }}>
                      {c.seats_left} places libres
                    </span>
                  </div>
                </div>
                {(() => { const sl = carSlug(c.make, c.model, c.color);
                  return sl
                    ? <img src={origin + "/cars/" + sl + ".png"} width={186} height={116} style={{ borderRadius: 8 }} />
                    : <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                                    width: 186, height: 116 }}><Vehicle color={c.color} /></div>; })()}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", fontSize: 25, fontWeight: 800 }}>30 $</div>
                  <div style={{ display: "flex", marginTop: 6, fontSize: 14, fontWeight: 700,
                        padding: "5px 11px", borderRadius: 20,
                        background: loading ? "rgba(76,130,240,.2)" : C.cardAlt,
                        color: loading ? C.azure : C.t2 }}>
                    {loading ? "EN CHARGEMENT" : `N° ${c.position}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>


        {/* Seat key. Without it the outlines are just shapes — a viewer has no way to know
            that yellow means held and filled means boarded. */}
        <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "2px 30px 0",
                      color: D.on2, fontSize: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Seat state="free" />libre / free</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Seat state="held" />réservée / held</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Seat state="boarded" />occupée / boarded</div>
        </div>
        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto",
                      background: D.head, borderTop: `3px solid ${D.rule}`, padding: "16px 30px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 25, fontWeight: 800 }}>
              {b.cars} voitures · {b.seats_free} places libres
            </div>
            <div style={{ display: "flex", fontSize: 15, color: C.t2, marginTop: 2 }}>
              Premier arrivé, premier servi · First come, first served
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginLeft: "auto" }}>
            <MIC />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: C.azure }}>loadq.ca</div>
              <div style={{ display: "flex", fontSize: 19, fontWeight: 800, marginTop: 2 }}>613-862-2639</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  );

  const out = new Response(img.body, img);
  out.headers.set("Cache-Control", "public, max-age=7200, s-maxage=7200");
  return out;
}
