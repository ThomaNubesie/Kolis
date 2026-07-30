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

function copyFor(status: string, code: string, city: string, pin: string | null, eta?: { min: number; clock: string | null } | null, contents?: string | null) {
  // Sender pickup ETA (bilingual sentence), inserted before the pickup-code line.
  const etaEn = eta ? ` Estimated arrival in about ${eta.min} min${eta.clock ? ` (around ${eta.clock})` : ""}.` : "";
  const etaFr = eta ? ` Arrivée estimée dans environ ${eta.min} min${eta.clock ? ` (vers ${eta.clock})` : ""}.` : "";
  // The recipient must give this PIN to the courier to confirm delivery.
  const pinEn = pin ? ` Your delivery code is ${pin} — give it to your courier to confirm delivery.` : "";
  const pinFr = pin ? ` Votre code de livraison est ${pin} — donnez-le à votre livreur pour confirmer la livraison.` : "";
  // [subject, line] bilingual (EN \n FR)
  if (status === "created") {  // recipient: a package has been sent to them (with the contents the sender entered)
    const cEn = contents ? ` Contents: ${contents}.` : "";
    const cFr = contents ? ` Contenu : ${contents}.` : "";
    return [`You've been sent a package · ${code}`, `Good news — a package (${code}) is on its way to you in ${city}.${cEn} You'll get live updates and a delivery code as it moves.\nBonne nouvelle — un colis (${code}) est en route vers vous à ${city}.${cFr} Vous recevrez des mises à jour en direct et un code de livraison.`];
  }
  if (status === "pickup") {  // SENDER: courier assigned — ETA + give them the pickup code to release
    const pkEn = pin ? ` Give the courier your pickup code ${pin} to release the parcel.` : "";
    const pkFr = pin ? ` Donnez au livreur votre code de ramassage ${pin} pour remettre le colis.` : "";
    return [`A courier is on the way to pick up ${code}`, `A courier has been assigned to pick up your parcel ${code} (to ${city}).${etaEn}${pkEn}\nUn livreur a été assigné pour ramasser votre colis ${code} (vers ${city}).${etaFr}${pkFr}`];
  }
  if (status === "incoming")  // RECIPIENT: a courier is assigned — here's your delivery code up front
    return [`A courier is bringing your parcel ${code}`, `A courier has been assigned to bring your parcel ${code} to ${city}.${pinEn}\nUn livreur a été assigné pour vous livrer le colis ${code} à ${city}.${pinFr}`];
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
      .select("code, to_city, recipient_email, recipient_phone, status, delivery_code, pickup_code, pickup_eta_minutes, pickup_eta_at, org_id, sender_id, contents_description").eq("id", parcel_id).maybeSingle();
    if (!p) return json({ error: "not found" }, 404);

    const code = p.code as string;
    // Recipient arrival statuses carry the DELIVERY code; the sender "pickup"
    // status carries the PICKUP code (sender releases the parcel with it).
    const pin = (status === "picked_up" || status === "in_transit" || status === "incoming") ? (p.delivery_code as string | null)
              : status === "pickup" ? (p.pickup_code as string | null)
              : null;

    // Pickup ETA for the sender (all corridors are Eastern time).
    let eta: { min: number; clock: string | null } | null = null;
    if (status === "pickup" && p.pickup_eta_minutes) {
      let clock: string | null = null;
      if (p.pickup_eta_at) {
        try { clock = new Date(p.pickup_eta_at as string).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }); } catch { /* ignore */ }
      }
      eta = { min: p.pickup_eta_minutes as number, clock };
    }

    // Audience: "pickup" targets the SENDER; everything else targets the recipient.
    const toSender = status === "pickup";
    const link = `${TRACK_URL}/${encodeURIComponent(code)}`;
    const [subject, line] = copyFor(status, code, (p.to_city as string) || "", pin, eta, p.contents_description as string | null);
    const [enLine, frLine] = line.split("\n");
    // Deliver in the recipient's language (recipient_lang, set at creation from the
    // sender's language; default English). The tracking page has an EN/FR toggle.
    const rlang: "en" | "fr" = (p.recipient_lang === "fr") ? "fr" : "en";
    const frSubjects: Record<string, string> = {
      created: `Un colis vous a été envoyé · ${code}`,
      incoming: `Un livreur vous apporte le colis ${code}`,
      picked_up: `Votre colis ${code} est en route`,
      in_transit: `Votre colis ${code} est en cours de livraison`,
      pickup: `Un livreur vient ramasser ${code}`,
      delivered: `Votre colis ${code} a été livré`,
    };
    const subj = rlang === "fr" ? (frSubjects[status] || subject) : subject;
    const bodyLine = rlang === "fr" ? frLine : enLine;
    const dlText = rlang === "fr" ? "Envoyé via Kolis — obtenez l'appli : kolis.ca" : "Sent via Kolis — get the app: kolis.ca";
    let emailed = false, texted = false;

    // White-label: if this parcel belongs to a business with email branding on,
    // wear their name/color/logo; otherwise plain Kolis.
    let bColor = "#E11D6B", bName = "Kolis", bLogo: string | null = null, bPowered = true, orgBillingEmail: string | null = null;
    if (p.org_id) {
      const { data: o } = await admin.from("kolis_orgs")
        .select("name, brand_color, brand_name, brand_logo_url, brand_emails, brand_powered_by, billing_email").eq("id", p.org_id).maybeSingle();
      if (o) { orgBillingEmail = o.billing_email ?? null; if (o.brand_emails) { bColor = o.brand_color || "#E11D6B"; bName = o.brand_name || o.name || "Kolis"; bLogo = o.brand_logo_url; bPowered = o.brand_powered_by !== false; } }
    }

    // Resolve who we're contacting.
    let toEmail: string | null = p.recipient_email, toPhone: string | null = p.recipient_phone;
    if (toSender) {
      toEmail = null; toPhone = null;
      if (p.sender_id) { try { const { data: au } = await admin.auth.admin.getUserById(p.sender_id as string); toEmail = au?.user?.email ?? null; toPhone = au?.user?.phone ?? null; } catch { /* ignore */ } }
      if (!toEmail) toEmail = orgBillingEmail;   // fall back to the business billing email
    }
    const fromEmail = (FROM.match(/<(.+)>/)?.[1]) || FROM;
    const fromName = bName === "Kolis" ? "Kolis" : `${bName} via Kolis`;

    // The email's code box + copy differ for the sender's pickup code vs the recipient's delivery code.
    const isPickup = status === "pickup";
    const pinLabel = isPickup ? (rlang === "fr" ? "Code de ramassage" : "Pickup code") : (rlang === "fr" ? "Code de livraison" : "Delivery code");
    const pinHelp = isPickup ? (rlang === "fr" ? "Donnez-le pour remettre le colis" : "Give this to release the parcel") : (rlang === "fr" ? "Donnez-le à votre livreur" : "Give this to your courier");
    const strip = (s: string) => rlang === "fr"
      ? s.replace(/\s*(Votre code de livraison est|Donnez au livreur votre code de ramassage)\b[\s\S]*$/, "")
      : s.replace(/\s*(Your delivery code is|Give the courier your pickup code)\b[\s\S]*$/, "");

    if (toEmail && RESEND) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`, to: toEmail, subject: subj,
          // Tags let the Resend webhook (kolis-email-webhook) attribute delivery
          // events back to this parcel. Values must be [A-Za-z0-9_-] — a uuid and
          // the status slug both qualify.
          tags: [{ name: "kind", value: "transactional" }, { name: "parcel_id", value: String(parcel_id) }, { name: "status", value: String(status) }],
          text: `${bodyLine}\n\n${rlang === "fr" ? "Suivez-le" : "Track it"}: ${link}\n\n${dlText}`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">
            ${bLogo ? `<img src="${bLogo}" alt="${bName}" style="max-height:46px;margin-bottom:8px"/>` : `<img src="https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png" width="46" height="46" alt="Kolis" style="border-radius:11px;margin-bottom:10px;display:block"/>`}
            <h2 style="color:${bColor}">${subj}</h2>
            <p>${strip(bodyLine)}</p>
            ${pin ? `<div style="background:${bColor}14;border:1px solid ${bColor};border-radius:12px;padding:14px 18px;margin:6px 0 14px;text-align:center">
              <div style="color:${bColor};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">${pinLabel}</div>
              <div style="color:${bColor};font-size:34px;font-weight:800;letter-spacing:6px">${pin}</div>
              <div style="color:#6B6675;font-size:12px">${pinHelp}</div>
            </div>` : ""}
            <div style="text-align:center;margin:20px 0">
              <a href="${link}" style="display:inline-block;background:${bColor};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700">${rlang === "fr" ? "Suivez votre colis" : "Track your parcel"}</a>
              <div style="margin-top:10px;font-size:12px;color:#9b97a6"><a href="${link}?lang=en" style="color:${bColor};text-decoration:none;font-weight:700">EN</a> &nbsp;·&nbsp; <a href="${link}?lang=fr" style="color:${bColor};text-decoration:none;font-weight:700">FR</a></div>
            </div>
            <p style="color:#9b97a6;font-size:12px;text-align:center;margin-top:18px">${rlang === "fr" ? "Envoyé via" : "Sent via"} <b style="color:${bColor}">Kolis</b> — <a href="https://kolis.ca" style="color:${bColor};text-decoration:none;font-weight:700">kolis.ca</a></p>
            ${bName !== "Kolis" ? `<p style="color:#9b97a6;font-size:11px;text-align:center">${bName}${bPowered ? " · powered by Kolis" : ""}</p>` : ""}
            <p style="color:#b7b3c0;font-size:11px;text-align:center;margin-top:10px">Operated by Concord Express Co Inc. · support@concordexpress.ca</p>
          </div>`,
        }),
      });
      emailed = res.ok;
      // Record the send so the Resend webhook can log delivered/opened/clicked/bounced
      // for this transactional notification (kolis_email_events is keyed by
      // resend_email_id; the webhook attributes any event whose id we've logged here).
      if (res.ok) {
        try {
          const sent = await res.json();
          const rid = sent?.id ?? null;
          if (rid) await admin.from("kolis_email_events").insert({
            org_id: p.org_id ?? null, kind: "transactional", ref_id: String(parcel_id),
            email: toEmail, resend_email_id: rid, event: "sent",
          });
        } catch { /* logging is best-effort; never fail the notification on it */ }
      }
    }

    if (toPhone && TW_SID && TW_TOKEN && TW_FROM) {
      let to = String(toPhone).replace(/[^\d+]/g, "");
      if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
      const body = new URLSearchParams({ To: to, Body: `${bodyLine}\n${link}\n${dlText}` });
      // KOLIS_TWILIO_FROM may be a Messaging Service SID (MG…) or a from-number.
      if (TW_FROM.startsWith("MG")) body.set("MessagingServiceSid", TW_FROM);
      else body.set("From", TW_FROM);
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
