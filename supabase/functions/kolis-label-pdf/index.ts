// kolis-label-pdf: generates a print-ready PDF of a Kolis shipping label, and can
// email it as a PDF attachment via Resend. The PDF is built SERVER-SIDE from the
// parcel record (never from client-supplied content) so an authenticated org member
// can only ever send a real label for a parcel they can access.
//   POST { org_id, code, format?: "standard"|"thermal", email? }
//     - no email  → { ok, code, filename, pdf_base64 }   (client downloads it)
//     - with email→ { ok, emailed, to }                  (sent as a PDF attachment)
// Authorization is delegated to kolis_org_label (run under the caller's JWT), which
// only returns the label if the caller belongs to the parcel's org.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const qrUrl = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(data)}`;

function b64(bytes: Uint8Array): string {
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function buildPdf(p: any, thermal: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const W = thermal ? 288 : 612, H = thermal ? 432 : 792;               // 4×6in vs US Letter
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const magenta = rgb(0.882, 0.114, 0.42), dark = rgb(0.105, 0.102, 0.14), gray = rgb(0.43, 0.4, 0.46),
    line = rgb(0.81, 0.8, 0.76), routeBg = rgb(0.984, 0.933, 0.957), routePink = rgb(0.72, 0.08, 0.345),
    green = rgb(0.055, 0.29, 0.22), white = rgb(1, 1, 1);
  const s = thermal ? 0.72 : 1;
  const M = thermal ? 12 : 40;
  const cardW = W - 2 * M;
  const cx = M + cardW / 2, midX = M + cardW / 2;
  const safe = (t: any) => String(t ?? "").replace(/→/g, "->").replace(/[—–]/g, "-").replace(/[^\x00-\xFF]/g, "");
  const clip = (t: any, n: number) => { const x = safe(t); return x.length > n ? x.slice(0, n - 1) + "." : x; };
  const w = (t: string, size: number, f: any) => f.widthOfTextAtSize(safe(t), size);
  const tL = (t: string, x: number, yTop: number, size: number, f = font, c = dark) => page.drawText(safe(t), { x, y: yTop - size, size, font: f, color: c });
  const tR = (t: string, right: number, yTop: number, size: number, f = font, c = dark) => page.drawText(safe(t), { x: right - w(t, size, f), y: yTop - size, size, font: f, color: c });
  const tC = (t: string, center: number, yTop: number, size: number, f = font, c = dark) => page.drawText(safe(t), { x: center - w(t, size, f) / 2, y: yTop - size, size, font: f, color: c });

  // Fetch both QR PNGs (same encoding the app uses on screen).
  const [pk, dl] = await Promise.all([
    fetch(qrUrl(`KOLIS|${p.id}|pickup|${p.scan_token}`)).then((r) => r.arrayBuffer()),
    fetch(qrUrl(`KOLIS|${p.id}|delivery|${p.scan_token}`)).then((r) => r.arrayBuffer()),
  ]);
  const pkImg = await doc.embedPng(pk), dlImg = await doc.embedPng(dl);

  let y = H - M;                                                         // top cursor (draw downward)

  // Header band
  const hH = 50 * s;
  page.drawRectangle({ x: M, y: y - hH, width: cardW, height: hH, color: magenta });
  const ko = 32 * s;
  page.drawRectangle({ x: M + 14 * s, y: y - hH / 2 - ko / 2, width: ko, height: ko, color: white });
  tC("Ko", M + 14 * s + ko / 2, y - hH / 2 + (15 * s) / 2, 15 * s, bold, magenta);
  tL("Kolis", M + 14 * s + ko + 10 * s, y - hH / 2 + (21 * s) / 2, 21 * s, bold, white);
  tR(p.code || "", M + cardW - 14 * s, y - hH / 2 + (23 * s) / 2, 23 * s, bold, white);
  y -= hH;

  // Route band
  const rH = 27 * s;
  page.drawRectangle({ x: M, y: y - rH, width: cardW, height: rH, color: routeBg });
  tL(`${p.from_city || ""}   ->   ${p.to_city || ""}`, M + 16 * s, y - (rH - 16 * s) / 2, 16 * s, bold, routePink);
  page.drawLine({ start: { x: M, y: y - rH }, end: { x: M + cardW, y: y - rH }, thickness: 0.8, color: line });
  y -= rH;

  // From / To band
  const ftH = 52 * s;
  page.drawLine({ start: { x: midX, y: y - ftH + 6 }, end: { x: midX, y: y - 6 }, thickness: 0.8, color: line });
  tL("FROM · SENDER", M + 16 * s, y - 13 * s, 9 * s, bold, gray);
  tL(clip(p.sender_name || "-", thermal ? 22 : 42), M + 16 * s, y - 13 * s - 17 * s, 13 * s, bold, dark);
  tL("TO · RECIPIENT", midX + 14 * s, y - 13 * s, 9 * s, bold, gray);
  tL(clip(p.recipient_name || "-", thermal ? 20 : 36), midX + 14 * s, y - 13 * s - 17 * s, 13 * s, bold, dark);
  tL(clip(p.dropoff_addr || p.to_city || "", thermal ? 26 : 46), midX + 14 * s, y - 13 * s - 32 * s, 10 * s, font, gray);
  page.drawLine({ start: { x: M, y: y - ftH }, end: { x: M + cardW, y: y - ftH }, thickness: 0.8, color: line });
  y -= ftH;

  // QR row (two codes side by side)
  const qr = thermal ? 116 : 196;
  const c1 = M + cardW / 4, c2 = M + (3 * cardW) / 4;
  const qrTop = y - 12 * s;
  page.drawImage(pkImg, { x: c1 - qr / 2, y: qrTop - qr, width: qr, height: qr });
  page.drawImage(dlImg, { x: c2 - qr / 2, y: qrTop - qr, width: qr, height: qr });
  const capTop = qrTop - qr - 10 * s;
  tC("PICKUP", c1, capTop, 14 * s, bold, routePink);
  tC("Courier scans within 100 m", c1, capTop - 17 * s, 8.5 * s, font, gray);
  tC("DELIVERY", c2, capTop, 14 * s, bold, green);
  tC("Courier scans within 100 m", c2, capTop - 17 * s, 8.5 * s, font, gray);
  y = capTop - 30 * s;

  // Footer
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + cardW, y: y + 4 }, thickness: 0.8, color: line });
  tC("The confirmation code is held only by sender & recipient — never printed here.", cx, y - 4 * s, 8.5 * s, font, gray);
  tC("Scan with the Kolis driver app · powered by Concord Express · kolis.ca", cx, y - 18 * s, 9 * s, font, gray);
  const cardBottom = y - 30 * s;

  // Card outline
  page.drawRectangle({ x: M, y: cardBottom, width: cardW, height: (H - M) - cardBottom, borderColor: line, borderWidth: thermal ? 1.2 : 1 });

  return await doc.save();
}

