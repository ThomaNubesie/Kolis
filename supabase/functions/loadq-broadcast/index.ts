// loadq-broadcast: one-off announcement to all LoadQ passengers, localized per
// their saved locale (fr/en). Guarded by x-kolis-secret. Sends via Resend batch.
//   POST { only_email?: string, dry_run?: boolean }
//     only_email  → send FR+EN preview to that address only (no passengers)
//     dry_run     → return recipient count + a sample, send nothing
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = "LoadQ <noreply@loadq.ca>";
const REPLY_TO = "shaloderick@concordexpress.ca";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

function content(locale: string, first: string): { subject: string; html: string; text: string } {
  const fr = (locale || "").toLowerCase().startsWith("fr");
  const hi = fr ? (first ? `Bonjour ${first},` : "Bonjour,") : (first ? `Hi ${first},` : "Hi,");
  const bullets = fr
    ? ["Conducteurs vérifiés et trajets suivis",
       "Notez votre conducteur et partagez vos suggestions après chaque trajet",
       "Alertes et rappels en temps réel · carte en direct du point de départ",
       "Réservez en toute confiance — sans frais, sans réservation"]
    : ["Verified drivers and tracked trips",
       "Rate your driver and share suggestions after every trip",
       "Real-time alerts &amp; reminders · live pickup-zone map",
       "Reserve with confidence — no fees, no booking"];
  const subject = fr ? "Mise à jour LoadQ — Votre voix, votre sécurité" : "LoadQ update — Your voice, your safety";
  const intro = fr
    ? "LoadQ vient d'être mis à jour, avec plus de sécurité et votre voix au cœur de l'application :"
    : "LoadQ just got an update, with more safety and your voice built right in:";
  const cta = fr ? "Mettre à jour · loadq.ca" : "Update now · loadq.ca";
  const headline = fr ? ["Votre voix.", "Votre sécurité."] : ["Your voice.", "Your safety."];
  const unsub = fr
    ? "Vous recevez ce message parce que vous utilisez LoadQ. Pour vous désabonner, répondez « STOP » à ce courriel."
    : "You're receiving this because you use LoadQ. To unsubscribe, reply STOP to this email.";
  const li = bullets.map((b) => `<li style=\"margin-bottom:6px\">${b}</li>`).join("");
  const html = `<div style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.5\">
    <div style=\"background:#FF6A00;border-radius:14px 14px 0 0;padding:20px 22px\">
      <div style=\"display:inline-block;background:#0A0A0A;color:#FF6A00;font-weight:900;font-size:18px;padding:8px 16px;border-radius:11px\">LoadQ</div>
      <div style=\"font-size:30px;font-weight:800;line-height:1.05;margin-top:14px\"><span style=\"color:#fff\">${headline[0]}</span> <span style=\"color:#0A0A0A\">${headline[1]}</span></div>
    </div>
    <div style=\"border:1px solid #eee;border-top:none;border-radius:0 0 14px 14px;padding:20px 22px\">
      <p style=\"margin:0 0 10px\">${hi}</p>
      <p style=\"margin:0 0 8px\">${intro}</p>
      <ul style=\"margin:0 0 16px;padding-left:18px\">${li}</ul>
      <p style=\"margin:0 0 6px\"><a href=\"https://loadq.ca\" style=\"display:inline-block;background:#0A0A0A;color:#FF6A00;font-weight:900;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:12px\">${cta} →</a></p>
      <p style=\"color:#9b9b9b;font-size:12px;margin-top:18px;line-height:1.5\">Concord Express Co Inc. · Ottawa, Ontario, Canada · concordexpress.ca<br/>${unsub}</p>
    </div>
  </div>`;
  const text = `${hi}\n\n${intro}\n\n- ${bullets.join("\n- ").replace(/&amp;/g, "&")}\n\n${cta}: https://loadq.ca\n\nConcord Express Co Inc. · Ottawa, Ontario, Canada\n${unsub}`;
  return { subject, html, text };
}

async function sendBatch(items: any[]): Promise<{ ok: number; fail: number }> {
  let ok = 0, fail = 0;
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (res.ok) ok += chunk.length; else { fail += chunk.length; console.error("batch fail", res.status, await res.text()); }
  }
  return { ok, fail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "forbidden" }, 403);
  if (!RESEND) return json({ error: "RESEND_API_KEY not set" }, 500);
  const body = await req.json().catch(() => ({}));

  const mkItem = (email: string, locale: string, first: string) => {
    const c = content(locale, first);
    return { from: FROM, to: [email], reply_to: REPLY_TO, subject: c.subject, html: c.html, text: c.text,
             headers: { "List-Unsubscribe": "<mailto:unsubscribe@loadq.ca>" } };
  };

  if (body.only_email) {
    const items = [mkItem(body.only_email, "en", ""), mkItem(body.only_email, "fr", "")];
    const r = await sendBatch(items);
    return json({ ok: true, mode: "preview", to: body.only_email, sent: r.ok, failed: r.fail });
  }

  const supa = createClient(SUPABASE_URL, SERVICE);
  const { data, error } = await supa.from("passengers").select("email, full_name, locale, blocked").not("email", "is", null);
  if (error) return json({ error: error.message }, 500);
  const rows = (data as any[]).filter((p) => p.email && !p.blocked);
  const seen = new Set<string>();
  const items = rows.filter((p) => { const e = p.email.toLowerCase().trim(); if (seen.has(e)) return false; seen.add(e); return true; })
                    .map((p) => mkItem(p.email.trim(), p.locale || "en", firstName(p.full_name)));

  if (body.dry_run) return json({ ok: true, mode: "dry_run", recipients: items.length, sample_subject: content("en", "").subject });

  const r = await sendBatch(items);
  return json({ ok: true, mode: "send", recipients: items.length, sent: r.ok, failed: r.fail });
});
