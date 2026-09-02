// loadq-send-sms — one-off LoadQ SMS or MMS, sent with the project's
// KOLIS_TWILIO_* secrets. Service-role Bearer only; there is no user path.
//
// Separate from kolis-send-sms because that one is SMS-only and is on live
// Kolis paths — this adds MediaUrl without touching it.
//
// POST { to, body, media_url? }  ->  { ok, sid, status, to }
//
// NOTE ON MMS. Carrier delivery of MMS to Canadian numbers is unreliable and
// fails silently — Twilio reports "sent" and the handset never shows it. So a
// media send ALSO carries the text, and the caller is expected to follow with a
// plain SMS. Check the returned sid's status before assuming it landed.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const { to, body, media_url } = await req.json().catch(() => ({}));
  if (!to || !body) return json({ error: "missing to/body" }, 400);

  const SID = Deno.env.get("KOLIS_TWILIO_SID");
  const TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
  const FROM = Deno.env.get("KOLIS_TWILIO_FROM");
  if (!SID || !TOKEN || !FROM) return json({ error: "twilio_not_configured" }, 500);

  let t = String(to).replace(/[^\d+]/g, "");
  if (!t.startsWith("+")) t = t.length === 10 ? "+1" + t : "+" + t;

  const f = new URLSearchParams({ To: t, Body: String(body) });
  FROM.startsWith("MG") ? f.set("MessagingServiceSid", FROM) : f.set("From", FROM);
  if (media_url) f.append("MediaUrl", String(media_url));

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${SID}:${TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: f.toString(),
  });
  const txt = await res.text();
  let sid: string | null = null, status: string | null = null;
  try { const j = JSON.parse(txt); sid = j.sid ?? null; status = j.status ?? null; } catch { /* keep raw */ }

  return json({ ok: res.ok, sid, status, to: t, mms: !!media_url, resp: txt.slice(0, 400) },
              res.ok ? 200 : 400);
});
