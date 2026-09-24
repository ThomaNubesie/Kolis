import { ImageResponse } from "next/og";
import { torontoDayIndex } from "../../../../lib/loadqDay";

// GET /tiktok/<kind>/<id>  → a 1080×1920 PNG, ready to drop into a TikTok slideshow.
//
// kind = board  | id = zone_id      the live queue for one loading point
//        ask    | id = card index   a question
//        answer | id = card index   its answer
//
// Destinations are NOT here: /flyer/<key>/tall draws them, the same artwork the Facebook
// flyer uses, in the same colour of the day.
//
// Rendered on demand rather than written out each morning by a job: a cron producing eight PNGs a
// day needs somewhere to put them, a way to clean them up, and fails quietly when it breaks —
// leaving yesterday's car counts on this morning's video. A URL is always today's.
//
// TWO SATORI RULES, both learned the hard way on this file. Satori is not a browser:
//   1. A <>fragment</> passed as the children of a flex container is not expanded into flex
//      children. The column direction is ignored, everything lands in one row and runs off the
//      side of the canvas. Children must be a real ARRAY with keys.
//   2. A div with display:flex makes its text a flex ITEM, which does not wrap. Text belongs in a
//      plain block with an explicit width; only containers with several children get flex.
//
// Node, not edge: the board frame embeds the /board PNG, which the edge runtime could not decode.
export const runtime = "nodejs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// TikTok lays its caption, username and button rail over roughly the bottom 320px and the right
// 180px. Nothing that must be read goes below SAFE_BOTTOM.
const W = 1080;
const H = 1920;
const SAFE_BOTTOM = 1580;
const TXT = 950;

// The palette rotates by day so consecutive mornings do not look like the same post reheated.
// All four are already in the brand set: the orange, the azure, the charcoal the app uses at
// night, and the cream from the flyer series.
const PALETTES = [
  { bg: "#F2760F", ink: "#15171C", hi: "#FFFFFF", sub: "rgba(21,23,28,0.78)" },
  { bg: "#2F6FE0", ink: "#0B1B3A", hi: "#FFFFFF", sub: "rgba(255,255,255,0.82)" },
  { bg: "#15171C", ink: "#FF8A1A", hi: "#FFFFFF", sub: "rgba(255,255,255,0.70)" },
  { bg: "#F7EFE2", ink: "#C2410C", hi: "#15171C", sub: "rgba(21,23,28,0.70)" },
];
function paletteFor(d: Date) {
  const day = torontoDayIndex(d);
  return PALETTES[((day % PALETTES.length) + PALETTES.length) % PALETTES.length];
}

// Questions riders actually ask, in the order they ask them. Bilingual, because the audience is.
const CARDS: { q: [string, string]; a: [string, string] }[] = [
  {
    q: ["C'est combien, Ottawa → Montréal ?", "How much is Ottawa → Montréal?"],
    a: ["30 $ la place. Le même prix pour tout le monde.", "$30 a seat. The same price for everyone."],
  },
  {
    q: ["À quelle heure part la voiture ?", "When does the car leave?"],
    a: ["Quand elle est pleine. Le tableau en direct montre les places qui restent.",
        "When it fills. The live board shows the seats left."],
  },
  {
    q: ["Et si je ne peux pas me rendre au départ ?", "What if I can't get to the departure point?"],
    a: ["On vient vous chercher. Quatre façons, dès 12,99 $.", "We come to you. Four ways, from $12.99."],
  },
  {
    q: ["Vous allez plus loin que Montréal ?", "Do you go past Montréal?"],
    a: ["Porte-à-porte vers 64 villes, sur réservation.", "Door-to-door to 64 towns, booked ahead."],
  },
  {
    q: ["Je peux envoyer un colis ?", "Can I send a parcel?"],
    a: ["Oui — Kolis, même corridor, même jour.", "Yes — Kolis, same corridor, same day."],
  },
  {
    q: ["Comment je réserve ?", "How do I book?"],
    a: ["Sur l'appli LoadQ, en quelques secondes.", "On the LoadQ app, in seconds."],
  },
];

type Board = {
  zone_id: string; zone: string; from_city: string; to_city: string;
  cars: number; seats_free: number;
};
type Palette = (typeof PALETTES)[0];

