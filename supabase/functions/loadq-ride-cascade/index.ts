// loadq-ride-cascade — 1-minute dispatch tick.
//   1. Expire stale offers (loadq_ride_offers_expire).
//   2. On-demand: re-call loadq-ride-dispatch for requests needing the next
//      front-most eligible driver.
//   3. Route-pickup: offer the front-most queued driver at the matched departure
//      zone heading to the destination (cascading to the next untried driver).
// Neither a decline nor an expiry advances the cascade on its own, so this tick
// is what keeps the offer loop moving. Gated by x-kolis-secret (cron only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const RESOLVED = ["assigned", "en_route", "picked_up", "completed", "cancelled", "expired"];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// SMS the driver that a request is waiting (best-effort, in addition to push).
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
async function sms(driverId: string, body: string) {
  try {
    if (!TW_SID || !TW_TOKEN || !TW_FROM) return;
    const { data: d } = await admin.from("drivers").select("phone").eq("id", driverId).maybeSingle();
    let to = d?.phone ? String(d.phone).replace(/[^\d+]/g, "") : ""; if (!to) return;
    if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
    const f = new URLSearchParams({ To: to, Body: body }); TW_FROM.startsWith("MG") ? f.set("MessagingServiceSid", TW_FROM) : f.set("From", TW_FROM);
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: f.toString() }).catch(() => {});
  } catch { /* best-effort */ }
}

// Ops alert to a raw number (the driver-keyed sms() above cannot reach a non-driver).
async function smsTo(phone: string, body: string) {
  try {
    if (!TW_SID || !TW_TOKEN || !TW_FROM) return false;
    let to = String(phone || "").replace(/[^\d+]/g, ""); if (!to) return false;
    if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
    const f = new URLSearchParams({ To: to, Body: body });
    TW_FROM.startsWith("MG") ? f.set("MessagingServiceSid", TW_FROM) : f.set("From", TW_FROM);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: f.toString(),
    });
    return r.ok;
  } catch { return false; }
}

