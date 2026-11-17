// Kolis parcel card, rendered as a PNG on demand.
//
//   /card/<scan_token>            → delivered card (proof photo if one was taken)
//   /card/<scan_token>?kind=pickup → picked-up card
//
// Why a route and not a pre-rendered file: the cards used to be built by hand on a
// laptop with PIL and MMS'd one at a time. Rendering here means kolis-notify-recipient
// can hand Twilio this URL as MediaUrl the moment a parcel flips to picked_up or
// delivered, so the branded card goes out by itself at both moments.
//
// Keyed by scan_token because Twilio fetches it unauthenticated and the card shows a
// name — a KL-code URL would be trivially enumerable.
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAG = "#E8176B";
const BLACK = "#0A0A0C";
const ROSE = "#FFADCD";

type Card = {
  code: string; status: string; from_city: string; to_city: string;
  recipient: string | null; courier: string | null;
  picked_up_at: string | null; delivered_at: string | null;
  proof: string | null; lang: string | null;
  brand: { name: string; color: string | null } | null;
};

const MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function stamp(iso: string | null, fr: boolean) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.getUTCDate();
  const mon = (fr ? MONTHS_FR : MONTHS_EN)[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return fr ? `${day} ${mon} · ${hh} h ${mm}` : `${mon} ${day} · ${hh}:${mm}`;
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const kind = new URL(req.url).searchParams.get("kind") === "pickup" ? "pickup" : "delivered";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await fetch(`${base}/rest/v1/rpc/kolis_card_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_token: params.token }),
    cache: "no-store",
  });
  const p = (await res.json().catch(() => null)) as Card | null;
  if (!p || !p.code) return new Response("not found", { status: 404 });

  const fr = (p.lang ?? "fr") !== "en";
  const picked = kind === "pickup";
  const head1 = "Colis";
  const head2 = picked ? (fr ? "ramassé." : "picked up.") : (fr ? "livré." : "delivered.");
  const eyebrow = `${picked ? (fr ? "RAMASSÉ" : "PICKED UP") : (fr ? "LIVRÉ" : "DELIVERED")} · ${p.code}`;
  const when = stamp(picked ? p.picked_up_at : p.delivered_at, fr);
  const showPhoto = !picked && !!p.proof;
  const accent = p.brand?.color || MAG;

  // Two layouts, on purpose:
  //   delivered → tall card, proof photo front and centre (the photo IS the message)
  //   pickup    → split landscape; there is no photo yet, so a tall card would leave a
  //               hole where the proof goes. Falls back to a code panel on the right.
  const chip = (size: number) => ({
    display: "flex", background: BLACK, color: accent, fontSize: size, fontWeight: 700,
    borderRadius: size / 2.4, padding: `${size / 3}px ${size / 1.6}px`, alignSelf: "flex-start",
  } as const);
  const panel = { display: "flex", flexDirection: "column", background: BLACK, borderRadius: 26, padding: 32 } as const;
  const label = { display: "flex", color: "#96969E", fontSize: 20, fontWeight: 700, letterSpacing: 4 } as const;

  if (picked) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: accent, fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 610, padding: "48px 0 0 56px" }}>
              <div style={chip(34)}>{p.brand?.name || "KOLIS"}</div>
              <div style={{ display: "flex", color: ROSE, fontSize: 22, fontWeight: 700, letterSpacing: 5, marginTop: 26 }}>{eyebrow}</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
                <div style={{ display: "flex", color: "#fff", fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>{head1}</div>
                <div style={{ display: "flex", color: BLACK, fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>{head2}</div>
              </div>
              {p.recipient ? <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 700, marginTop: 16 }}>{fr ? "Pour " : "For "}{p.recipient}</div> : null}
              <div style={{ display: "flex", color: "#fff", fontSize: 30, fontWeight: 700, marginTop: 4 }}>{p.from_city} → {p.to_city}</div>
              <div style={{ ...panel, marginTop: 24, marginRight: 24 }}>
                <div style={label}>{fr ? "RAMASSAGE" : "PICKUP"}</div>
                <div style={{ display: "flex", color: "#fff", fontSize: 32, fontWeight: 800, marginTop: 10 }}>{when || (fr ? "aujourd'hui" : "today")}</div>
                {p.courier ? <div style={{ display: "flex", color: "#E1E1E6", fontSize: 22, marginTop: 8 }}>{fr ? `Pris en charge par ${p.courier}.` : `Collected by ${p.courier}.`}</div> : null}
              </div>
            </div>
            {p.proof
              ? <img src={p.proof} width={470} height={620} style={{ objectFit: "cover" }} />
              : (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: 470, background: BLACK }}>
                  <div style={{ display: "flex", color: "#96969E", fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>{fr ? "SUIVI" : "TRACKING"}</div>
                  <div style={{ display: "flex", color: "#fff", fontSize: 56, fontWeight: 800, marginTop: 10 }}>{p.code}</div>
                  <div style={{ display: "flex", color: accent, fontSize: 24, fontWeight: 700, marginTop: 10 }}>kolis.ca</div>
                </div>
              )}
          </div>
          <div style={{ display: "flex", height: 12 }}>
            {["#00BCAA", "#3CC85A", "#FACC14", "#FA8C28", "#EC3C82"].map((c) => <div key={c} style={{ display: "flex", flex: 1, background: c }} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: BLACK, padding: "20px 0 24px" }}>
            <div style={{ display: "flex", color: "#fff", fontSize: 32, fontWeight: 800 }}>CONCORD EXPRESS CO INC.</div>
            <div style={{ display: "flex", color: "#96969E", fontSize: 22, marginTop: 4 }}>Ottawa, Ontario, Canada · kolis.ca</div>
          </div>
        </div>
      ),
      { width: 1080, height: 760 }
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: accent, padding: "64px 64px 0", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", background: BLACK, color: accent, fontSize: 46, fontWeight: 700, borderRadius: 20, padding: "14px 30px", alignSelf: "flex-start" }}>
          {p.brand?.name || "KOLIS"}
        </div>
        <div style={{ display: "flex", color: ROSE, fontSize: 26, fontWeight: 700, letterSpacing: 6, marginTop: 34 }}>{eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          <div style={{ display: "flex", color: "#fff", fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{head1}</div>
          <div style={{ display: "flex", color: BLACK, fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{head2}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
          {p.recipient ? (
            <div style={{ display: "flex", color: "#fff", fontSize: 38, fontWeight: 700 }}>
              {fr ? "Pour " : "For "}{p.recipient}
            </div>
          ) : null}
          <div style={{ display: "flex", color: "#fff", fontSize: 38, fontWeight: 700 }}>
            {p.from_city} → {p.to_city}
          </div>
        </div>

        {showPhoto ? (
          <img src={p.proof as string} width={952} height={470} style={{ marginTop: 30, borderRadius: 24, objectFit: "cover" }} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", background: BLACK, borderRadius: 30, padding: 36, marginTop: 30 }}>
          <div style={{ display: "flex", color: "#96969E", fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
            {picked ? (fr ? "COLIS PRIS EN CHARGE" : "PARCEL PICKED UP") : (fr ? "CONFIRMATION DE LIVRAISON" : "DELIVERY CONFIRMATION")}
          </div>
          <div style={{ display: "flex", color: "#fff", fontSize: 44, fontWeight: 800, marginTop: 14 }}>
            {when || (fr ? "aujourd'hui" : "today")}
          </div>
          {p.courier ? (
            <div style={{ display: "flex", color: "#E1E1E6", fontSize: 30, marginTop: 12 }}>
              {picked ? (fr ? `Pris en charge par ${p.courier}.` : `Collected by ${p.courier}.`)
                      : (fr ? `Remis par ${p.courier}.` : `Delivered by ${p.courier}.`)}
            </div>
          ) : null}
          <div style={{ display: "flex", color: "#E1E1E6", fontSize: 30, marginTop: 8 }}>
            {fr ? "Merci d'avoir choisi Concord Express." : "Thank you for choosing Concord Express."}
          </div>
        </div>

        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", height: 12, marginLeft: -64, marginRight: -64 }}>
          {["#00BCAA", "#3CC85A", "#FACC14", "#FA8C28", "#EC3C82"].map((c) => (
            <div key={c} style={{ display: "flex", flex: 1, background: c }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: BLACK, marginLeft: -64, marginRight: -64, padding: "26px 0 30px" }}>
          <div style={{ display: "flex", color: "#fff", fontSize: 40, fontWeight: 800 }}>CONCORD EXPRESS CO INC.</div>
          <div style={{ display: "flex", color: "#96969E", fontSize: 26, marginTop: 6 }}>Ottawa, Ontario, Canada · kolis.ca</div>
        </div>
      </div>
    ),
    { width: 1080, height: showPhoto ? 1680 : 1180 }
  );
}
