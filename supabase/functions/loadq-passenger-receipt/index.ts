// loadq-passenger-receipt — the passenger's own receipt, sent after the car leaves.
//
// Runs on a cron rather than a button: a passenger should not depend on whoever holds the
// tablet remembering to send it. Idempotent on loadq_seats.receipt_sent_at, which is stamped
// only when something actually went out — an unsent receipt keeps showing as unsent.
//
// Everything is read from the FROZEN departure record, so the receipt describes a journey that
// happened, not a booking that might still have changed.
//
// SMS is the primary channel: it is the only contact detail we hold for an Interac seat.
// Email is sent as well when Stripe Checkout captured one — that is the only way a passenger
// email ever reaches us.
//
// POST {}                              → sweep (what the cron calls)
// POST { seat_id }                     → one seat, EVEN IF already sent (a genuine resend)
// POST { seat_id, email_only: true }   → resend by email alone, so nobody is texted twice
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID");
const TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
const TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const RESEND = Deno.env.get("RESEND_API_KEY");

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " $";
const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const dt = (s: string) => new Date(s).toLocaleString("fr-CA",
  { dateStyle: "long", timeStyle: "short", timeZone: "America/Toronto" });
// Zone ids carry the city as a prefix (ottawa-universal-grocery); a passenger should see a
// place, not a slug.
const place = (z: string) => String(z ?? "").split("-").slice(1).join(" ")
  .replace(/\b\w/g, (m) => m.toUpperCase()) || String(z ?? "");
const city = (z: string) => (String(z ?? "").split("-")[0] || "").replace(/\b\w/g, (m) => m.toUpperCase());

Deno.serve(async (req) => {
  const db = createClient(URL_, SRK, { auth: { persistSession: false } });
  try {
    const b = await req.json().catch(() => ({} as any));

    let due: any[];
    if (b.seat_id) {
      // A named seat is an explicit instruction, so the stamp does not gate it. This is how a
      // receipt gets re-sent when the first attempt went out on one channel only.
      const { data, error } = await db.rpc("loadq_seat_receipt_for", { p_seat: b.seat_id });
      if (error) return json({ ok: false, error: error.message }, 500);
      due = data ? [data] : [];
    } else {
      const { data, error } = await db.rpc("loadq_seat_receipts_due", { p_limit: 50 });
      if (error) return json({ ok: false, error: error.message }, 500);
      due = (data ?? []) as any[];
    }

    const out: any[] = [];
    for (const r of due) {
      const rec: any = { seat_id: r.seat_id, reference: r.reference, name: r.name };
      const route = `${place(r.zone)}, ${city(r.zone)} → ${(r.destination ?? "").replace(/\b\w/g, (m: string) => m.toUpperCase())}`;
      const car = [r.vehicle, r.plate].filter(Boolean).join(" · ");
      const how = r.method === "card" ? "carte / card" : "Interac";

      const sms =
`LoadQ — reçu / receipt

${dt(r.departed_at)}
${route}
Place ${r.seat_no} · ${r.driver}${car ? "\n" + car : ""}

Payé / Paid : ${money(r.fare_cents)} (${how})
Réf. ${r.reference}

Merci d'avoir voyagé avec LoadQ.
Thank you for travelling with LoadQ.
support@loadq.ca`;

      // ── SMS ──────────────────────────────────────────────────────────────────────────
      if (b.email_only) {
        rec.sms = { ok: false, error: "skipped_email_only" };
      } else if (r.phone && TW_SID && TW_TOKEN && TW_FROM) {
        let to = String(r.phone).replace(/[^\d+]/g, "");
        if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
        const f = new URLSearchParams({ To: to, Body: sms });
        TW_FROM.startsWith("MG") ? f.set("MessagingServiceSid", TW_FROM) : f.set("From", TW_FROM);
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
          method: "POST",
          headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
          body: f.toString(),
        });
        rec.sms = res.ok ? { ok: true, sid: (await res.json()).sid } : { ok: false, error: `twilio_${res.status}` };
      } else rec.sms = { ok: false, error: r.phone ? "twilio_not_configured" : "no_phone" };

      // ── email, only when Stripe gave us one ──────────────────────────────────────────
      if (r.email && RESEND) {
        const html =
`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#15171C">
<div style="font-size:24px;font-weight:900;letter-spacing:-.5px">Load<span style="color:#FF8A1A">Q</span></div>
<div style="color:#6B7280;font-size:13px;margin:2px 0 18px">Reçu de voyage · Trip receipt</div>
<table width="100%" style="font-size:13px;border-collapse:collapse">
<tr><td style="color:#6B7280;padding:4px 0">Date</td><td align="right">${esc(dt(r.departed_at))}</td></tr>
<tr><td style="color:#6B7280;padding:4px 0">Trajet / Route</td><td align="right">${esc(route)}</td></tr>
<tr><td style="color:#6B7280;padding:4px 0">Place / Seat</td><td align="right">${r.seat_no}</td></tr>
<tr><td style="color:#6B7280;padding:4px 0">Chauffeur / Driver</td><td align="right">${esc(r.driver)}</td></tr>
${car ? `<tr><td style="color:#6B7280;padding:4px 0">Véhicule / Vehicle</td><td align="right">${esc(car)}</td></tr>` : ""}
<tr><td style="color:#6B7280;padding:4px 0">Paiement / Payment</td><td align="right">${esc(how)}</td></tr>
<tr><td style="color:#6B7280;padding:4px 0">Référence</td><td align="right"><code>${esc(r.reference)}</code></td></tr>
<tr><td style="padding:11px 0 0;border-top:2px solid #15171C;font-weight:800;font-size:16px">Total payé / Paid</td>
    <td align="right" style="padding:11px 0 0;border-top:2px solid #15171C;font-weight:800;font-size:16px">${money(r.fare_cents)}</td></tr>
</table>
<div style="color:#6B7280;font-size:11px;line-height:1.6;margin-top:20px;border-top:1px solid #E5E7EB;padding-top:12px">
Merci d'avoir voyagé avec LoadQ. / Thank you for travelling with LoadQ.<br>
Concord Express Co Inc. · LoadQ · support@loadq.ca
</div></div>`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "LoadQ <noreply@loadq.ca>", to: [r.email],
            reply_to: "support@loadq.ca",
            subject: `LoadQ — reçu ${money(r.fare_cents)} · ${route}`, html }),
        });
        rec.email = res.ok ? { ok: true, id: (await res.json()).id } : { ok: false, error: `resend_${res.status}` };
      } else rec.email = { ok: false, error: r.email ? "resend_not_configured" : "no_email" };

      // Stamped only if the passenger actually heard from us.
      if (rec.sms?.ok || rec.email?.ok) {
        await db.rpc("loadq_seat_receipt_sent", { p_seat: r.seat_id, p_via: rec.sms?.ok ? "sms" : "email" });
        rec.sent = true;
      } else rec.sent = false;
      out.push(rec);
    }

    const sent = out.filter((r) => r.sent).length;
    if (sent) console.log("passenger receipts sent:", out.filter((r) => r.sent).map((r) => r.reference).join(", "));
    return json({ ok: true, due: out.length, sent, receipts: out });
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