// A centred line of text.
//
// textAlign alone does not centre a DIRECT child of the outer flex column — the box centres but
// the text inside it stays left. Nesting it in its own flex column with alignItems:center is what
// actually works, so every standalone line goes through here rather than being hand-styled.
function line(key: string, text: string, style: React.CSSProperties) {
  return (
    <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: TXT }}>
      <div style={{ textAlign: "center", ...style }}>{text}</div>
    </div>
  );
}

function wordmark(p: Palette) {
  return (
    <div key="wm" style={{ display: "flex", fontSize: 84, fontWeight: 900, letterSpacing: -2.4, lineHeight: 1 }}>
      <span style={{ color: p.hi }}>Load</span>
      <span style={{ color: p.ink }}>Q</span>
    </div>
  );
}

export async function GET(req: Request, { params }: { params: { kind: string; id: string } }) {
  const origin = new URL(req.url).origin;
  const p = paletteFor(new Date());
  const kind = params.kind;
  const id = decodeURIComponent(params.id || "");

  const png = (children: React.ReactElement[]) =>
    new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%", background: p.bg, display: "flex",
            flexDirection: "column", alignItems: "center", padding: "54px 60px 0",
            fontFamily: "sans-serif",
          }}
        >
          {children}
        </div>
      ),
      { width: W, height: H },
    );

  const respond = (img: ImageResponse, maxAge: number) => {
    const out = new Response(img.body, img);
    out.headers.set("Cache-Control", `public, max-age=${maxAge}`);
    return out;
  };

  // ── a question, or its answer ─────────────────────────────────────────────
  if (kind === "ask" || kind === "answer") {
    const i = Math.max(0, Math.min(CARDS.length - 1, parseInt(id, 10) || 0));
    const isQ = kind === "ask";
    const [fr, en] = isQ ? CARDS[i].q : CARDS[i].a;
    return respond(
      png([
        wordmark(p),
        line("eyebrow", isQ ? "ON VOUS DEMANDE · YOU ASKED" : "LA RÉPONSE · THE ANSWER",
             { marginTop: 26, fontSize: 30, fontWeight: 800, letterSpacing: 3, color: p.ink }),
        <div key="body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, paddingBottom: H - SAFE_BOTTOM }}>
          {line("fr", fr, { fontSize: isQ ? 80 : 64, fontWeight: 900, color: p.hi, lineHeight: 1.18 })}
          {line("en", en, { marginTop: 34, fontSize: isQ ? 46 : 40, fontWeight: 600, color: p.sub, lineHeight: 1.3 })}
        </div>,
      ]),
      1800,
    );
  }

  // ── a live board ──────────────────────────────────────────────────────────
  const r = await fetch(`${SB}/rest/v1/rpc/loadq_board_public`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const boards: Board[] = r.ok ? await r.json() : [];
  const b = boards.find((x) => x.zone_id === id) ?? boards[0];
  if (!b) return new Response("no board", { status: 404 });

  return respond(
    png([
      wordmark(p),
      line("eyebrow", "EN FILE MAINTENANT · IN LINE NOW",
           { marginTop: 20, fontSize: 29, fontWeight: 800, letterSpacing: 3, color: p.ink }),
      line("route", `${b.from_city} → ${b.to_city}`,
           { marginTop: 10, fontSize: 40, fontWeight: 900, color: p.hi }),
      // The board is 4:5 and TikTok is 9:16 — it needs MORE height, not less, so it goes in whole.
      // Cropping to fit would cut cars off the bottom of the queue.
      <img key="board" src={`${origin}/board/${encodeURIComponent(b.zone_id)}`} width={840} height={1050} style={{ marginTop: 24, borderRadius: 24 }} />,
      <div key="foot" style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 22 }}>
        {line("zone", b.zone, { fontSize: 35, fontWeight: 900, color: p.ink })}
        {line("count", `${b.cars} voitures · ${b.seats_free} places libres`,
              { marginTop: 10, fontSize: 31, fontWeight: 700, color: p.hi })}
        {line("url", "loadq.ca · 613-862-2639", { marginTop: 10, fontSize: 26, color: p.sub })}
      </div>,
    ]),
    900,
  );
}