// Push to an Expo token (best-effort). data.route deep-links on tap.
async function pushTok(token: string, title: string, body: string, route: string) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default", data: { route } }) }).catch(() => {});
  } catch { /* best-effort */ }
}
function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "forbidden" }, 403);
  try {
    // Only offer to queue drivers at this position or further back (protect front loaders).
    const { data: mp } = await admin.from("loadq_settings").select("value").eq("key", "dispatch_min_position").maybeSingle();
    const MIN_POS = mp?.value ? parseInt(String(mp.value), 10) : 6;

    // The floor protects the front of the queue — those drivers are about to load a full car
    // and should not be pulled out for one passenger. With 20 cars queued that costs nothing.
    // With 4 it excludes everybody and the request sits unoffered while drivers wait: Chris
    // Therrier's pickup (5 Sept) reached nobody for four hours because an eligible driver had
    // to be at position 6 or worse. So never fence off more than half the queue.
    const floorFor = (n: number) => Math.max(1, Math.min(MIN_POS, Math.floor(n / 2) + 1));

    // 1. Expire stale offers.
    const { data: expired } = await admin.rpc("loadq_ride_offers_expire");

    // 2. Re-dispatch on-demand requests that need the next offer.
    const { data: reqs } = await admin
      .from("loadq_ride_requests")
      .select("id, kind, status, payment_method, payment_status")
      .eq("kind", "on_demand");

    let dispatched = 0, skipped = 0;
    const now = Date.now();
    for (const r of reqs ?? []) {
      if (RESOLVED.includes(r.status)) { skipped++; continue; }
      if ((r.payment_method === "interac" || r.payment_method === "card") && r.payment_status !== "paid") { skipped++; continue; }
      const { data: offers } = await admin
        .from("loadq_ride_offers").select("status, expires_at").eq("request_id", r.id);
      const hasLive = (offers ?? []).some((o: any) => o.status === "offered" && new Date(o.expires_at).getTime() > now);
      if (hasLive) { skipped++; continue; }
      await fetch(`${URL}/functions/v1/loadq-ride-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kolis-secret": SECRET },
        body: JSON.stringify({ request_id: r.id }),
      }).catch(() => {});
      dispatched++;
    }

    // 3. Route-pickup: offer the front-most queued driver at the matched zone
    //    heading to the destination; cascade to the next untried driver.
    const { data: rp } = await admin
      .from("loadq_ride_requests")
      .select("id, status, dest_region, departure_zone_id, payment_method, payment_status")
      .eq("kind", "route_pickup");
    let offered = 0;
    for (const r of rp ?? []) {
      if (RESOLVED.includes(r.status)) { skipped++; continue; }
      if (!r.departure_zone_id) { skipped++; continue; }              // not quoted/matched yet
      if (r.payment_method === "interac" && r.payment_status !== "paid") { skipped++; continue; }
      const { data: offers } = await admin
        .from("loadq_ride_offers").select("driver_id, status, expires_at").eq("request_id", r.id);
      if ((offers ?? []).some((o: any) => o.status === "offered" && new Date(o.expires_at).getTime() > now)) { skipped++; continue; }
      const tried = new Set((offers ?? []).map((o: any) => o.driver_id));
      const { data: q } = await admin
        .from("queue_entries").select("driver_id, position, status")
        .eq("zone_id", r.departure_zone_id).eq("destination_region", r.dest_region)
        .in("status", ["loading", "waiting", "standby"]).order("position");
      const floor = floorFor((q ?? []).length);
      const next = (q ?? []).find((e: any) => e.position >= floor && !tried.has(e.driver_id));
      if (!next) { skipped++; continue; }                            // no eligible/untried driver at/behind the floor
      // 60s was half what an on-demand ride allows, for no reason: three drivers in a row
      // missed Chris Therrier's offer inside the minute. Matched to on-demand.
      await admin.rpc("loadq_ride_offer_next", { p_request_id: r.id, p_driver_id: next.driver_id, p_rank: next.position, p_window_seconds: 120 });
      await sms(next.driver_id, "LoadQ: new on-route pickup request on your way. Open LoadQ to accept (2 min).");
      offered++;
    }

    // 3b. Scheduled door-to-door: on/after its day, offer unclaimed PAID trips to
    //     queue drivers heading to the destination (cascades to the next driver).
    let offeredScheduled = 0;
    const today = new Date().toISOString().slice(0, 10);
    const { data: sched } = await admin
      .from("loadq_ride_requests")
      .select("id, status, dest_region, departure_zone_id, payment_status, scheduled_date")
      .eq("kind", "scheduled").is("driver_id", null).eq("payment_status", "paid");
    for (const r of sched ?? []) {
      if (RESOLVED.includes(r.status)) { skipped++; continue; }
      if (!r.scheduled_date || r.scheduled_date > today) { skipped++; continue; } // not its day yet
      if (!r.departure_zone_id) { skipped++; continue; }
      const { data: offers } = await admin
        .from("loadq_ride_offers").select("driver_id, status, expires_at").eq("request_id", r.id);
      if ((offers ?? []).some((o: any) => o.status === "offered" && new Date(o.expires_at).getTime() > now)) { skipped++; continue; }
      const tried = new Set((offers ?? []).map((o: any) => o.driver_id));
      const { data: q } = await admin
        .from("queue_entries").select("driver_id, position, status")
        .eq("zone_id", r.departure_zone_id).eq("destination_region", r.dest_region)
        .in("status", ["loading", "waiting", "standby"]).order("position");
      const floor = floorFor((q ?? []).length);
      const next = (q ?? []).find((e: any) => e.position >= floor && !tried.has(e.driver_id));
      if (!next) { skipped++; continue; }
      await admin.rpc("loadq_ride_offer_next", { p_request_id: r.id, p_driver_id: next.driver_id, p_rank: next.position, p_window_seconds: 120 });
      await sms(next.driver_id, "LoadQ: a scheduled door-to-door trip is available today. Open LoadQ to accept (2 min).");
      offeredScheduled++;
    }

    // 3c. Scheduled door-to-door: broadcast a newly-paid, unassigned trip to all
    //     ON-DUTY feeder drivers (origin-region first by distance, else all) — Uber-style,
    //     first-accept wins. Also send the rider a "paid, finding a driver" notice.
    let broadcasts = 0;
    const { data: fresh } = await admin
      .from("loadq_ride_requests")
      .select("id, departure_zone_id")
      .eq("kind", "scheduled").eq("payment_status", "paid").is("driver_id", null).is("broadcast_at", null)
      .not("status", "in", "(cancelled,expired,completed)");
    if ((fresh ?? []).length) {
      const { data: duty } = await admin.from("loadq_pickup_drivers").select("driver_id, lat, lng").eq("on_duty", true);
      const ids = (duty ?? []).map((d: any) => d.driver_id);
      const { data: drv } = ids.length ? await admin.from("drivers").select("id, push_token").in("id", ids) : { data: [] as any[] };
      const tokById: Record<string, string> = {}; (drv ?? []).forEach((d: any) => { if (d.push_token) tokById[d.id] = d.push_token; });
      for (const r of fresh ?? []) {
        const { data: z } = await admin.from("zones").select("latitude,longitude").eq("id", r.departure_zone_id).maybeSingle();
        let targets = (duty ?? []);
        if (z?.latitude != null) {
          const near = targets.filter((d: any) => d.lat != null && distM(z.latitude, z.longitude, d.lat, d.lng) <= 60000);
          if (near.length) targets = near; // origin-region first (≤60km), else all on-duty
        }
        for (const d of targets) { const tok = tokById[d.driver_id]; if (tok) await pushTok(tok, "LoadQ — new trip", "A door-to-door trip is available. Tap to accept.", "/(app)/scheduled"); }
        await admin.from("loadq_ride_requests").update({ broadcast_at: new Date().toISOString() }).eq("id", r.id);
        await fetch(`${URL}/functions/v1/loadq-scheduled-notify`, { method: "POST", headers: { "Content-Type": "application/json", "x-kolis-secret": SECRET }, body: JSON.stringify({ request_id: r.id, event: "paid" }) }).catch(() => {});
        broadcasts++;
      }
    }

    // 4. Card holds: capture the fare on completed rides, release it on
    //    cancelled/expired ones. Idempotent — 'paid' means held-not-resolved;
    //    the card fn flips it to 'captured'/'released' so this won't re-run.
    const { data: cardRides } = await admin
      .from("loadq_ride_requests")
      .select("id, status, payment_method, payment_status, stripe_pi_id")
      .eq("payment_method", "card").not("stripe_pi_id", "is", null).eq("payment_status", "paid");
    let captured = 0, released = 0;
    for (const r of cardRides ?? []) {
      const act = r.status === "completed" ? "capture"
        : (["cancelled", "expired"].includes(r.status) ? "release" : null);
      if (!act) continue;
      await fetch(`${URL}/functions/v1/loadq-ride-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kolis-secret": SECRET },
        body: JSON.stringify({ action: act, request_id: r.id }),
      }).catch(() => {});
      if (act === "capture") captured++; else released++;
    }

    // 4. Stall watchdog. An ACCEPTED ride leaves the cascade entirely — nothing here would
    //    ever look at it again. Chris Therrier's sat `assigned` and motionless for six days
    //    and no one was told. loadq_ride_stalled() returns accepted rides that never started;
    //    stall_alerted_at makes it fire once per ride, not once a minute.
    let stalls = 0;
    try {
      const { data: stalled } = await admin.rpc("loadq_ride_stalled");
      if ((stalled ?? []).length) {
        const { data: opsRow } = await admin.from("loadq_settings")
          .select("value").eq("key", "ops_alert_phone").maybeSingle();
        const ops = opsRow?.value || "";
        for (const st of stalled ?? []) {
          const body = `LoadQ ⚠ ride ${st.code} accepted ${st.minutes} min ago and still not started.\n`
            + `Driver: ${st.driver || "?"} ${st.phone || ""}\n`
            + `Passenger: ${st.passenger || "?"}\n`
            + `Pickup: ${st.pickup_label || "?"}`;
          if (ops) await smsTo(ops, body);
          // Tell the driver too — most stalls are someone who accepted and got distracted.
          if (st.driver_id) await sms(st.driver_id, `LoadQ: you accepted a pickup ${st.minutes} min ago and have not started it. Open LoadQ to continue, or call 613-862-2639 if you cannot take it.`);
          await admin.from("loadq_ride_requests")
            .update({ stall_alerted_at: new Date().toISOString() }).eq("id", st.id);
          stalls++;
        }
      }
    } catch { /* the watchdog must never break dispatch */ }


    return json({ ok: true, expired: expired ?? 0, dispatched, offered, offeredScheduled, broadcasts, captured, released, stalls, skipped });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
