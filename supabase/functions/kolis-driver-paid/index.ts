// Per-delivery courier payout. Called by the operator (x-kolis-secret) OR an
// authenticated staff user (admin-web button) with the parcel + Interac
// confirmation code. Marks the parcel paid to the driver, computes 2026
// cumulative earnings + first-T4-entry, and emails + SMSes the pink Kolis
// "Vous avez été payé" card (FR) to the driver.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const SECRET = Deno.env.get("KOLIS_NOTIFY_SECRET") || "kolis_notify_9f3a2c7b1e6d4084";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const PINK = "#E6127A";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",") + " $";
function fmtPhone(p?: string | null): string {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "").replace(/^1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p);
}

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

function payCard(o: { name: string; code: string; from: string; to: string; amountCents: number; conf: string; phone: string; recipient: string; whenStr: string; deliveredStr: string; cumulativeCents: number; firstEntry: boolean; year: number }): string {
  const amt = money(o.amountCents);
  const cum = money(o.cumulativeCents);
  const greenHead = o.firstEntry ? `Première entrée T4 &middot; ${o.year} enregistrée` : `Revenu T4 &middot; ${o.year} enregistré`;
  const greenSub = o.firstEntry ? `Vos premiers revenus ${o.year} sont au dossier.` : `Ajouté à votre feuillet T4 ${o.year}.`;
  return `<div style=\"max-width:480px;margin:0 auto;background:${PINK};color:#fff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif\">
   <div style=\"padding:26px 22px 4px\">
    <div style=\"display:inline-block;background:#0A0A0A;color:${PINK};font-weight:900;font-size:15px;letter-spacing:.5px;padding:9px 16px;border-radius:11px\">KOLIS</div>
    <div style=\"font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,.92);font-size:11px;font-weight:700;margin-top:22px\">Paiement coursier &middot; ${esc(o.name)}</div>
    <div style=\"font-size:46px;font-weight:900;line-height:1.0;margin-top:8px\"><span style=\"color:#fff\">Vous avez</span><br><span style=\"color:#0A0A0A\">été payé.</span></div>
    <div style=\"color:#fff;font-size:16.5px;line-height:1.45;margin-top:12px\">${amt} pour la livraison ${esc(o.code)}, ${esc(o.from)} &rarr; ${esc(o.to)} &mdash; envoyé par <b style=\"color:#0A0A0A\">Interac.</b></div>
    <div style=\"background:#0A0A0A;border-radius:16px;padding:18px;margin-top:20px\">
      <div style=\"font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1.5px;color:#8A978F;font-size:11px;font-weight:700\">Paiement &middot; ${esc(o.whenStr)}</div>
      <div style=\"margin-top:8px\"><span style=\"color:${PINK};font-weight:900;font-size:26px\">${amt}</span> <span style=\"color:#8A978F;font-weight:800;font-size:13px;letter-spacing:.5px\">CAD</span> <span style=\"color:#fff;font-weight:800;font-size:16px\">&nbsp;Virement Interac</span></div>
      <div style=\"color:#fff;font-size:14.5px;font-weight:700;margin-top:9px\">Confirmation&nbsp; ${esc(o.conf)}</div>
      <div style=\"color:#cfd6d2;font-size:13.5px;margin-top:5px\">Envoyé au ${esc(o.phone)} &middot; avisé par SMS</div>
    </div>
    <div style=\"background:#0A0A0A;border-radius:16px;padding:18px;margin-top:12px\">
      <div style=\"font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1.5px;color:#8A978F;font-size:11px;font-weight:700\">Livraison</div>
      <div style=\"margin-top:7px\"><span style=\"color:#fff;font-weight:900;font-size:20px\">${esc(o.code)}</span> <span style=\"color:#fff;font-weight:800;font-size:17px\">&nbsp;${esc(o.from)} &rarr; ${esc(o.to)}</span></div>
      <div style=\"color:#cfd6d2;font-size:13.5px;margin-top:7px\">Destinataire : ${esc(o.recipient)} &middot; livré le ${esc(o.deliveredStr)}</div>
    </div>
    <div style=\"background:#0c2a1b;border:1.5px solid rgba(34,192,131,.55);border-radius:16px;padding:16px;margin-top:12px\">
      <table cellpadding=\"0\" cellspacing=\"0\"><tr><td style=\"width:24px;vertical-align:middle\"><div style=\"width:24px;height:24px;border-radius:50%;background:#22C083;color:#08130d;font-weight:900;font-size:14px;text-align:center;line-height:24px\">&#10003;</div></td><td style=\"padding-left:9px;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:1.3px;color:#22C083;font-size:10.5px;font-weight:800\">${greenHead}</td></tr></table>
      <div style=\"color:#dbeee5;font-size:13.5px;margin-top:8px\">${greenSub}</div>
      <div style=\"margin-top:9px\"><span style=\"color:#fff;font-weight:800;font-size:15px\">Revenus cumulés ${o.year} :</span> <span style=\"color:#22C083;font-weight:900;font-size:19px\">&nbsp;${cum}</span></div>
    </div>
    <div style=\"text-align:center;color:#fff;font-size:13px;margin:18px 0 22px\">Ajouté à votre historique de paiements Kolis.</div>
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
    // Auth: internal operator (x-kolis-secret) OR an authenticated staff user.
    const secretOk = (req.headers.get("x-kolis-secret") || "") === SECRET;
    let staffOk = false;
    if (!secretOk) {
      const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
      try { const { data: isStaff } = await uc.rpc("kolis_is_staff"); staffOk = isStaff === true; } catch { /* */ }
    }
    if (!secretOk && !staffOk) return json({ error: "forbidden" }, 403);

    const { parcel_id, interac_confirmation, amount_cents } = await req.json();
    if (!parcel_id) return json({ error: "bad_request" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, code, driver_id, from_city, to_city, recipient_name, driver_payout_cents, delivered_at, external_driver_name").eq("id", parcel_id).maybeSingle();
    if (!p) return json({ error: "not_found" }, 404);
    if (!p.driver_id) return json({ error: "no_driver" }, 400);

    const amountCents = Number(amount_cents ?? p.driver_payout_cents ?? 0);
    if (!amountCents) return json({ error: "no_amount" }, 400);

    let name = p.external_driver_name || "Coursier", phone = "", payoutEmail: string | null = null, profileEmail: string | null = null;
    const { data: prof } = await admin.from("kolis_profiles").select("full_name, phone, email").eq("id", p.driver_id).maybeSingle();
    if (prof) { name = prof.full_name || name; phone = prof.phone || ""; profileEmail = prof.email; }
    const { data: pay } = await admin.from("kolis_driver_payout").select("interac_email").eq("driver_id", p.driver_id).maybeSingle();
    payoutEmail = pay?.interac_email ?? null;

    const now = new Date();
    const year = Number(now.toLocaleString("en-CA", { timeZone: "America/Toronto", year: "numeric" }));
    const yearStart = `${year}-01-01`;

    const { count: priorPaid } = await admin.from("kolis_parcels")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", p.driver_id).gte("driver_paid_at", yearStart).not("driver_paid_at", "is", null).neq("id", p.id);
    const firstEntry = (priorPaid ?? 0) === 0;

    await admin.from("kolis_parcels").update({ driver_paid_at: now.toISOString(), driver_payout_cents: amountCents }).eq("id", p.id);

    const { data: paidRows } = await admin.from("kolis_parcels")
      .select("driver_payout_cents").eq("driver_id", p.driver_id).gte("driver_paid_at", yearStart).not("driver_paid_at", "is", null);
    const cumulativeCents = (paidRows || []).reduce((s: number, r: any) => s + (r.driver_payout_cents || 0), 0);

    const whenStr = now.toLocaleString("fr-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase() + " (HE)";
    const deliveredStr = (p.delivered_at ? new Date(p.delivered_at) : now).toLocaleString("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long" });
    const conf = interac_confirmation || "—";

    const html = payCard({ name, code: p.code, from: p.from_city || "", to: p.to_city || "", amountCents, conf, phone: fmtPhone(phone), recipient: p.recipient_name || "", whenStr, deliveredStr, cumulativeCents, firstEntry, year });
    const subject = `Kolis — vous avez été payé ${money(amountCents)} (${p.code})`;
    email(payoutEmail || profileEmail, subject, html);
    sms(phone, `Kolis: vous avez été payé ${money(amountCents)} pour la livraison ${p.code} par Interac (conf. ${conf}). Revenus cumulés ${year}: ${money(cumulativeCents)}.`);

    return json({ ok: true, amount_cents: amountCents, cumulative_cents: cumulativeCents, first_entry: firstEntry, emailed_to: payoutEmail || profileEmail || null });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
