// admin.loadq.ca/tiktok — the morning pack.
//
// Open it, see today's frames, save them, film. No job writes files overnight, so there is
// nothing to clean up and nothing that can fail quietly at 6am and leave you with yesterday's
// numbers. Everything here is rendered when the page is opened.
export const dynamic = "force-dynamic";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

import { paletteIndexFor, torontoDayIndex } from "../../lib/loadqDay";

const PALETTE_NAMES = ["Orange", "Azure", "Charcoal", "Cream"];

type Board = { zone_id: string; zone: string; from_city: string; to_city: string; cars: number; seats_free: number };
type Flyer = { key: string; city_a: string; city_b: string; cap_head: string; season: string; mood: string };

async function sb<T>(path: string, init?: RequestInit): Promise<T[]> {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  return r.ok ? r.json() : ([] as T[]);
}

export default async function TikTokPack() {
  const today = new Date();
  const di = torontoDayIndex(today);
  const palette = PALETTE_NAMES[paletteIndexFor(today)];

  const boards = await sb<Board>("rpc/loadq_board_public", { method: "POST", body: "{}" });
  const flyers = await sb<Flyer>("loadq_flyer_assets?active=eq.true&select=key,city_a,city_b,cap_head,season,mood&order=key");

  // Two destinations a day, walked through the catalogue so the pair changes every morning and
  // the whole set is used before any of it repeats.
  const places = flyers.length
    ? [flyers[(di * 2) % flyers.length], flyers[(di * 2 + 1) % flyers.length]]
    : [];
  // Q&A advances one card a day.
  const card = ((di % 6) + 6) % 6;

  // In filming order: the question, the boards that prove it is real, the answer, then the two
  // destinations. The destination artwork is /flyer — the same one Facebook posts that day.
  const frames = [
    { href: `/tiktok/ask/${card}`, label: "Question", sub: "On vous demande", tag: "card" },
    ...boards.map(b => ({
      href: `/tiktok/board/${encodeURIComponent(b.zone_id)}`,
      label: b.zone, sub: `${b.from_city} → ${b.to_city} · ${b.cars} voitures`, tag: "board",
    })),
    { href: `/tiktok/answer/${card}`, label: "Réponse", sub: "La réponse", tag: "card" },
    ...places.filter(Boolean).map(f => (
      {
        href: `/flyer/${encodeURIComponent(f.key)}/tall`,
        label: f.key, sub: `${f.city_a} ⇄ ${f.city_b}`, tag: "destination",
      }
    )),
  ];
  const TAG_COLOR: Record<string, string> = { board: "#3FD08A", card: "#F5C842", destination: "#4C82F0" };

  const fmt = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Toronto" });

  return (
    <main style={{ background: "#0D0F13", color: "#E5E7EB", minHeight: "100vh", padding: "30px 22px 70px",
                   fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: 0, textAlign: "center" }}>Pack TikTok — {fmt.format(today)}</h1>
      <p style={{ textAlign: "center", color: "#8A909C", fontSize: 13, margin: "6px auto 8px", maxWidth: "80ch" }}>
        {frames.length} images, 1080 × 1920. Palette du jour : <b style={{ color: "#FF8A1A" }}>{palette}</b> —
        elle change chaque matin. Clic droit → enregistrer, ou clic pour ouvrir en grand.
      </p>
      <p style={{ textAlign: "center", color: "#5B6270", fontSize: 12, margin: "0 auto 22px", maxWidth: "80ch" }}>
        Les tableaux sont tirés de la file en direct au moment où vous ouvrez cette page.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 16, maxWidth: 1500, margin: "0 auto" }}>
        {frames.map(f => (
          <a key={f.href} href={f.href} target="_blank" rel="noreferrer"
             style={{ background: "#15171C", border: "1px solid #232833", borderRadius: 12, overflow: "hidden", textDecoration: "none", display: "block" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.href} alt={f.label} width={230} height={409} style={{ width: "100%", display: "block" }} />
            <div style={{ padding: "9px 11px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{f.label}</div>
              <div style={{ fontSize: 11.5, color: "#8A909C", marginTop: 2 }}>{f.sub}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase",
                            color: TAG_COLOR[f.tag], marginTop: 6 }}>
                {f.tag}
              </div>
            </div>
          </a>
        ))}
      </div>

      <p style={{ maxWidth: "92ch", margin: "26px auto 0", background: "#0B0C0F", borderLeft: "3px solid #FF8A1A",
                  borderRadius: 9, padding: "13px 16px", fontSize: 12.5, lineHeight: 1.75, color: "#C6CBD4" }}>
        <b style={{ color: "#fff" }}>Ordre suggéré :</b> question → un ou deux tableaux → réponse →
        les deux destinations. La question retient, les tableaux prouvent que c&apos;est réel, la
        réponse paie l&apos;attente, et la destination donne envie.
      </p>
    </main>
  );
}
