// admin.loadq.ca/tiktok/midi — the midday pack, cut from the noon Facebook post.
//
// The morning pack at /tiktok sells the service: a question, the live boards that prove it is
// real, the answer. This one is built on the post that already went out at noon — the destination
// flyer — and turns it into a slideshow by wrapping it in one feature question and its answer.
//
// It carries YESTERDAY'S COLOUR, deliberately. The noon flyer is published in the colour of the
// day it goes out in; by the time the TikTok cut gets made, the day has usually turned over and
// today's palette would no longer match the post the clip is taken from. Matching the source post
// matters more than matching the calendar.
//
// Nothing here touches the database. The destination resolves server-side inside /flyer/today and
// the two cards are static, so this page has nothing that can fail quietly and leave a stale frame.
export const dynamic = "force-dynamic";

import { paletteIndexFor, torontoDayIndex } from "../../../lib/loadqDay";

const PALETTE_NAMES = ["Orange", "Azure", "Charcoal", "Cream"];
const TAG_COLOR: Record<string, string> = { destination: "#4C82F0", card: "#F5C842" };

export default function MiddayPack() {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);

  const pi = paletteIndexFor(yesterday);
  const palette = PALETTE_NAMES[pi];
  // One feature a day, walked through the deck so the whole set is used before any of it repeats.
  const card = ((torontoDayIndex(today) % 6) + 6) % 6;

  // The question hooks, the destination holds them while they wonder, the answer pays it off —
  // the same shape as the morning pack, with the noon flyer standing in for the live boards.
  const frames = [
    {
      href: `/tiktok/ask/${card}?deck=feature&p=${pi}`,
      label: "Question", sub: "Sur une fonction", tag: "card",
    },
    {
      href: `/flyer/today/tall/p${pi}`,
      label: "Destination du jour", sub: "La même image qu'à midi sur Facebook", tag: "destination",
    },
    {
      href: `/tiktok/answer/${card}?deck=feature&p=${pi}`,
      label: "Réponse", sub: "La fonction expliquée", tag: "card",
    },
  ];

  const fmt = new Intl.DateTimeFormat("fr-CA", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Toronto",
  });

  return (
    <main style={{ background: "#0D0F13", color: "#E5E7EB", minHeight: "100vh", padding: "30px 22px 70px",
                   fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: 0, textAlign: "center" }}>Pack TikTok de midi — {fmt.format(today)}</h1>
      <p style={{ textAlign: "center", color: "#8A909C", fontSize: 13, margin: "6px auto 8px", maxWidth: "80ch" }}>
        3 images, 1080 × 1920, tirées de la publication Facebook de midi. Palette :{" "}
        <b style={{ color: "#FF8A1A" }}>{palette}</b> — celle d&apos;hier, pour coller à la publication
        d&apos;origine. Clic droit → enregistrer, ou clic pour ouvrir en grand.
      </p>
      <p style={{ textAlign: "center", color: "#5B6270", fontSize: 12, margin: "0 auto 22px", maxWidth: "80ch" }}>
        La destination est exactement l&apos;image publiée à midi, redessinée au format vertical.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 16,
                    maxWidth: 820, margin: "0 auto" }}>
        {frames.map(f => (
          <a key={f.href} href={f.href} target="_blank" rel="noreferrer"
             style={{ background: "#15171C", border: "1px solid #232833", borderRadius: 12, overflow: "hidden",
                      textDecoration: "none", display: "block" }}>
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
        <b style={{ color: "#fff" }}>Ordre suggéré :</b> question → destination → réponse. La question
        retient, la destination donne envie pendant qu&apos;on y pense, et la réponse paie
        l&apos;attente. Le pack du matin est au <a href="/tiktok" style={{ color: "#FF8A1A" }}>/tiktok</a>.
      </p>
    </main>
  );
}
