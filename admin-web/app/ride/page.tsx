"use client";
// LoadQ — driver ride-navigation screen (route_pickup passenger rides).
//
// The piece that was missing when ride LQ-46B0D stalled on 2026-09-05: a driver
// could ACCEPT an offer but had no screen to navigate to the passenger, no live
// location, no way to advance the trip. This is that screen — a public web page a
// driver opens on their phone (from the SMS offer link, or bookmarked). It runs on
// the driver's own authenticated Supabase session (same auth as the rest of LoadQ).
//
// Flow  (status in loadq_ride_requests):
//   offer  -> loadq_ride_offer_respond(offer_id, accept)  -> assigned
//   assigned -> loadq_ride_start(req)                      -> en_route      ("On my way")
//   en_route -> loadq_ride_mark_picked_up(req)             -> picked_up     (ping auto-flips <50 m)
//   picked_up -> loadq_ride_complete(req)                  -> completed
//
// Data:
//   loadq_ride_driver_offers()   pending offers for this driver
//   loadq_ride_active()          the assigned ride, full detail + passenger phone (NEW)
//   loadq_ride_driver_ping(...)  pushes live location every 15 s
//
// Themes (light / medium / dark) mirror the tablet sheet and are remembered per
// device. Bilingual FR/EN, FR default (driver base).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Theme = "light" | "medium" | "dark";
type Lang = "fr" | "en";

type Offer = {
  offer_id: string; request_id: string; kind: string;
  pickup_label: string; dest_region: string; dest_address: string | null;
  fare_cents: number; expires_at: string;
};
type Ride = {
  active: boolean; request_id?: string; status?: string; kind?: string;
  seats?: number; fare_cents?: number; off_route_km?: number | string | null;
  payment_method?: string; payment_status?: string;
  pickup_label?: string; pickup_lat?: number | null; pickup_lng?: number | null;
  dest_region?: string; dest_address?: string | null; dest_lat?: number | null; dest_lng?: number | null;
  passenger_name?: string; passenger_phone?: string;
  departure_zone?: string; departure_addr?: string;
};

const DICT: Record<Lang, Record<string, string>> = {
  fr: {
    role: "Chauffeur", online: "LoadQ · en ligne", active: "Course active",
    offerBadge: "RAMASSAGE EN ROUTE", places: "Places", detour: "Détour", gain: "Gain",
    toAccept: "pour accepter", accept: "Accepter la course", decline: "Refuser",
    sAccepted: "Acceptée", sEnroute: "En route", sOnboard: "À bord", sDone: "Terminée",
    pickup: "Ramassage", passenger: "Passager", seat: "place",
    navPickup: "Naviguer vers le ramassage", markOnboard: "Marquer « passager à bord »",
    onMyWay: "Je suis en route", locShared: "Votre position est partagée en direct",
    destination: "Destination", tarif: "Tarif", paid: "PAYÉ", navTo: "Naviguer vers",
    complete: "Terminer la course", noRide: "Aucune course active",
    noRideSub: "Vous verrez ici les offres et votre course en cours.",
    offersTitle: "Offres", signIn: "Connexion requise",
    signInSub: "Ouvrez ce lien depuis votre compte chauffeur LoadQ, ou connectez-vous.",
    signInBtn: "Se connecter", away: "à", km: "km", done: "Course terminée. Merci !",
    refresh: "Actualiser", theme: "Thème", loading: "Chargement…",
  },
  en: {
    role: "Driver", online: "LoadQ · online", active: "Active ride",
    offerBadge: "ON-ROUTE PICKUP", places: "Seats", detour: "Detour", gain: "Earn",
    toAccept: "to accept", accept: "Accept ride", decline: "Decline",
    sAccepted: "Accepted", sEnroute: "En route", sOnboard: "On board", sDone: "Done",
    pickup: "Pickup", passenger: "Passenger", seat: "seat",
    navPickup: "Navigate to pickup", markOnboard: "Mark “passenger on board”",
    onMyWay: "I'm on my way", locShared: "Your location is shared live",
    destination: "Destination", tarif: "Fare", paid: "PAID", navTo: "Navigate to",
    complete: "Complete ride", noRide: "No active ride",
    noRideSub: "Offers and your current ride will appear here.",
    offersTitle: "Offers", signIn: "Sign-in required",
    signInSub: "Open this link from your LoadQ driver account, or sign in.",
    signInBtn: "Sign in", away: "", km: "km", done: "Ride completed. Thank you!",
    refresh: "Refresh", theme: "Theme", loading: "Loading…",
  },
};

