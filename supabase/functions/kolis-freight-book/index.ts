// kolis-freight-book — pay-per-shipment booking for Kolis Freight.
// Two-stage billing: at booking the customer gets a CONFIRMATION (card, authorized) or
// INVOICE (monthly account); at pickup, when the card capture succeeds (or Interac clears),
// they get the paid RECEIPT. Card funds are AUTHORIZED at booking, CAPTURED on pickup.
// Actions: book (public), confirm (public), capture (staff/secret), interac_match (staff/secret).
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL, SRK, { auth: { persistSession: false } });
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const SITE = Deno.env.get("KOLIS_BUSINESS_URL") || "https://business.kolis.ca";
const INTERAC_TO = Deno.env.get("KOLIS_INTERAC_ADDRESS") || "pay@kolis.ca";
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis · Business <noreply@loadq.ca>";
const TEAM = ["marketing@concordexpress.ca", "shaloderick@gmail.com"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
const money = (c: number | null) => `$${(((c ?? 0)) / 100).toFixed(2)}`;

async function callerIsStaff(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    const u = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data } = await u.rpc("kolis_is_staff");
    return data === true;
  } catch { return false; }
}

function taxRate(region: string): number {
  const r = (region || "").toLowerCase().trim();
  if (["on", "ontario"].includes(r)) return 0.13;
  if (["nb", "new brunswick", "ns", "nova scotia", "pe", "prince edward island", "nl", "newfoundland and labrador", "newfoundland"].includes(r)) return 0.15;
  if (["qc", "quebec", "québec"].includes(r)) return 0.14975;
  return 0.05;
}
function payRef(): string { let n = ""; for (let i = 0; i < 5; i++) n += Math.floor(Math.random() * 10); return "KF-" + n; }

