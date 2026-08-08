// One-off / admin custom SMS via Twilio. Guarded by x-kolis-secret (same as the
// notify pipeline). Body: { to, body }. Reuses project KOLIS_TWILIO_* secrets.
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID");
const TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
const TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "forbidden" }, 403);
    const { to, body } = await req.json();
    if (!to || !body) return json({ error: "to and body required" }, 400);
    if (!TW_SID || !TW_TOKEN || !TW_FROM) return json({ error: "twilio not configured" }, 500);
    let num = String(to).replace(/[^\d+]/g, "");
    if (!num.startsWith("+")) num = num.length === 10 ? "+1" + num : "+" + num;
    const form = new URLSearchParams({ To: num, Body: String(body) });
    if (TW_FROM.startsWith("MG")) form.set("MessagingServiceSid", TW_FROM);
    else form.set("From", TW_FROM);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const j = await res.json().catch(() => ({}));
    return json({ ok: res.ok, sid: (j as Record<string, unknown>)?.sid ?? null, twilio_status: res.status, error: (j as Record<string, unknown>)?.message ?? null }, res.ok ? 200 : 502);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
