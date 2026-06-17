// Notifies the parcel RECIPIENT (not the courier) on key status changes, with a
// branded tracking link. Called by a DB trigger on kolis_parcels status change.
// Email via Resend (always); SMS via Twilio when KOLIS_TWILIO_* secrets are set.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const TRACK_URL = Deno.env.get("KOLIS_TRACK_URL") || "https://business.kolis.ca/track";
const SECRET = "kolis_notify_9f3a2c7b1e6d4084"; // shared with the DB trigger
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID");
const TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
const TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function copyFor(status: string, code: string, city: string, pin: string | null) {
  // The recipient must give this PIN to the courier to confirm delivery.
  const pinEn = pin ? ` Your delivery code is ${pin} — give it to your courier to confirm delivery.` : "";
  const pinFr = pin ? ` Votre code de livraison est ${pin} — donnez-le à votre livreur pour confirmer la livraison.` : "";
  // [subject, line] bilingual (EN \n FR)
  if (status === "picked_up")
    return [`Your parcel ${code} is on its way`, `Your parcel ${code} has been picked up and is on its way to ${city}.${pinEn}\nVotre colis ${code} a été ramassé et est en route vers ${city}.${pinFr}`];
  if (status === "in_transit")
    return [`Your parcel ${code} is out for delivery`, `Your parcel ${code} is out for delivery in ${city}.${pinEn}\nVotre colis ${code} est en cours de livraison à ${city}.${pinFr}`];
  return [`Your parcel ${code} has been delivered`, `Your parcel ${code} has been delivered. Thank you for using Kolis!\nVotre colis ${code} a été livré. Merci d'utiliser Kolis!`];
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "forbidden" }, 403);
    const { parcel_id, status } = await req.json();
    if (!parcel_id || !status) return json({ error: "parcel_id and status required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: p } = await admin.from("kolis_parcels")
      .select("code, to_city, recipient_email, recipient_phone, status, delivery_code, org_id").eq("id", parcel_id).maybeSingle();
    if (!p) return json({ error: "not found" }, 404);

    const code = p.code as string;
    // Include the delivery PIN before arrival (picked_up / in_transit), not after.
    const pin = status === "delivered" ? null : (p.delivery_code as string | null);
    const link = `${TRACK_URL}/${encodeURIComponent(code)}`;
    const [subject, line] = copyFor(status, code, (p.to_city as string) || "", pin);
    const [enLine, frLine] = line.split("\n");
    let emailed = false, texted = false;

    // White-label: if this parcel belongs to a business with email branding on,
    // wear their name/color/logo; otherwise plain Kolis.
    let bColor = "#E11D6B", bName = "Kolis", bLogo: string | null = null, bPowered = true;
    if (p.org_id) {
      const { data: o } = await admin.from("kolis_orgs")
        .select("name, brand_color, brand_name, brand_logo_url, brand_emails, brand_powered_by").eq("id", p.org_id).maybeSingle();
      if (o && o.brand_emails) { bColor = o.brand_color || "#E11D6B"; bName = o.brand_name || o.name || "Kolis"; bLogo = o.brand_logo_url; bPowered = o.brand_powered_by !== false; }
    }
    const fromEmail = (FROM.match(/<(.+)>/)?.[1]) || FROM;
    const fromName = bName === "Kolis" ? "Kolis" : `${bName} via Kolis`;

    if (p.recipient_email && RESEND) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`, to: p.recipient_email, subject,
          text: `${enLine}\n\nTrack it: ${link}\n\n${frLine}\nSuivez-le : ${link}`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">
            ${bLogo ? `<img src="${bLogo}" alt="${bName}" style="max-height:46px;margin-bottom:8px"/>` : ""}
            <h2 style="color:${bColor}">${subject}</h2>
            <p>${enLine.replace(new RegExp(`\\s*Your delivery code is ${pin}.*$`), "")}</p>
            ${pin ? `<div style="background:${bColor}14;border:1px solid ${bColor};border-radius:12px;padding:14px 18px;margin:6px 0 14px;text-align:center">
              <div style="color:${bColor};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Delivery code · Code de livraison</div>
              <div style="color:${bColor};font-size:34px;font-weight:800;letter-spacing:6px">${pin}</div>
              <div style="color:#6B6675;font-size:12px">Give this to your courier · Donnez-le à votre livreur</div>
            </div>` : ""}
            <p><a href="${link}" style="display:inline-block;background:${bColor};color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700">Track your parcel →</a></p>
            <p style="color:#6B6675;font-size:13px">${frLine.replace(new RegExp(`\\s*Votre code de livraison est ${pin}.*$`), "")}</p>
            ${bName !== "Kolis" ? `<p style="color:#9b97a6;font-size:11px;margin-top:16px">${bName}${bPowered ? " · powered by Kolis" : ""}</p>` : ""}
          </div>`,
        }),
      });
      emailed = res.ok;
    }

    if (p.recipient_phone && TW_SID && TW_TOKEN && TW_FROM) {
      const body = new URLSearchParams({ To: p.recipient_phone, From: TW_FROM, Body: `${enLine} ${link}` });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      texted = res.ok;
    }

    return json({ ok: true, emailed, texted });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
