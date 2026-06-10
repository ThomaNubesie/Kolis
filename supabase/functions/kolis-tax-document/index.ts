// Generates a courier's year-end tax document (independent contractor) and
// emails it as a PDF attachment to their profile email. Country-aware:
//   CA -> T4A (Box 048, fees for services), US -> 1099-NEC (Box 1),
//   everywhere else -> Annual Earnings Statement. Gross payouts only; no tax
//   withheld (contractor). Couriers reconcile their own filings.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "no-reply@kolis.ca";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const COUNTRY_NAMES: Record<string, string> = {
  CA: "Canada", US: "United States", FR: "France", GB: "United Kingdom",
  SN: "Sénégal", NG: "Nigeria", GH: "Ghana", KE: "Kenya",
  MA: "Morocco", CI: "Côte d'Ivoire", CM: "Cameroon", RW: "Rwanda",
};
// Independent-contractor income document per country.
const DOC: Record<string, { type: string; subtitle: string }> = {
  CA: { type: "T4A", subtitle: "Statement of Pension, Retirement, Annuity, and Other Income — Box 048 (fees for services)" },
  US: { type: "1099-NEC", subtitle: "Nonemployee Compensation — Box 1" },
};
const docFor = (country: string) => DOC[country] || { type: "Annual Earnings Statement", subtitle: "Self-employed courier income" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { year } = await req.json();
    const yr = Number(year);
    if (!yr || yr < 2024 || yr > 2100) return json({ error: "bad year" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: prof } = await admin.from("kolis_profiles")
      .select("full_name, verified_name, email, country").eq("id", user.id).maybeSingle();
    const name = prof?.verified_name || prof?.full_name || "Kolis courier";
    const country = (prof?.country as string) || "CA";
    const to = prof?.email;

    // Sum delivered payouts for the year (driver's own earnings).
    const { data: rows } = await admin.from("kolis_parcels")
      .select("driver_payout_cents, delivered_at, created_at")
      .eq("driver_id", user.id).eq("status", "delivered");
    let cents = 0, parcels = 0;
    (rows ?? []).forEach((r: { driver_payout_cents: number | null; delivered_at: string | null; created_at: string }) => {
      const d = new Date(r.delivered_at || r.created_at);
      if (d.getUTCFullYear() === yr) { cents += r.driver_payout_cents ?? 0; parcels += 1; }
    });
    const gross = (cents / 100).toFixed(2);
    const doc = docFor(country);

    // Build a one-page PDF.
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.06, 0.10, 0.09);
    const grey = rgb(0.42, 0.46, 0.44);
    const mag = rgb(0.882, 0.114, 0.42);
    const T = (t: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: any } = {}) =>
      page.drawText(t, { x, y, size: o.size ?? 11, font: o.bold ? bold : font, color: o.color ?? ink });
    const line = (y: number) => page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.82) });

    T("Kolis", 50, 740, { size: 22, bold: true, color: mag });
    T("Part of Concord Express", 50, 724, { size: 9, color: grey });
    T(`${doc.type} · ${yr}`, 50, 690, { size: 16, bold: true });
    T(doc.subtitle, 50, 674, { size: 9, color: grey });
    line(662);

    T("Recipient", 50, 640, { size: 9, bold: true, color: grey });
    T(name, 50, 624, { size: 13, bold: true });
    T(`Country: ${COUNTRY_NAMES[country] || country}`, 50, 608, { size: 10, color: grey });
    T(`Tax year: ${yr}`, 50, 593, { size: 10, color: grey });

    T("Payer", 360, 640, { size: 9, bold: true, color: grey });
    T("Concord Express / Kolis", 360, 624, { size: 12, bold: true });
    T("no-reply@kolis.ca", 360, 608, { size: 10, color: grey });
    line(566);

    T("Parcels delivered", 50, 540, { size: 11, color: grey });
    T(String(parcels), 480, 540, { size: 11, bold: true });
    T("Gross payments (CAD)", 50, 516, { size: 11, color: grey });
    T(`C$${gross}`, 470, 516, { size: 11, bold: true });
    line(498);
    T(country === "CA" ? "Box 048 — Fees for services" : country === "US" ? "Box 1 — Nonemployee compensation" : "Total gross income", 50, 474, { size: 12, bold: true });
    T(`C$${gross}`, 460, 474, { size: 14, bold: true, color: mag });

    T("You are an independent contractor. No income tax has been withheld; you are", 50, 420, { size: 9, color: grey });
    T("responsible for reporting this income and remitting any taxes owed in your", 50, 408, { size: 9, color: grey });
    T("jurisdiction. This statement is for your records — consult a tax professional.", 50, 396, { size: 9, color: grey });
    T(`Generated by Kolis on ${new Date().toISOString().slice(0, 10)}.`, 50, 372, { size: 8, color: grey });

    const bytes = await pdf.save();
    let b64 = "";
    { const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) b64 += String.fromCharCode(...bytes.subarray(i, i + CH)); }
    const base64 = btoa(b64);
    const filename = `Kolis_${doc.type.replace(/[^A-Za-z0-9]/g, "")}_${yr}.pdf`;

    let emailed = false;
    if (RESEND && to) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to,
          subject: `Your Kolis ${doc.type} for ${yr}`,
          text: `Attached is your ${doc.type} for ${yr}. Gross courier payments: C$${gross} across ${parcels} parcel(s).`,
          attachments: [{ filename, content: base64 }],
        }),
      });
      const jr = await r.json().catch(() => ({}));
      emailed = r.ok && !jr?.error;
    }

    return json({ ok: true, year: yr, parcels, gross_cents: cents, doc_type: doc.type, emailed, emailed_to: emailed ? to : null, filename });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
