// Kolis parcel card, rendered as a PNG on demand.
//
//   /card/<scan_token>/<event id>  → the card for one tracking event:
//        picked_up  → Card 4 (landscape split), the courier's pickup photo on the right
//        checkpoint → Card 4, the city's landmark photo ("Colis à Kingston.")
//        delivered  → Card 1 (tall), the drop-off photo front and centre
//   /card/<scan_token>             → the delivered card (links sent before events existed)
//   /card/<scan_token>?kind=pickup → the pickup card (same, legacy)
//
// The event id is a path segment on purpose: the CDN cached /card/<token> and
// served the delivered render for ?kind=pickup. A distinct path per event can't
// collide.
//
// Keyed by scan_token because Twilio fetches it unauthenticated and the card shows a
// name — a KL-code URL would be trivially enumerable.
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAG = "#E8176B";
const BLACK = "#0A0A0C";
const ROSE = "#FFADCD";
const STRIPE = ["#00BCAA", "#3CC85A", "#FACC14", "#FA8C28", "#EC3C82"];

type Card = {
  code: string; status: string; from_city: string; to_city: string;
  recipient: string | null; courier: string | null; lang: string | null;
  brand: { name: string; color: string | null } | null;
  kind: "picked_up" | "checkpoint" | "delivered"; city: string | null; note: string | null;
  photo: string | null; at: string | null;
};

const MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Every corridor is Eastern time; the card used to print UTC (7 h 23 came out 12 h 23).
function stamp(iso: string | null, fr: boolean) {
  if (!iso) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const day = Number(parts.day), mon = (fr ? MONTHS_FR : MONTHS_EN)[Number(parts.month) - 1];
  return fr ? `${day} ${mon} · ${Number(parts.hour)} h ${parts.minute}` : `${mon} ${day} · ${parts.hour}:${parts.minute}`;
}

// One element (not a fragment — next/og drops fragment children's layout), stretched
// across the card; `pad` cancels the parent's side padding.
const Footer = ({ pad }: { pad: number }) => (
  <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch", marginLeft: -pad, marginRight: -pad }}>
    <div style={{ display: "flex", height: 12 }}>
      {STRIPE.map((c) => <div key={c} style={{ display: "flex", flex: 1, background: c }} />)}
    </div>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: BLACK, padding: "22px 0 26px" }}>
      <div style={{ display: "flex", color: "#fff", fontSize: 34, fontWeight: 800 }}>CONCORD EXPRESS CO INC.</div>
      <div style={{ display: "flex", color: "#96969E", fontSize: 22, marginTop: 4 }}>Ottawa, Ontario, Canada · kolis.ca</div>
    </div>
  </div>
);

// The built-in font has no bold, so the headlines came out thin. Inter, fetched
// once per instance and reused.
const FONT_URL = (w: number) => `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${w}-normal.woff`;
let fontsP: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" }[]> | null = null;
function fonts() {
  fontsP ??= Promise.all(([400, 700, 800] as const).map(async (weight) => ({
    name: "Inter", weight, style: "normal" as const,
    data: await fetch(FONT_URL(weight)).then((r) => { if (!r.ok) throw new Error("font"); return r.arrayBuffer(); }),
  }))).catch((e) => { fontsP = null; throw e; });
  return fontsP;
}