async function sendEmail(to: string | string[], subject: string, html: string, replyTo?: string) {
  if (!RESEND || !to || (Array.isArray(to) && !to.length)) return;
  const payload: Record<string, unknown> = { from: FROM, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shell(r: any, track: string, title: string, intro: string): string {
  const rows: [string, string][] = [
    ["Carrier / Transporteur", r.carrier || "—"], ["From / De", r.origin || "—"], ["To / À", r.destination || "—"],
    ["Pallets / Palettes", String(r.pallets ?? "—")], ["Transit", r.transit_days ? `${r.transit_days} business day(s)` : "—"],
    ["Total", money(r.total_cents)], ["Payment / Paiement", `${r.payment_method}${r.payment_status ? " · " + r.payment_status : ""}`],
    ["Tracking / Suivi", track],
  ];
  const trs = rows.map(([k, v]) => `<tr><td style="padding:7px 12px;color:#6B6675;font-weight:700;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 12px;color:#1a1722">${esc(v)}</td></tr>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
    <div style="background:#E11D6B;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800;font-size:16px">Kolis · Business — ${esc(title)}</div>
    <div style="padding:4px 2px 0"><p style="color:#5A6273;font-size:13px;margin:12px 4px">${esc(intro)}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #ECECF2">${trs}</table>
    <p style="color:#9b97a6;font-size:11.5px;margin:12px 4px">Track: ${SITE}/freight/track?n=${encodeURIComponent(track)} · Kolis Freight, operated by Concord Express Co Inc.</p></div></div>`;
}
// Status-aware customer document: confirmation (authorized) / invoice (invoiced) / receipt (paid).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emailCustomerDoc(r: any, track: string) {
  if (!(r.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))) return;
  const first = (r.contact || "").split(" ")[0] || "there";
  const kind = r.payment_status === "paid" ? "receipt" : r.payment_status === "invoiced" ? "invoice" : "confirmation";
  const title = kind === "receipt" ? "Payment receipt" : kind === "invoice" ? "Invoice" : "Booking confirmation";
  const intro = kind === "receipt" ? `Thanks ${first} — your shipment was picked up and payment is complete. Thank you!`
    : kind === "invoice" ? `Thanks ${first} — here's your invoice, billed to your monthly Kolis account (net terms). Your Bill of Lading / label follows once we dispatch the carrier.`
    : `Thanks ${first} — your card is authorized and you're charged only when the carrier picks up. Your Bill of Lading / label follows once we dispatch the carrier.`;
  await sendEmail(r.email, `Kolis Freight ${kind} — ${r.carrier ?? "shipment"} (${track})`, shell(r, track, title, intro));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emailTeamDispatch(r: any, track: string) {
  await sendEmail(TEAM, `Freight booked & ${r.payment_status} — dispatch ${r.carrier ?? ""} (${track})`, shell(r, track, "Freight booked — dispatch needed", `A pay-per-shipment freight booking is ${r.payment_status}. Book it with the carrier and issue the BOL/label.`), r.email || undefined);
}

async function bookShipment(id: string) {
  const track = "KOLIS-" + Math.abs([...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36).toUpperCase().slice(0, 6);
  await admin.from("kolis_freight_requests").update({ status: "booked", booked_at: new Date().toISOString(), tracking_number: track }).eq("id", id);
  try { const { data: r } = await admin.from("kolis_freight_requests").select("*").eq("id", id).maybeSingle(); if (r) { await emailCustomerDoc(r, track); await emailTeamDispatch(r, track); } } catch { /* best-effort */ }
  return track;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(b.action || "book");
    const privileged = req.headers.get("x-kolis-secret") === SECRET || await callerIsStaff(req);

    if (action === "capture") {
      if (!privileged) return json({ error: "forbidden" }, 403);
      const { data: row } = await admin.from("kolis_freight_requests").select("*").eq("id", String(b.request_id || "")).maybeSingle();
      if (!row?.stripe_payment_intent) return json({ error: "not_found" }, 404);
      if (row.payment_status === "paid") return json({ ok: true, already: true });
      const pi = await stripe.paymentIntents.capture(row.stripe_payment_intent);
      await admin.from("kolis_freight_requests").update({ payment_status: "paid", captured_at: new Date().toISOString(), paid_at: new Date().toISOString() }).eq("id", row.id);
      try { await emailCustomerDoc({ ...row, payment_status: "paid" }, row.tracking_number || ""); } catch { /* best-effort */ }
      return json({ ok: true, captured: true, status: pi.status });
    }

    if (action === "interac_match") {
      if (!privileged) return json({ error: "forbidden" }, 403);
      const ref = String(b.pay_ref || "").trim().toUpperCase();
      if (ref.length < 3) return json({ matched: false, reason: "no_reference" });
      const { data: row } = await admin.from("kolis_freight_requests").select("id, total_cents, payment_status").eq("pay_ref", ref).maybeSingle();
      if (!row) return json({ matched: false, reason: "no_match", reference: ref });
      if (row.payment_status === "paid") return json({ matched: true, already: true, request_id: row.id });
      const amt = b.amount_cents != null ? Math.round(Number(b.amount_cents)) : null;
      if (amt != null && row.total_cents != null && amt < row.total_cents) return json({ matched: false, reason: "amount_short", expected: row.total_cents, got: amt, request_id: row.id });
      await admin.from("kolis_freight_requests").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", row.id);
      const track = await bookShipment(row.id);
      return json({ matched: true, request_id: row.id, tracking_number: track });
    }

    if (action === "confirm") {
      const id = String(b.request_id || "");
      const { data: row } = await admin.from("kolis_freight_requests").select("id, stripe_checkout_session, stripe_payment_intent, payment_status, tracking_number").eq("id", id).maybeSingle();
      if (!row) return json({ error: "not_found" }, 404);
      if (row.payment_status === "authorized" || row.payment_status === "paid") return json({ ok: true, booked: true, tracking_number: row.tracking_number });
      if (!row.stripe_checkout_session) return json({ ok: false, error: "no_session" });
      const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session, { expand: ["payment_intent"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi: any = session.payment_intent;
      if (!pi || (pi.status !== "requires_capture" && pi.status !== "succeeded")) return json({ ok: false, status: pi?.status ?? session.status, error: "not_authorized" });
      await admin.from("kolis_freight_requests").update({ stripe_payment_intent: pi.id, stripe_customer: (session.customer as string) ?? null, payment_status: pi.status === "succeeded" ? "paid" : "authorized", authorized_at: new Date().toISOString() }).eq("id", id);
      const track = await bookShipment(id);
      return json({ ok: true, booked: true, tracking_number: track });
    }

    const method = String(b.method || "card");
    const amount_cents = Math.round(Number(b.amount_cents) || 0);
    if (amount_cents <= 0) return json({ error: "amount_required" }, 400);
    if (!["card", "interac", "account"].includes(method)) return json({ error: "bad_method" }, 400);

    const rate = taxRate(String(b.region || ""));
    const tax_cents = Math.round(amount_cents * rate);
    const total_cents = amount_cents + tax_cents;
    const surcharge_cents = b.surcharge_cents != null ? Math.round(Number(b.surcharge_cents)) : null;

    const rec: Record<string, unknown> = {
      business: b.business ?? null, contact: b.contact ?? null, email: b.email ?? null, phone: b.phone ?? null,
      origin: b.origin ?? null, destination: b.destination ?? null,
      pallets: Number(b.pallets) || 1, weight: b.weight ?? null, dims: b.dims ?? null,
      accessorials: Array.isArray(b.accessorials) ? b.accessorials : [], note: b.note ?? null, lang: b.lang ?? "en",
      carrier: b.carrier ?? null, quoted_service: b.carrier ?? null, quoted_price: amount_cents / 100, quoted_at: new Date().toISOString(),
      service_id: b.service_id ?? null, transit_days: Number(b.transit_days) || null, residential_end: b.residential_end ?? null,
      amount_cents, surcharge_cents, tax_cents, total_cents, currency: "CAD",
      payment_method: method, payment_status: "unpaid", status: "pending_payment", org_id: b.org_id ?? null,
    };
    const { data: ins, error: insErr } = await admin.from("kolis_freight_requests").insert(rec).select("id").single();
    if (insErr) return json({ error: "save_failed", detail: insErr.message }, 500);
    const id = ins.id as string;
    const meta = { kolis_freight_id: id, carrier: String(b.carrier ?? "") };
    const label = `Freight — ${b.carrier ?? "carrier"} (${b.origin ?? ""} → ${b.destination ?? ""})`;

    if (method === "interac") {
      const ref = payRef();
      await admin.from("kolis_freight_requests").update({ pay_ref: ref }).eq("id", id);
      return json({ ok: true, request_id: id, method, pay_ref: ref, interac_to: INTERAC_TO, total_cents, tax_cents, amount_cents });
    }

    if (method === "account") {
      const { data: org } = await admin.from("kolis_orgs").select("id, status").eq("id", String(b.org_id || "")).maybeSingle();
      if (!org) return json({ error: "no_account" }, 402);
      await admin.from("kolis_freight_requests").update({ payment_status: "invoiced" }).eq("id", id);
      const track = await bookShipment(id);
      return json({ ok: true, request_id: id, method, invoiced: true, tracking_number: track, total_cents });
    }

    if (b.use_saved_card) {
      const { data: org } = await admin.from("kolis_orgs").select("stripe_customer_id, stripe_default_pm").eq("id", String(b.org_id || "")).maybeSingle();
      if (!org?.stripe_customer_id || !org?.stripe_default_pm) return json({ error: "no_card" }, 402);
      try {
        const pi = await stripe.paymentIntents.create({ amount: total_cents, currency: "cad", customer: org.stripe_customer_id, payment_method: org.stripe_default_pm, off_session: true, confirm: true, capture_method: "manual", statement_descriptor_suffix: "KOLIS FRT", metadata: meta });
        const okAuth = pi.status === "requires_capture";
        await admin.from("kolis_freight_requests").update({ stripe_payment_intent: pi.id, stripe_customer: org.stripe_customer_id, payment_status: okAuth ? "authorized" : "failed", authorized_at: okAuth ? new Date().toISOString() : null }).eq("id", id);
        if (!okAuth) return json({ ok: false, request_id: id, error: "auth_failed", status: pi.status }, 402);
        const track = await bookShipment(id);
        return json({ ok: true, request_id: id, method, on_file: true, authorized: true, tracking_number: track, total_cents });
      } catch (e) {
        await admin.from("kolis_freight_requests").update({ payment_status: "failed" }).eq("id", id);
        return json({ ok: false, request_id: id, error: "card_declined", detail: String((e as Error)?.message ?? e).slice(0, 160) }, 402);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price_data: { currency: "cad", product_data: { name: label }, unit_amount: total_cents }, quantity: 1 }],
      payment_intent_data: { capture_method: "manual", statement_descriptor_suffix: "KOLIS FRT", metadata: meta },
      customer_email: (b.email as string) || undefined,
      success_url: `${SITE}/freight?booked=${id}`,
      cancel_url: `${SITE}/freight?checkout=cancelled&rid=${id}`,
      metadata: meta,
    });
    await admin.from("kolis_freight_requests").update({ stripe_checkout_session: session.id }).eq("id", id);
    return json({ ok: true, request_id: id, method, url: session.url, total_cents, tax_cents, amount_cents });
  } catch (e) {
    return json({ error: "error", detail: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