async function emailPdf(to: string, code: string, pdf: Uint8Array): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to,
      subject: `Your Kolis shipping label · ${code}`,
      text: `Attached is the shipping label for ${code}. Print it at 100% scale and attach it to the parcel.\n\nSent via Kolis · kolis.ca`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px">
        <img src="https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png" width="44" height="44" alt="Kolis" style="border-radius:11px;margin-bottom:10px;display:block"/>
        <h2 style="color:#E11D6B">Shipping label · ${code}</h2>
        <p>Your Kolis shipping label is attached as a PDF. Print it at 100% scale and attach it to the parcel — the courier scans the QR codes to pick up and deliver.</p>
        <p style="color:#9b97a6;font-size:12px;margin-top:16px">Sent via <b style="color:#E11D6B">Kolis</b> · kolis.ca · Operated by Concord Express Co Inc.</p>
      </div>`,
      tags: [{ name: "kind", value: "label" }, { name: "code", value: String(code).replace(/[^A-Za-z0-9_-]/g, "") }],
      attachments: [{ filename: `${code}-label.pdf`, content: b64(pdf) }],
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const { org_id, code, format, email } = await req.json();
    if (!org_id || !code) return json({ error: "org_id and code required" }, 400);

    // Authorize + fetch label as the calling user (kolis_org_label enforces membership).
    const supa = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data, error } = await supa.rpc("kolis_org_label", { p_org: org_id, p_code: code });
    if (error) return json({ error: error.message }, 403);
    const label = Array.isArray(data) ? data[0] : data;
    if (!label?.id) return json({ error: "not found" }, 404);

    const pdf = await buildPdf(label, format === "thermal");

    if (email) {
      if (!RESEND) return json({ error: "email is not configured" }, 500);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return json({ error: "invalid email address" }, 400);
      const ok = await emailPdf(String(email), label.code || code, pdf);
      return ok ? json({ ok: true, emailed: true, to: email }) : json({ error: "the email could not be sent" }, 502);
    }
    return json({ ok: true, code: label.code || code, filename: `${label.code || code}-label.pdf`, pdf_base64: b64(pdf) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
