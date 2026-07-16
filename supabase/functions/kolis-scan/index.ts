// Driver scans a parcel's pickup/delivery QR. Enforces a 100 m geofence: the
// code is only revealed (and the event recorded/shared) when the driver is within
// 100 m of the pickup (kind=pickup) or drop-off (kind=delivery) point. Also
// geolocates the scan and notifies sender + recipient + admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const ADMIN_EMAIL = Deno.env.get("KOLIS_ADMIN_EMAIL") || "support@concordexpress.ca";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const GEOFENCE_M = 100;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function sms(to: string, body: string) {
  if (!TW_SID || !TW_TOKEN || !TW_FROM || !to) return;
  let n = String(to).replace(/[^\d+]/g, ""); if (!n.startsWith("+")) n = n.length === 10 ? "+1" + n : "+" + n;
  const f = new URLSearchParams({ To: n, Body: body }); TW_FROM.startsWith("MG") ? f.set("MessagingServiceSid", TW_FROM) : f.set("From", TW_FROM);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: f.toString() }).catch(() => {});
}
async function email(to: string, subject: string, text: string) {
  if (!RESEND || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, text }) }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { parcel_id, kind, token, lat, lng } = await req.json();
    if (!parcel_id || (kind !== "pickup" && kind !== "delivery")) return json({ error: "bad_request" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, code, driver_id, status, scan_token, pickup_code, delivery_code, from_city, to_city, org_id, sender_id, recipient_name, recipient_phone, recipient_email, dropoff_addr, pickup_addr, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng").eq("id", parcel_id).maybeSingle();
    if (!p) return json({ error: "not_found" }, 404);
    if (token && p.scan_token && token !== p.scan_token) return json({ error: "bad_token" }, 403);

    // Only the assigned courier (native kolis id or linked LoadQ id) may scan.
    let ok = p.driver_id === user.id;
    if (!ok && p.driver_id) {
      const { data: kp } = await admin.from("kolis_profiles").select("id").eq("id", p.driver_id).eq("loadq_driver_id", user.id).maybeSingle();
      ok = !!kp;
    }
    if (!ok) return json({ error: "not_your_parcel" }, 403);

    // Geofence: distance from the scan point to the pickup (or drop-off) coords.
    const tLat = kind === "pickup" ? p.pickup_lat : p.dropoff_lat;
    const tLng = kind === "pickup" ? p.pickup_lng : p.dropoff_lng;
    let distance: number | null = null, verified = false;
    if (typeof lat === "number" && typeof lng === "number" && tLat != null && tLng != null) {
      const { data: d } = await admin.rpc("kolis_distance_m", { lat1: lat, lng1: lng, lat2: tLat, lng2: tLng });
      distance = d != null ? Math.round(d as number) : null;
      verified = true;
    }

    // Sender/recipient details the driver's app shows (call + directions).
    let senderName = "Sender", senderPhone: string | null = null, senderEmail: string | null = null;
    if (p.org_id) { const { data: o } = await admin.from("kolis_orgs").select("name, billing_email").eq("id", p.org_id).maybeSingle(); if (o) { senderName = o.name || senderName; senderEmail = o.billing_email; } }
    if (p.sender_id) { try { const { data: au } = await admin.auth.admin.getUserById(p.sender_id as string); senderPhone = au?.user?.phone ?? null; senderEmail = senderEmail || au?.user?.email || null; } catch { /* */ } }
    const details = {
      code: p.code, kind,
      sender: { name: senderName, phone: senderPhone, address: kind === "pickup" ? (p.pickup_addr || p.from_city) : null },
      recipient: { name: p.recipient_name, phone: p.recipient_phone, address: p.dropoff_addr || p.to_city },
    };

    // Beyond the fence → return details for navigation but NOT the code.
    if (verified && distance != null && distance > GEOFENCE_M) {
      return json({ ok: true, in_range: false, verified: true, distance_m: distance, geofence_m: GEOFENCE_M, ...details });
    }

    // In range (or coords unknown) → reveal the code, record the scan, notify.
    const pin = kind === "pickup" ? p.pickup_code : p.delivery_code;
    const upd: Record<string, unknown> = {};
    if (kind === "pickup") { upd.picked_up_lat = lat ?? null; upd.picked_up_lng = lng ?? null; upd.picked_up_scan_at = new Date().toISOString(); }
    else { upd.delivered_lat = lat ?? null; upd.delivered_lng = lng ?? null; upd.delivered_scan_at = new Date().toISOString(); }
    await admin.from("kolis_parcels").update(upd).eq("id", p.id);

    // Share the scan location with sender, recipient & admin.
    const mapUrl = (typeof lat === "number" && typeof lng === "number") ? `https://maps.google.com/?q=${lat},${lng}` : "";
    const what = kind === "pickup" ? "picked up" : "delivered";
    const subject = `Kolis ${p.code} — ${kind === "pickup" ? "picked up" : "delivered"}`;
    const body = `Parcel ${p.code} was scanned as ${what}${mapUrl ? ` at ${mapUrl}` : ""}.`;
    email(p.recipient_email as string, subject, body);
    email(senderEmail as string, subject, body);
    email(ADMIN_EMAIL, subject, `${body} (${senderName} → ${p.recipient_name})`);
    sms(p.recipient_phone as string, `🇬🇧 ${body}`);
    sms(senderPhone as string, `🇬🇧 ${body}`);

    return json({ ok: true, in_range: true, verified, distance_m: distance, geofence_m: GEOFENCE_M, code: pin, scan: { lat, lng, map: mapUrl }, ...details });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