// Platform-agnostic maps deep link (Google URL scheme opens the native app on
// iOS + Android and the web map elsewhere).
function mapsUrl(lat?: number | null, lng?: number | null, label?: string) {
  const dest = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(label || "");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLng = (b.lng - a.lng) * d;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const money = (c?: number) => ((c || 0) / 100).toFixed(2).replace(".", ",") + " $";

export default function RidePage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang, setLang] = useState<Lang>("fr");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const t = DICT[lang];

  // remembered prefs
  useEffect(() => {
    try {
      const th = localStorage.getItem("loadq_ride_theme") as Theme | null;
      const lg = localStorage.getItem("loadq_ride_lang") as Lang | null;
      if (th) setTheme(th);
      if (lg) setLang(lg);
    } catch { /* private mode */ }
  }, []);
  const pickTheme = (th: Theme) => { setTheme(th); try { localStorage.setItem("loadq_ride_theme", th); } catch {} };
  const pickLang = (lg: Lang) => { setLang(lg); try { localStorage.setItem("loadq_ride_lang", lg); } catch {} };

  const refresh = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) { setAuthed(false); return; }
    setAuthed(true);
    try {
      const [{ data: rd }, { data: of }] = await Promise.all([
        supabase.rpc("loadq_ride_active"),
        supabase.rpc("loadq_ride_driver_offers"),
      ]);
      setRide((rd as Ride) ?? { active: false });
      setOffers(((of as Offer[]) ?? []));
    } catch (e: any) { setErr(e?.message || "network"); }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 12000); return () => clearInterval(id); }, [refresh]);

  // live location ping while a ride is in progress (also feeds the distance readout)
  const active = ride?.active && ["assigned", "en_route", "picked_up"].includes(ride.status || "");
  const reqId = ride?.request_id;
  useEffect(() => {
    if (!active || !reqId || !navigator.geolocation) return;
    let stop = false;
    const ping = () => {
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          if (stop) return;
          const c = { lat: p.coords.latitude, lng: p.coords.longitude };
          setPos(c);
          try { await supabase.rpc("loadq_ride_driver_ping", { p_request_id: reqId, p_lat: c.lat, p_lng: c.lng }); } catch {}
          refresh();
        },
        () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    };
    ping();
    const id = setInterval(ping, 15000);
    return () => { stop = true; clearInterval(id); };
  }, [active, reqId, refresh]);

  const run = (key: string, fn: () => PromiseLike<any>, ok?: string) => async () => {
    setBusy(key); setErr(null);
    try { await fn(); if (ok) { setFlash(ok); setTimeout(() => setFlash(null), 4000); } await refresh(); }
    catch (e: any) { setErr(e?.message || "error"); }
    setBusy(null);
  };
  const accept = (o: Offer, yes: boolean) => run("o" + o.offer_id, () =>
    supabase.rpc("loadq_ride_offer_respond", { p_offer_id: o.offer_id, p_accept: yes }))();
  const start = run("start", () => supabase.rpc("loadq_ride_start", { p_request_id: reqId }));
  const onboard = run("onboard", () => supabase.rpc("loadq_ride_mark_picked_up", { p_request_id: reqId }));
  const complete = run("done", () => supabase.rpc("loadq_ride_complete", { p_request_id: reqId }), t.done);

  // distance readout to the current target
  const target = ride?.status === "picked_up"
    ? (ride?.dest_lat != null ? { lat: ride.dest_lat!, lng: ride.dest_lng! } : null)
    : (ride?.pickup_lat != null ? { lat: ride!.pickup_lat!, lng: ride!.pickup_lng! } : null);
  const distKm = pos && target ? haversineKm(pos, target) : null;
  const distTxt = distKm != null ? `≈ ${distKm < 10 ? distKm.toFixed(1) : Math.round(distKm)} ${t.km}` : null;

  // completed-step count drives the progress bar: assigned=1, en_route=2, picked_up=3
  const doneCount = ride?.status === "assigned" ? 1 : ride?.status === "en_route" ? 2 : ride?.status === "picked_up" ? 3 : 0;

  return (
    <div className={`page t-${theme}`}>
      <style>{CSS}</style>

      <div className="bar">
        <div className="logo">Load<span>Q</span></div>
        <div className="ctl">
          <button className={`chip ${lang === "fr" ? "on" : ""}`} onClick={() => pickLang("fr")}>FR</button>
          <button className={`chip ${lang === "en" ? "on" : ""}`} onClick={() => pickLang("en")}>EN</button>
          <span className="sep" />
          <button className={`chip ${theme === "light" ? "on" : ""}`} onClick={() => pickTheme("light")}>☀</button>
          <button className={`chip ${theme === "medium" ? "on" : ""}`} onClick={() => pickTheme("medium")}>◐</button>
          <button className={`chip ${theme === "dark" ? "on" : ""}`} onClick={() => pickTheme("dark")}>☾</button>
        </div>
      </div>

      <div className="body">
        {flash && <div className="c flash">✓ {flash}</div>}
        {err && <div className="c errbox">{err}</div>}

        {authed === false && (
          <div className="c center">
            <div className="h1">{t.signIn}</div>
            <div className="sub">{t.signInSub}</div>
            <a className="btn nav" href="/login">{t.signInBtn}</a>
          </div>
        )}

        {authed === null && <div className="c center sub">{t.loading}</div>}

        {authed && (
          <>
            {/* ---- ACTIVE RIDE ---- */}
            {ride?.active && (
              <>
                <div className="steps">
                  {[t.sAccepted, t.sEnroute, t.sOnboard, t.sDone].map((s, i) => {
                    const cls = i < doneCount ? "done" : i === doneCount ? "now" : "";
                    return (
                      <div key={i} className={`step ${cls}`.trim()}>
                        <div className="k">{i < doneCount ? "✓" : i + 1}</div><div className="tl">{s}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="map">
                  <div className="rt" /><div className="me" /><div className="pin" />
                  <div className="eta">📍 {distTxt || t.locShared}</div>
                </div>

                {ride.status !== "picked_up" ? (
                  <>
                    <div className="c">
                      <div className="lbl">{t.pickup}</div>
                      <div className="addr">{ride.pickup_label}</div>
                    </div>
                    {ride.passenger_name && (
                      <div className="c">
                        <div className="pax">
                          <div className="av">{ride.passenger_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
                          <div><div className="nm">{ride.passenger_name}</div>
                            <div className="ph">{t.passenger} · {ride.seats || 1} {t.seat}</div></div>
                          {ride.passenger_phone && <a className="callbtn" href={`tel:${ride.passenger_phone}`}>📞</a>}
                        </div>
                      </div>
                    )}
                    <a className="btn nav" href={mapsUrl(ride.pickup_lat, ride.pickup_lng, ride.pickup_label)} target="_blank" rel="noreferrer">➤ {t.navPickup}</a>
                    <div className="sp" />
                    {ride.status === "assigned"
                      ? <button className="btn sub" disabled={busy === "start"} onClick={start}>{t.onMyWay}</button>
                      : <button className="btn sub" disabled={busy === "onboard"} onClick={onboard}>{t.markOnboard}</button>}
                    <div className="tsub">{t.locShared}</div>
                  </>
                ) : (
                  <>
                    <div className="c">
                      <div className="lbl">{t.destination}</div>
                      <div className="addr">{ride.dest_address || (ride.dest_region ? ride.dest_region[0].toUpperCase() + ride.dest_region.slice(1) : "—")}</div>
                    </div>
                    <div className="c">
                      <div className="fare">
                        <div><div className="lbl" style={{ margin: 0 }}>{t.tarif}</div><div className="big">{money(ride.fare_cents)}</div></div>
                        {ride.payment_status === "paid" &&
                          <span className="pill paid">✓ {t.paid}{ride.payment_method ? " · " + ride.payment_method.toUpperCase() : ""}</span>}
                      </div>
                    </div>
                    <a className="btn nav" href={mapsUrl(ride.dest_lat, ride.dest_lng, ride.dest_address || ride.dest_region)} target="_blank" rel="noreferrer">➤ {t.navTo} {ride.dest_region ? ride.dest_region[0].toUpperCase() + ride.dest_region.slice(1) : ""}</a>
                    <div className="sp" />
                    <button className="btn go" disabled={busy === "done"} onClick={complete}>{t.complete}</button>
                  </>
                )}
              </>
            )}

            {/* ---- OFFERS (when no active ride) ---- */}
            {!ride?.active && offers.length > 0 && (
              <>
                <div className="lbl" style={{ marginLeft: 4 }}>{t.offersTitle} ({offers.length})</div>
                {offers.map((o) => (
                  <div key={o.offer_id} className="c offer">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span className="pill route">● {t.offerBadge}</span>
                    </div>
                    <div className="route-line">
                      <span className="dotA" /><span className="city">{o.pickup_label?.split(",")[0] || t.pickup}</span>
                      <span className="arrow" />
                      <span className="city">{o.dest_region ? o.dest_region[0].toUpperCase() + o.dest_region.slice(1) : ""}</span><span className="dotB" />
                    </div>
                    <div className="meta">
                      <div>{t.gain}<b style={{ color: "var(--green)" }}>+{money(o.fare_cents)}</b></div>
                    </div>
                    <div className="sp" />
                    <button className="btn go" disabled={busy === "o" + o.offer_id} onClick={() => accept(o, true)}>{t.accept}</button>
                    <div className="sp" />
                    <button className="btn sub" disabled={busy === "o" + o.offer_id} onClick={() => accept(o, false)}>{t.decline}</button>
                  </div>
                ))}
              </>
            )}

            {/* ---- EMPTY ---- */}
            {!ride?.active && offers.length === 0 && (
              <div className="c center">
                <div className="h1">{t.noRide}</div>
                <div className="sub">{t.noRideSub}</div>
                <button className="btn sub" onClick={refresh}>{t.refresh}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.page{min-height:100vh;--bg:#0B1220;--card:#131C2E;--ink:#F3F7FF;--sub:#93A4BE;--line:#243149;
  --azure:#0A84FF;--azure2:#3AA0FF;--orange:#FF8A2B;--green:#22C55E;--red:#EF4444;--amber:#F5B301;
  --topband:transparent;--topink:#8698b5;--logoink:#F3F7FF;--map1:#12203a;--map2:#132339;--page:#070C15;
  background:var(--page);color:var(--ink);font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.page.t-light{--bg:#FFFFFF;--card:#F5F7FB;--ink:#0F1930;--sub:#5B6B86;--line:#E0E6F0;--orange:#E06A00;
  --green:#159A47;--amber:#C9860B;--topband:transparent;--topink:#6b7a95;--logoink:#0F1930;--map1:#dbe6f7;--map2:#e8eef8;--page:#E7ECF3}
.page.t-medium{--bg:#FFFFFF;--card:#F5F7FB;--ink:#0F1930;--sub:#5B6B86;--line:#E0E6F0;--orange:#E06A00;
  --green:#159A47;--amber:#C9860B;--topband:#0B0F17;--topink:#C7D3E6;--logoink:#FFFFFF;--map1:#dbe6f7;--map2:#e8eef8;--page:#D7DEE9}
.page *{box-sizing:border-box}
.bar{background:var(--topband);display:flex;align-items:center;padding:14px 18px 12px}
.logo{font-size:22px;font-weight:800;color:var(--logoink);letter-spacing:-.5px}
.logo span{color:var(--orange)}
.ctl{margin-left:auto;display:flex;align-items:center;gap:5px}
.chip{border:1px solid var(--line);background:transparent;color:var(--sub);border-radius:16px;font-size:12px;font-weight:800;padding:5px 9px;cursor:pointer}
.chip.on{background:var(--azure);border-color:var(--azure);color:#fff}
.sep{width:1px;height:18px;background:var(--line);margin:0 3px}
.body{max-width:440px;margin:0 auto;padding:8px 16px 40px}
.c{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:12px}
.flash{border-color:rgba(34,197,94,.4);color:var(--green);font-weight:800;text-align:center}
.errbox{border-color:rgba(239,68,68,.4);color:var(--red);font-weight:700;font-size:13px}
.center{text-align:center}
.h1{font-size:19px;font-weight:800;margin-bottom:6px}
.sub{font-size:13px;color:var(--sub);margin-bottom:14px;line-height:1.4}
.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--sub);font-weight:800;margin-bottom:6px}
.addr{font-size:16px;color:var(--ink);font-weight:700;line-height:1.35}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;padding:5px 11px;border-radius:20px;letter-spacing:.3px}
.pill.route{background:rgba(10,132,255,.14);color:var(--azure2);border:1px solid rgba(10,132,255,.32)}
.pill.paid{background:rgba(34,197,94,.14);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.route-line{display:flex;align-items:center;gap:10px;margin:10px 0 4px}
.route-line .city{font-size:20px;font-weight:800;color:var(--ink)}
.arrow{flex:1;height:2px;background:linear-gradient(90deg,var(--line),var(--azure2));position:relative;border-radius:2px}
.arrow:after{content:'';position:absolute;right:-1px;top:-4px;border-left:9px solid var(--azure2);border-top:5px solid transparent;border-bottom:5px solid transparent}
.dotA,.dotB{width:11px;height:11px;border-radius:50%;flex:none}.dotA{background:var(--azure)}.dotB{background:var(--orange)}
.meta{display:flex;gap:16px;margin-top:12px}
.meta div{font-size:12px;color:var(--sub)}.meta b{display:block;color:var(--ink);font-size:16px;font-weight:800;margin-top:2px}
.btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;border:none;border-radius:14px;font-size:16px;font-weight:800;padding:16px;color:#fff;cursor:pointer;letter-spacing:.2px;text-decoration:none}
.btn:disabled{opacity:.55}
.btn.nav{background:linear-gradient(180deg,var(--azure2),var(--azure));box-shadow:0 8px 18px rgba(10,132,255,.3)}
.btn.go{background:linear-gradient(180deg,#2fd06e,var(--green));box-shadow:0 8px 18px rgba(34,197,94,.26)}
.btn.sub{background:transparent;border:1.5px solid var(--line);color:var(--sub);font-size:14px;padding:13px}
.sp{height:10px}
.tsub{font-size:12px;color:var(--sub);text-align:center;margin-top:9px}
.pax{display:flex;align-items:center;gap:12px}
.av{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#33507f,#1d2c47);display:flex;align-items:center;justify-content:center;font-weight:800;color:#cfe0ff;font-size:16px;flex:none}
.pax .nm{font-size:16px;font-weight:800;color:var(--ink)}.pax .ph{font-size:12px;color:var(--sub);margin-top:1px}
.callbtn{margin-left:auto;width:44px;height:44px;border-radius:50%;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.34);display:flex;align-items:center;justify-content:center;font-size:18px;text-decoration:none}
.steps{display:flex;margin:4px 2px 14px}
.step{flex:1;text-align:center;position:relative}
.step .k{width:22px;height:22px;border-radius:50%;background:var(--line);color:var(--sub);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 5px;border:2px solid var(--line);position:relative;z-index:1}
.step.done .k{background:var(--green);color:#fff;border-color:var(--green)}
.step.now .k{background:var(--azure);color:#fff;border-color:var(--azure);box-shadow:0 0 0 4px rgba(10,132,255,.18)}
.step.now .tl{color:var(--ink)}
.step .tl{font-size:10px;font-weight:700;color:var(--sub)}
.step:not(:first-child):before{content:'';position:absolute;left:-50%;top:11px;width:100%;height:2px;background:var(--line);z-index:0}
.step.done:before,.step.now:before{background:var(--green)}
.map{height:120px;border-radius:16px;margin-bottom:12px;position:relative;overflow:hidden;border:1px solid var(--line);
  background:radial-gradient(circle at 30% 42%,rgba(10,132,255,.2),transparent 60%),repeating-linear-gradient(58deg,var(--map1) 0 22px,var(--map2) 22px 44px),var(--map2)}
.map .rt{position:absolute;left:14%;top:70%;width:66%;height:3px;background:var(--azure);transform:rotate(-22deg);box-shadow:0 0 8px rgba(10,132,255,.5);border-radius:3px}
.map .me{position:absolute;left:16%;top:74%;width:14px;height:14px;border-radius:50%;background:var(--azure);border:3px solid #fff;box-shadow:0 0 0 6px rgba(10,132,255,.2)}
.map .pin{position:absolute;right:16%;top:30%;width:13px;height:13px;border-radius:50% 50% 50% 0;background:var(--orange);transform:rotate(-45deg);border:2px solid #fff}
.map .eta{position:absolute;right:12px;bottom:10px;background:rgba(0,0,0,.55);color:#fff;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:800}
.t-light .map .eta,.t-medium .map .eta{background:rgba(255,255,255,.92);color:var(--ink);border:1px solid var(--line)}
.fare{display:flex;justify-content:space-between;align-items:center}
.fare .big{font-size:24px;font-weight:800;color:var(--ink)}
`;
