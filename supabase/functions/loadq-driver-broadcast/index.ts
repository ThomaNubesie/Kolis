// loadq-driver-broadcast — one message to every driver who should get it.
//
// The recipient list is built HERE, from the database, and never accepted from the caller.
// A broadcast endpoint that takes a list of numbers is a spam gun with a company's Twilio
// account behind it; this one can only ever reach LoadQ drivers.
//
// Blocked accounts are excluded. Someone blocked for threatening a person should not receive
// company messaging, and someone blocked over paperwork is already being told by the app.
//
// POST { message, dry_run?, limit?, offset? }   x-kolis-secret required
// dry_run returns exactly who WOULD be messaged, and sends nothing. Use it every time.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATE = "kolis_notify_9f3a2c7b1e6d4084";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== GATE) return json({ ok: false, error: "forbidden" }, 403);

  const SID = Deno.env.get("KOLIS_TWILIO_SID");
  const TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
  const FROM = Deno.env.get("KOLIS_TWILIO_FROM");
  if (!SID || !TOKEN || !FROM) return json({ ok: false, error: "twilio_not_configured" }, 500);

  const b = await req.json().catch(() => ({} as any));
  const message = String(b.message ?? "").trim();
  if (!message) return json({ ok: false, error: "message required" }, 400);

  const db = createClient(URL_, SRK, { auth: { persistSession: false } });
  const { data: rows, error } = await db.from("drivers")
    .select("id, full_name, phone")
    .not("phone", "is", null)
    .or("blocked.is.null,blocked.eq.false")
    .or("is_admin.is.null,is_admin.eq.false")
    .order("full_name")
    .range(b.offset ?? 0, (b.offset ?? 0) + ((b.limit ?? 500) - 1));
  if (error) return json({ ok: false, error: error.message }, 500);

  // De-duplicate by number: two accounts sharing a phone should not buzz it twice.
  const seen = new Set<string>();
  const people = (rows ?? []).filter((r: any) => {
    const t = String(r.phone).replace(/[^\d]/g, "").slice(-10);
    if (t.length < 10 || seen.has(t)) return false;
    seen.add(t); return true;
  });

  if (b.dry_run) {
    return json({ ok: true, dry_run: true, would_send: people.length,
      segments_each: Math.ceil(message.length / 153),
      sample: people.slice(0, 5).map((p: any) => p.full_name) });
  }

  let sent = 0; const failed: any[] = [];
  for (const p of people) {
    let t = String(p.phone).replace(/[^\d+]/g, "");
    if (!t.startsWith("+")) t = t.length === 10 ? "+1" + t : "+" + t;
    const f = new URLSearchParams({ To: t, Body: message });
    FROM.startsWith("MG") ? f.set("MessagingServiceSid", FROM) : f.set("From", FROM);
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(`${SID}:${TOKEN}`),
                   "Content-Type": "application/x-www-form-urlencoded" },
        body: f.toString(),
      });
      if (r.ok) sent++;
      else failed.push({ name: p.full_name, status: r.status,
                         why: (await r.text().catch(() => "")).slice(0, 120) });
    } catch (e) {
      failed.push({ name: p.full_name, why: String((e as Error)?.message ?? e) });
    }
  }
  return json({ ok: true, sent, failed_count: failed.length, failed: failed.slice(0, 12) });
});
