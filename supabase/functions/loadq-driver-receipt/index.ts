// loadq-driver-receipt — the driver's copy of a departure, by SMS and email.
//
// Reads the FROZEN record (loadq_payouts), never recomputes it: a receipt that changes when a
// setting changes is not a receipt. Sends from LoadQ's own Twilio number and noreply@loadq.ca
// — never Quorly's sender, which is a different business.
//
// Idempotent in spirit, not in law: it will resend on request (the driver lost the text), but
// receipt_sent_at is stamped once, on the first successful send.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TW_SID = Deno.env.get("LOADQ_TWILIO_SID") ?? Deno.env.get("KOLIS_TWILIO_SID");
const TW_TOKEN = Deno.env.get("LOADQ_TWILIO_TOKEN") ?? Deno.env.get("KOLIS_TWILIO_TOKEN");
const TW_FROM = Deno.env.get("LOADQ_TWILIO_FROM") ?? Deno.env.get("KOLIS_TWILIO_FROM");
const RESEND = Deno.env.get("RESEND_API_KEY");

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " $";
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { entry_id } = await req.json().catch(() => ({} as any));
    if (!entry_id) return json({ ok: false, error: "entry_id manquant" }, 400);
    const db = createClient(URL_, SRK, { auth: { persistSession: false } });

    const { data: p, error } = await db.from("loadq_payouts").select("*").eq("entry_id", entry_id).maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!p) return json({ ok: false, error: "aucun départ enregistré pour cette voiture" }, 404);

    const { data: lines } = await db.from("loadq_seats")
      .select("seat_no, passenger_name, method, fare_cents")
      .eq("entry_id", entry_id).eq("status", "paid").order("seat_no");

    const when = new Date(p.departed_at).toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short", timeZone: "America/Toronto" });
    const trip = `${p.zone_id} → ${p.destination ?? ""}`;
    const sms =
`LoadQ — reçu de départ

${when}
${trip}
${p.vehicle_desc ?? ""}${p.plate ? " · " + p.plate : ""}

${p.seats} place(s) payée(s) : ${money(p.gross_cents)}
Frais LoadQ : −${money(p.fee_cents)}
Votre part : ${money(p.net_cents)}

Le frais est pris dans le tarif, non ajouté.
Versement par Interac sous 24 h ouvrables.

EN: ${p.seats} paid seat(s). Your share: ${money(p.net_cents)}. Transfer within 1 business day.

support@loadq.ca`;

    const out: any = { sms: null, email: null };

    if (p.driver_phone && TW_SID && TW_TOKEN && TW_FROM) {
      let to = String(p.driver_phone).replace(/[^\d+]/g, "");
      if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
      const form = new URLSearchParams({ To: to, Body: sms });
      TW_FROM.startsWith("MG") ? form.set("MessagingServiceSid", TW_FROM) : form.set("From", TW_FROM);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
        method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
      });
      out.sms = r.ok ? { ok: true, sid: (await r.json()).sid, from: TW_FROM } : { ok: false, error: `twilio_${r.status}`, detail: (await r.text()).slice(0, 200) };
    } else out.sms = { ok: false, error: p.driver_phone ? "twilio_not_configured" : "no_phone" };

    const { data: drv } = await db.from("drivers").select("email").eq("id", p.driver_id).maybeSingle();
    if (drv?.email && RESEND) {
      const rows = (lines ?? []).map((l: any) =>
        `<tr><td style="padding:7px 0;border-bottom:1px solid #F2F3F5">${l.seat_no}. ${esc(l.passenger_name ?? "—")} <span style="color:#6B7280;font-size:12px">· ${l.method === "card" ? "carte" : "Interac"}</span></td><td align="right" style="padding:7px 0;border-bottom:1px solid #F2F3F5">${money(l.fare_cents)}</td></tr>`).join("");
      const html =
`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#15171C">
<div style="font-size:24px;font-weight:900;letter-spacing:-.5px">Load<span style="color:#FF8A1A">Q</span></div>
<div style="color:#6B7280;font-size:13px;margin:2px 0 18px">Reçu de départ · Departure receipt</div>
<table width="100%" style="font-size:13px;border-collapse:collapse">
<tr><td style="color:#6B7280;padding:3px 0">Date et heure</td><td align="right">${esc(when)}</td></tr>
<tr><td style="color:#6B7280;padding:3px 0">Trajet</td><td align="right">${esc(trip)}</td></tr>
<tr><td style="color:#6B7280;padding:3px 0">Véhicule</td><td align="right">${esc(p.vehicle_desc ?? "—")}${p.plate ? " · " + esc(p.plate) : ""}</td></tr>
</table>
<table width="100%" style="font-size:14px;border-collapse:collapse;margin-top:16px">${rows}</table>
<table width="100%" style="font-size:14px;border-collapse:collapse;margin-top:12px">
<tr><td style="color:#6B7280;padding:4px 0">Encaissé par LoadQ</td><td align="right">${money(p.gross_cents)}</td></tr>
<tr><td style="color:#6B7280;padding:4px 0">Frais LoadQ</td><td align="right" style="color:#B42318">−${money(p.fee_cents)}</td></tr>
<tr><td style="padding:10px 0 0;border-top:2px solid #15171C;font-weight:800;font-size:16px">Versé au chauffeur</td><td align="right" style="padding:10px 0 0;border-top:2px solid #15171C;font-weight:800;font-size:16px">${money(p.net_cents)}</td></tr>
</table>
<div style="background:#FFF7ED;border:1px solid #FFE2BF;border-radius:9px;padding:10px 12px;margin-top:16px;font-size:12px;color:#8A4B08;line-height:1.5">
Le frais de ${money(p.fee_cents / Math.max(p.seats, 1))} par place est <b>pris dans le tarif, non ajouté</b>.
Dont ${money(p.fee_tax_cents ?? 0)} de ${esc(p.tax_label ?? "taxe")} contenue dans le frais.
</div>
<div style="color:#6B7280;font-size:11px;line-height:1.6;margin-top:18px;border-top:1px solid #E5E7EB;padding-top:12px">
Versement par Interac sous 24 h ouvrables${p.driver_phone ? " au " + esc(p.driver_phone) : ""}.<br>
Concord Express Co Inc. · LoadQ · support@loadq.ca<br>
Conservez ce reçu pour vos impôts. <i>Keep this receipt for your taxes.</i>
</div></div>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "LoadQ <noreply@loadq.ca>", to: [drv.email], reply_to: "support@loadq.ca",
          subject: `LoadQ — reçu de départ ${money(p.net_cents)}`, html }),
      });
      out.email = r.ok ? { ok: true, id: (await r.json()).id } : { ok: false, error: `resend_${r.status}`, detail: (await r.text()).slice(0, 200) };
    } else out.email = { ok: false, error: drv?.email ? "resend_not_configured" : "no_email" };

    // Stamped only if something actually reached the driver — an unsent receipt must keep
    // showing as unsent, or nobody chases it.
    if (out.sms?.ok || out.email?.ok) {
      await db.from("loadq_payouts").update({ receipt_sent_at: new Date().toISOString() })
        .eq("entry_id", entry_id).is("receipt_sent_at", null);
    }
    const ok = !!(out.sms?.ok || out.email?.ok);
    return json({ ok, ...out, error: ok ? undefined : "aucun envoi n'a abouti" }, ok ? 200 : 502);
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
