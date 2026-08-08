// Unattended proof-of-delivery. The assigned courier (only gate — NO geofence)
// submits 3 photos (door+unit / side / building) + notes after a no-answer
// delivery. Marks the parcel delivered, captures payment (best-effort via
// kolis-finalize-payment), and emails + SMSes the pink Kolis proof card to the
// sender and recipient.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const ADMIN_EMAIL = Deno.env.get("KOLIS_ADMIN_EMAIL") || "support@concordexpress.ca";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const PINK = "#E6127A";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sms(to: string | null | undefined, body: string) {
  if (!TW_SID || !TW_TOKEN || !TW_FROM || !to) return;
  let n = String(to).replace(/[^\d+]/g, ""); if (!n.startsWith("+")) n = n.length === 10 ? "+1" + n : "+" + n;
  const f = new URLSearchParams({ To: n, Body: body }); TW_FROM.startsWith("MG") ? f.set("MessagingServiceSid", TW_FROM) : f.set("From", TW_FROM);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: f.toString() }).catch(() => {});
}
async function email(to: string | null | undefined, subject: string, html: string) {
  if (!RESEND || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, html }) }).catch(() => {});
}

function pinkCard(p: any, proof: any, courier: string, whenStr: string): string {
  const unit = proof.unit ? esc(String(proof.unit)) : null;
  const leftAt = unit ? `left at Unit ${unit}` : "left at the door";
  const noteLine = proof.notes ? esc(proof.notes) : "called, no answer";
  const thumb = (u: string) => u ? `<td width=\"50%\" style=\"padding:4px\"><img src=\"${u}\" width=\"100%\" style=\"display:block;height:96px;object-fit:cover;border-radius:9px;border:2px solid #0A0A0A\"/></td>` : "";
  return `<div style=\"max-width:480px;margin:0 auto;background:${PINK};color:#fff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif\">
   <div style=\"padding:26px 22px 30px\">
    <div style=\"display:inline-block;background:#0A0A0A;color:#fff;font-weight:900;font-size:14px;letter-spacing:.5px;padding:8px 14px;border-radius:10px\">KOLIS</div>
    <div style=\"font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.9);font-size:11px;margin-top:22px\">Delivery &middot; ${esc(p.code)}</div>
    <div style=\"color:#0A0A0A;font-size:42px;font-weight:900;line-height:1.03;margin-top:6px\">Delivered to<br>your door.</div>
    <div style=\"color:#fff;font-size:16px;line-height:1.45;margin-top:12px\">We called several times &mdash; no answer. Your courier left it <b>safely at your door</b> and photographed it.</div>
    <div style=\"background:#0A0A0A;border-radius:14px;padding:18px;margin-top:20px\">
      <div style=\"font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1.4px;color:#8A978F;font-size:11px;font-weight:700\">Delivered &middot; ${esc(whenStr)}</div>
      <div style=\"margin-top:7px\"><span style=\"color:${PINK};font-weight:900;font-size:20px\">${esc(p.code)}</span> <span style=\"color:#fff;font-weight:800;font-size:18px\">${esc(p.from_city || "")} &rarr; ${esc(p.to_city || "")}</span></div>
      <div style=\"color:#fff;font-size:14px;margin-top:8px;line-height:1.4\">${esc(p.dropoff_addr || p.to_city || "")} &mdash; ${leftAt}.</div>
      <div style=\"color:#fff;font-size:14px;margin-top:4px\">Courier: ${esc(courier)} &middot; ${noteLine}.</div>
    </div>
    <div style=\"font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:2px;color:#fff;font-size:13px;font-weight:800;margin-top:24px\">Proof of delivery</div>
    <img src=\"${proof.door_url}\" width=\"100%\" style=\"display:block;border-radius:12px;margin-top:10px;border:2px solid #0A0A0A\"/>
    <div style=\"background:#0A0A0A;color:#fff;font-size:12px;font-weight:800;padding:6px 10px;border-radius:7px;margin-top:-30px;display:inline-block;margin-left:8px;position:relative\">Left at your door${unit ? ` &middot; Unit ${unit}` : ""}</div>
    <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:14px\"><tr>${thumb(proof.side_url)}${thumb(proof.building_url)}</tr></table>
   </div>
   <div style=\"height:5px;background:linear-gradient(90deg,#2EC5E6,#22C083,#F5C842,#FF8A3D,${PINK},#8B5CF6)\"></div>
   <div style=\"background:#0A0A0A;padding:20px 22px 20px;text-align:center\">
     <div style=\"color:#fff;font-weight:900;font-size:16px;letter-spacing:.3px\">CONCORD EXPRESS CO INC.</div>
     <div style=\"color:#8A978F;font-size:12px;margin-top:4px\">Ottawa, Ontario, Canada &middot; kolis.ca</div>
   </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { parcel_id, door_url, side_url, building_url, notes, unit, lat, lng } = await req.json();
    if (!parcel_id || !door_url) return json({ error: "bad_request" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, code, driver_id, status, delivery_code, from_city, to_city, org_id, sender_id, recipient_name, recipient_phone, recipient_email, dropoff_addr, external_driver_name").eq("id", parcel_id).maybeSingle();
    if (!p) return json({ error: "not_found" }, 404);

    // Only the assigned courier may submit proof (the sole gate — NO geofence).
    let ok = p.driver_id === user.id;
    if (!ok && p.driver_id) {
      const { data: kp } = await admin.from("kolis_profiles").select("id").eq("id", p.driver_id).eq("loadq_driver_id", user.id).maybeSingle();
      ok = !!kp;
    }
    if (!ok) return json({ error: "not_your_parcel" }, 403);

    // Courier display name
    let courier = p.external_driver_name || "Your courier";
    try { const { data: prof } = await admin.from("kolis_profiles").select("full_name").eq("id", p.driver_id).maybeSingle(); if (prof?.full_name) courier = prof.full_name; } catch { /* */ }
    try { const { data: dr } = await admin.from("drivers").select("full_name").eq("id", user.id).maybeSingle(); if (dr?.full_name) courier = dr.full_name; } catch { /* */ }

    const proof = { door_url, side_url: side_url || null, building_url: building_url || null, notes: notes || null, unit: unit || null, courier, captured_at: new Date().toISOString(), lat: lat ?? null, lng: lng ?? null };
    await admin.from("kolis_parcels").update({
      delivery_proof: proof, status: "delivered", delivered_at: new Date().toISOString(),
      delivered_lat: lat ?? null, delivered_lng: lng ?? null,
    }).eq("id", p.id);

    // Capture payment via the existing finalize path (best-effort, forwards courier auth).
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/kolis-finalize-payment`, {
        method: "POST", headers: { Authorization: authHeader, apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ parcel_id: p.id, action: "deliver", code: p.delivery_code }),
      });
    } catch { /* delivered regardless; dispatch reconciles payment */ }

    // Sender contact
    let senderEmail: string | null = null, senderPhone: string | null = null;
    if (p.org_id) { const { data: o } = await admin.from("kolis_orgs").select("billing_email").eq("id", p.org_id).maybeSingle(); senderEmail = o?.billing_email ?? null; }
    if (p.sender_id) { try { const { data: au } = await admin.auth.admin.getUserById(p.sender_id as string); senderEmail = senderEmail || au?.user?.email || null; senderPhone = au?.user?.phone ?? null; } catch { /* */ } }

    const whenStr = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const html = pinkCard(p, proof, courier, whenStr);
    const subject = `Kolis ${p.code} — delivered to your door`;
    email(p.recipient_email as string, subject, html);
    email(senderEmail, subject, html);
    email(ADMIN_EMAIL, subject, html);

    const unitTxt = unit ? ` at Unit ${unit}` : "";
    const smsBody = `Kolis ${p.code}: delivered to your door${unitTxt} (no answer). Photo proof: ${door_url}`;
    sms(p.recipient_phone as string, smsBody);
    sms(senderPhone, smsBody);

    return json({ ok: true, delivered: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
