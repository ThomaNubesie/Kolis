// kolis-notify: Expo push for Kolis parcel events.
//
// POST body: { parcel_id: string, event: "assigned" | "offered" }
//   "assigned" → push the targeted preferred_driver_id (admin sent them a
//                request to accept/decline).
//   "offered"  → push everyone the parcel is available to: LoadQ queue drivers
//                heading to the destination + verified Kolis couriers not
//                currently in a queue.
//
// Push tokens live on kolis_profiles.push_token (couriers) and
// drivers.push_token (LoadQ queue drivers). A user may have both; we dedupe by
// token. Idempotent per (user, parcel) via the alerts unique index.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PushMsg = {
  to: string; title: string; body: string; sound: "default";
  data?: Record<string, unknown>;
  priority?: "high"; channelId?: string; interruptionLevel?: "time-sensitive";
};

// Parcel requests must chime loudly and stay until the courier acts on them:
// high priority + a dedicated high-importance Android channel + iOS time-sensitive.
const URGENT = { priority: "high" as const, channelId: "parcel-requests", interruptionLevel: "time-sensitive" as const };

function bi(en: string, fr: string) { return `${en}\n${fr}`; }

async function tokenFor(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data: kp } = await supabase.from("kolis_profiles").select("push_token").eq("id", userId).maybeSingle();
  const k = (kp as { push_token: string | null } | null)?.push_token;
  if (k) return k;
  const { data: d } = await supabase.from("drivers").select("push_token").eq("id", userId).maybeSingle();
  return (d as { push_token: string | null } | null)?.push_token ?? null;
}

// Insert an alert row (idempotent via alerts (user_id, ref) unique index); only
// queue a push when the row was newly created.
async function recordAndQueue(
  supabase: ReturnType<typeof createClient>,
  userId: string, kind: string, ref: string, title: string, body: string,
  data: Record<string, unknown>, pushQueue: PushMsg[],
) {
  const { data: ins, error } = await supabase
    .from("alerts")
    .upsert({ user_id: userId, kind, ref, title, body }, { onConflict: "user_id,ref", ignoreDuplicates: true })
    .select("id");
  if (error || !ins || ins.length === 0) return;
  const token = await tokenFor(supabase, userId);
  // persistent:true tells the app to keep an ongoing (sticky) notification until tapped.
  if (token) pushQueue.push({ to: token, title, body, sound: "default", data: { ...data, persistent: true }, ...URGENT });
}

async function flushPush(pushQueue: PushMsg[]) {
  for (let i = 0; i < pushQueue.length; i += 100) {
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(pushQueue.slice(i, i + 100)),
      });
    } catch { /* best-effort */ }
  }
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let parcel_id = "", event = "";
  try { ({ parcel_id, event } = await req.json()); } catch { /* ignore */ }
  if (!parcel_id || (event !== "assigned" && event !== "offered")) {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }

  const { data: p } = await supabase
    .from("kolis_parcels")
    .select("id, code, to_city, to_region, dropoff_type, status, driver_id, preferred_driver_id, offer_expires_at, driver_payout_cents")
    .eq("id", parcel_id).maybeSingle();
  if (!p) return new Response(JSON.stringify({ error: "parcel not found" }), { status: 404 });

  const payout = `C$${((p.driver_payout_cents ?? 0) / 100).toFixed(2)}`;
  const pushQueue: PushMsg[] = [];

  if (event === "assigned") {
    if (!p.preferred_driver_id) {
      return new Response(JSON.stringify({ ok: true, note: "no target" }), { headers: { "Content-Type": "application/json" } });
    }
    await recordAndQueue(
      supabase, p.preferred_driver_id, "kolis_assigned",
      `kolis_assigned:${p.id}:${p.offer_expires_at ?? ""}`,
      "New delivery request",
      bi(`Parcel ${p.code} to ${p.to_city} — ${payout}. Open Kolis to accept or decline.`,
         `Colis ${p.code} vers ${p.to_city} — ${payout}. Ouvrez Kolis pour accepter ou refuser.`),
      { type: "kolis_proposal", parcel_id: p.id }, pushQueue,
    );
  } else {
    // "offered": only meaningful while unassigned and not exclusively targeted.
    if (p.driver_id || (p.preferred_driver_id && p.offer_expires_at && new Date(p.offer_expires_at) > new Date())) {
      return new Response(JSON.stringify({ ok: true, note: "not openly offerable" }), { headers: { "Content-Type": "application/json" } });
    }
    const recipients = new Set<string>();
    // LoadQ queue drivers heading to the destination (door needs position >= 2).
    const { data: q } = await supabase
      .from("queue_entries").select("driver_id, position")
      .eq("destination_region", p.to_region).is("end_reason", null);
    for (const r of (q ?? []) as { driver_id: string; position: number | null }[]) {
      if (p.dropoff_type === "hub" || (r.position ?? 1) >= 2) recipients.add(r.driver_id);
    }
    // Verified Kolis couriers not currently in any active queue.
    const { data: couriers } = await supabase
      .from("kolis_profiles").select("id")
      .eq("identity_verified", true).in("role", ["courier", "both"]);
    for (const c of (couriers ?? []) as { id: string }[]) {
      const { data: inq } = await supabase
        .from("queue_entries").select("id").eq("driver_id", c.id).is("end_reason", null).limit(1);
      if (!inq || inq.length === 0) recipients.add(c.id);
    }
    for (const uid of recipients) {
      await recordAndQueue(
        supabase, uid, "kolis_offer", `kolis_offer:${p.id}`,
        "New parcel available",
        bi(`Parcel ${p.code} to ${p.to_city} — ${payout}. Open Kolis to claim it.`,
           `Colis ${p.code} vers ${p.to_city} — ${payout}. Ouvrez Kolis pour le réclamer.`),
        { type: "kolis_offer", parcel_id: p.id }, pushQueue,
      );
    }
  }

  await flushPush(pushQueue);
  return new Response(JSON.stringify({ ok: true, pushed: pushQueue.length }), { headers: { "Content-Type": "application/json" } });
});