export async function GET(req: Request, { params }: { params: { token: string; ev?: string[] } }) {
  const eventId = params.ev?.[0] ?? null;
  const legacyPickup = !eventId && new URL(req.url).searchParams.get("kind") === "pickup";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await fetch(`${base}/rest/v1/rpc/kolis_card_event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_token: params.token, p_event: eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null }),
    cache: "no-store",
  });
  const p = (await res.json().catch(() => null)) as Card | null;
  if (!p || !p.code) return new Response("not found", { status: 404 });

  // No event in the path = a link sent before events existed, which always meant
  // the delivered card (or ?kind=pickup).
  const kind = legacyPickup ? "picked_up" : eventId ? p.kind : "delivered";
  const fr = (p.lang ?? "fr") !== "en";
  const accent = p.brand?.color || MAG;
  const when = stamp(p.at, fr) || (fr ? "aujourd'hui" : "today");
  const brandName = p.brand?.name || "KOLIS";
  const photo = legacyPickup ? null : p.photo;
  const headers = { "Cache-Control": "public, max-age=60" };
  // A missing font must not cost the customer their card: fall back to the default.
  const fontList = await fonts().catch(() => undefined);

  // ── Card 4: landscape split — pickup and every checkpoint ─────────────────
  if (kind !== "delivered") {
    const stop = kind === "checkpoint";
    const city = p.city || (fr ? "en route" : "on the way");
    const eyebrow = `${stop ? (fr ? "EN TRANSIT" : "IN TRANSIT") : (fr ? "RAMASSÉ" : "PICKED UP")} · ${p.code}`;
    const head2 = stop ? (p.city ? (fr ? `à ${city}.` : `in ${city}.`) : (fr ? "en route." : "on its way."))
                       : (fr ? "ramassé." : "picked up.");
    const panelLabel = stop ? (fr ? "ÉTAPE" : "CHECKPOINT") : (fr ? "RAMASSAGE" : "PICKUP");
    const panelLine = stop
      ? (p.note || (fr ? `En route vers ${p.to_city}.` : `On its way to ${p.to_city}.`))
      : (p.courier ? (fr ? `Pris en charge par ${p.courier}.` : `Collected by ${p.courier}.`) : (fr ? `En route vers ${p.to_city}.` : `On its way to ${p.to_city}.`));
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: accent, fontFamily: "Inter, sans-serif" }}>
          <div style={{ display: "flex", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 610, padding: "48px 0 0 56px" }}>
              <div style={{ display: "flex", background: BLACK, color: accent, fontSize: 34, fontWeight: 700, borderRadius: 14, padding: "11px 22px", alignSelf: "flex-start" }}>{brandName}</div>
              <div style={{ display: "flex", color: ROSE, fontSize: 22, fontWeight: 700, letterSpacing: 5, marginTop: 26 }}>{eyebrow}</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
                <div style={{ display: "flex", color: "#fff", fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>Colis</div>
                <div style={{ display: "flex", color: BLACK, fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>{head2}</div>
              </div>
              {p.recipient ? <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 700, marginTop: 16 }}>{fr ? "Pour " : "For "}{p.recipient}</div> : null}
              <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 700, marginTop: 4 }}>{p.from_city} → {p.to_city}</div>
              <div style={{ display: "flex", flexDirection: "column", background: BLACK, borderRadius: 26, padding: "26px 30px", marginTop: 24, marginRight: 30 }}>
                <div style={{ display: "flex", color: "#96969E", fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>{panelLabel}</div>
                <div style={{ display: "flex", color: "#fff", fontSize: 32, fontWeight: 800, marginTop: 10 }}>{when}</div>
                <div style={{ display: "flex", color: "#E1E1E6", fontSize: 22, marginTop: 8 }}>{panelLine}</div>
              </div>
            </div>
            {photo ? (
              <img src={photo} width={470} height={620} style={{ objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: 470, background: BLACK }}>
                <div style={{ display: "flex", color: "#96969E", fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>{fr ? "SUIVI" : "TRACKING"}</div>
                <div style={{ display: "flex", color: "#fff", fontSize: 56, fontWeight: 800, marginTop: 10 }}>{p.code}</div>
                <div style={{ display: "flex", color: accent, fontSize: 24, fontWeight: 700, marginTop: 10 }}>kolis.ca</div>
              </div>
            )}
          </div>
          <Footer pad={0} />
        </div>
      ),
      { width: 1080, height: 760, headers, fonts: fontList }
    );
  }

  // ── Card 1: tall — delivered ──────────────────────────────────────────────
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: accent, padding: "64px 64px 0", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", background: BLACK, color: accent, fontSize: 46, fontWeight: 700, borderRadius: 20, padding: "14px 30px", alignSelf: "flex-start" }}>{brandName}</div>
        <div style={{ display: "flex", color: ROSE, fontSize: 26, fontWeight: 700, letterSpacing: 6, marginTop: 34 }}>{fr ? "LIVRÉ" : "DELIVERED"} · {p.code}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          <div style={{ display: "flex", color: "#fff", fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>Colis</div>
          <div style={{ display: "flex", color: BLACK, fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{fr ? "livré." : "delivered."}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
          {p.recipient ? <div style={{ display: "flex", color: "#fff", fontSize: 38, fontWeight: 700 }}>{fr ? "Pour " : "For "}{p.recipient}</div> : null}
          <div style={{ display: "flex", color: "#fff", fontSize: 38, fontWeight: 700 }}>{p.from_city} → {p.to_city}</div>
        </div>
        {photo ? <img src={photo} width={952} height={470} style={{ marginTop: 30, borderRadius: 24, objectFit: "cover" }} /> : null}
        <div style={{ display: "flex", flexDirection: "column", background: BLACK, borderRadius: 30, padding: 36, marginTop: 30 }}>
          <div style={{ display: "flex", color: "#96969E", fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>{fr ? "CONFIRMATION DE LIVRAISON" : "DELIVERY CONFIRMATION"}</div>
          <div style={{ display: "flex", color: "#fff", fontSize: 44, fontWeight: 800, marginTop: 14 }}>{when}</div>
          {p.courier ? <div style={{ display: "flex", color: "#E1E1E6", fontSize: 30, marginTop: 12 }}>{fr ? `Remis par ${p.courier}.` : `Delivered by ${p.courier}.`}</div> : null}
          <div style={{ display: "flex", color: "#E1E1E6", fontSize: 30, marginTop: 8 }}>{fr ? "Merci d'avoir choisi Concord Express." : "Thank you for choosing Concord Express."}</div>
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <Footer pad={64} />
      </div>
    ),
    { width: 1080, height: photo ? 1680 : 1180, headers, fonts: fontList }
  );
}
