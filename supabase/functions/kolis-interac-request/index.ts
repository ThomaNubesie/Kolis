// Sends an Interac e-Transfer payment request for a Kolis parcel (SMS + branded email, FR/EN).
// POST { code | parcel_id, to_phone?, to_email? }  — to_* override the sender contact (used for previews).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const money = (c: number) => (c / 100).toFixed(2);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const code = b.code || null, pid = b.parcel_id || null;
    if (!code && !pid) return json({ error: "code or parcel_id required" }, 400);

    let q = admin.from("kolis_parcels").select("id, code, from_city, to_city, price_cents, sender_id, recipient_lang, payment_method, payment_status");
    q = code ? q.eq("code", code) : q.eq("id", pid);
    const { data: p } = await q.maybeSingle();
    if (!p) return json({ error: "parcel_not_found" }, 404);

    const { data: prof } = await admin.from("kolis_profiles").select("full_name, phone, email").eq("id", p.sender_id).maybeSingle();
    let phone = b.to_phone || prof?.phone || null;
    let email = b.to_email || prof?.email || null;
    if (!phone || !email) {
      const { data: u } = await admin.auth.admin.getUserById(p.sender_id);
      phone = phone || u?.user?.phone || null;
      email = email || u?.user?.email || null;
    }
    const name = (prof?.full_name || "").split(" ")[0] || "";
    const fr = (p.recipient_lang || "fr") === "fr";
    const addr = Deno.env.get("KOLIS_INTERAC_ADDRESS") || "";
    const auto = (Deno.env.get("KOLIS_INTERAC_AUTODEPOSIT") || "true") === "true";
    const amt = money(p.price_cents);

    const autoLine = fr
      ? (auto ? "Dépôt automatique activé — aucune question de sécurité." : "Une question de sécurité vous sera demandée; nous vous la communiquerons séparément.")
      : (auto ? "Autodeposit is on — no security question needed." : "A security question will be required; we'll send it to you separately.");
    const sms = fr
      ? `Kolis · Concord Express — Facture ${p.code}\nBonjour ${name}, pour votre envoi ${p.from_city} → ${p.to_city} : ${amt} $ CAD.\nPayez par virement Interac à : ${addr}\n${autoLine}\nIndiquez la référence ${p.code} dans le message. Merci!`
      : `Kolis · Concord Express — Invoice ${p.code}\nHi ${name}, for your shipment ${p.from_city} → ${p.to_city}: $${amt} CAD.\nPay by Interac e-Transfer to: ${addr}\n${autoLine}\nPut reference ${p.code} in the message. Thanks!`;

    const t = fr
      ? { h: "Demande de paiement", sub: `Envoi ${p.from_city} → ${p.to_city}`, hi: `Bonjour ${name},`, l1: "Montant à payer", l2: "Virement Interac à", l3: "Référence (message)", how: "Ouvrez votre application bancaire → Virement Interac → envoyez à l'adresse ci-dessus.", thanks: "Merci de faire confiance à Concord Express." }
      : { h: "Payment request", sub: `Shipment ${p.from_city} → ${p.to_city}`, hi: `Hi ${name},`, l1: "Amount due", l2: "Interac e-Transfer to", l3: "Reference (message)", how: "Open your banking app → Interac e-Transfer → send to the address above.", thanks: "Thank you for trusting Concord Express." };
    const html = `<div style="margin:0;background:#f4f4f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
  <div style="background:#E11D6B;color:#fff;padding:26px 26px 22px">
    <div style="display:inline-block;background:#0A0A0A;color:#E11D6B;font-weight:800;font-size:15px;padding:6px 13px;border-radius:9px;letter-spacing:1px">KOLIS</div>
    <div style="font-size:24px;font-weight:800;margin-top:14px">${t.h}</div>
    <div style="opacity:.93;font-weight:600;margin-top:3px">${t.sub} · ${p.code}</div>
  </div>
  <div style="padding:24px 26px">
    <p style="margin:0 0 16px;font-size:15px;color:#14121a">${t.hi}</p>
    <div style="background:#fdeef4;border-radius:13px;padding:16px 18px">
      <div style="font-size:13px;color:#b3105e;font-weight:700;text-transform:uppercase;letter-spacing:.4px">${t.l1}</div>
      <div style="font-size:30px;font-weight:800;color:#0A0A0A">$${amt} <span style="font-size:15px;color:#7a7784">CAD</span></div>
      <div style="margin-top:14px;font-size:13px;color:#b3105e;font-weight:700;text-transform:uppercase;letter-spacing:.4px">${t.l2}</div>
      <div style="font-size:18px;font-weight:800;color:#0A0A0A">${addr}</div>
      <div style="margin-top:14px;font-size:13px;color:#b3105e;font-weight:700;text-transform:uppercase;letter-spacing:.4px">${t.l3}</div>
      <div style="font-size:18px;font-weight:800;color:#0A0A0A">${p.code}</div>
    </div>
    <p style="margin:16px 0 0;font-size:14px;color:#5a5866;line-height:1.55">${autoLine}</p>
    <p style="margin:10px 0 0;font-size:14px;color:#5a5866;line-height:1.55">${t.how}</p>
    <p style="margin:18px 0 0;font-size:14px;color:#14121a">${t.thanks}</p>
  </div>
  <div style="background:#0A0A0A;padding:16px 26px;text-align:center">
    <span style="font-weight:800;letter-spacing:1px;background:linear-gradient(90deg,#E11D6B,#f59e0b,#10b981,#3b82f6);-webkit-background-clip:text;background-clip:text;color:transparent">CONCORD EXPRESS CO INC.</span>
  </div>
</div></div>`;

    const sent: Record<string, string> = {};
    const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
    if (phone && TW_SID && TW_TOKEN && TW_FROM) {
      const body = new URLSearchParams({ To: phone.startsWith("+") ? phone : "+" + phone, Body: sms });
      TW_FROM.startsWith("MG") ? body.set("MessagingServiceSid", TW_FROM) : body.set("From", TW_FROM);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
      const j = await r.json().catch(() => ({}));
      sent.sms = r.ok ? (j.status || "queued") : ("err:" + (j.message || r.status));
    } else sent.sms = "skipped(no phone)";

    const RESEND = Deno.env.get("RESEND_API_KEY"), FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
    if (email && RESEND) {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to: [email], subject: `${t.h} · ${p.code} · $${amt} CAD`, html, text: sms }) });
      sent.email = r.ok ? "sent" : ("err:" + r.status);
    } else sent.email = "skipped(no email)";

    return json({ ok: true, code: p.code, amount: amt, to: { phone, email }, interac: addr, sent });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
