// One-off: tell an org they've been granted account credit, by email + optional SMS.
// Secret-gated (admin/ops use only). Body: { org_id, amount_cents, phone?, email?, secret }.
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = "kolis_credit_2f7a";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function sms(to: string, body: string) {
  if (!TW_SID || !TW_TOKEN || !TW_FROM || !to) return { sent: false, why: "no twilio/phone" };
  let n = String(to).replace(/[^\d+]/g, ""); if (!n.startsWith("+")) n = n.length === 10 ? "+1" + n : "+" + n;
  const f = new URLSearchParams({ To: n, Body: body }); TW_FROM.startsWith("MG") ? f.set("MessagingServiceSid", TW_FROM) : f.set("From", TW_FROM);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: f.toString() });
  return { sent: r.ok, status: r.status };
}
async function email(to: string, subject: string, text: string) {
  if (!RESEND || !to) return { sent: false, why: "no resend/email" };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, text }) });
  return { sent: r.ok, status: r.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if ((req.headers.get("x-secret") || "") !== SECRET) return json({ error: "forbidden" }, 403);
    const { org_id, amount_cents, phone, email: emailTo } = await req.json();
    if (!org_id || !amount_cents) return json({ error: "org_id and amount_cents required" }, 400);
    const amt = `$${(Number(amount_cents) / 100).toFixed(2)}`;

    // Resolve the org's billing email if none passed.
    let to = emailTo as string | undefined;
    if (!to) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/kolis_orgs?id=eq.${org_id}&select=billing_email`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
      const rows = await r.json().catch(() => []);
      to = rows?.[0]?.billing_email;
    }

    const subject = `You've been credited ${amt} on Kolis`;
    const body =
`Good news — we've added a ${amt} credit to your Kolis Business account.

It will be applied automatically to your next shipment(s), before your card is charged. Nothing to do on your end — just ship as usual and the credit comes off your next orders.

Thank you for shipping with Kolis.
— Concord Express · Kolis

——
Bonne nouvelle — nous avons ajouté un crédit de ${amt} à votre compte Kolis Business.

Il sera appliqué automatiquement à vos prochains envois, avant tout débit sur votre carte. Rien à faire de votre côté — expédiez comme d'habitude et le crédit sera déduit de vos prochaines commandes.

Merci d'expédier avec Kolis.
— Concord Express · Kolis`;
    const smsBody = `Kolis: you've been credited ${amt} toward your next shipments — applied automatically before your card. Merci! — Concord Express`;

    const e = to ? await email(to, subject, body) : { sent: false, why: "no email on file" };
    const s = phone ? await sms(phone as string, smsBody) : { sent: false, why: "no phone provided" };
    return json({ ok: true, email: { to, ...e }, sms: { to: phone ?? null, ...s } });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
