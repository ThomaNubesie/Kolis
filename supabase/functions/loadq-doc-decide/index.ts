// loadq-doc-decide — the human certification step, and the message it sends.
//
// The page could call loadq_doc_certify() directly from the browser; the reason it does not is
// the send-back. A rejection has to reach the driver by SMS, and putting Twilio within reach
// of the browser would mean any signed-in account could send whatever it liked to whatever
// number it liked.
//
// So the authorisation is not re-implemented here — it is borrowed. This runs the RPC AS THE
// CALLER, using their own access token, and the RPC's existing admin check decides. The SMS
// only happens after that call comes back ok, to a number looked up server-side rather than
// one the browser supplied.
//
// Verified: no token -> 401, a valid non-admin token -> forbidden 403 with NO SMS sent.
//
// POST { doc_id, approve, notes?, expires_on? }   Authorization: Bearer <the admin's token>
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*",
               "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function sms(to: string, body: string) {
  const SID = Deno.env.get("KOLIS_TWILIO_SID");
  const TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN");
  const FROM = Deno.env.get("KOLIS_TWILIO_FROM");
  if (!SID || !TOKEN || !FROM) return { ok: false, error: "twilio_not_configured" };

  let t = String(to).replace(/[^\d+]/g, "");
  if (!t.startsWith("+")) t = t.length === 10 ? "+1" + t : "+" + t;

  const f = new URLSearchParams({ To: t, Body: body });
  FROM.startsWith("MG") ? f.set("MessagingServiceSid", FROM) : f.set("From", FROM);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${SID}:${TOKEN}`),
               "Content-Type": "application/x-www-form-urlencoded" },
    body: f.toString(),
  });
  const txt = await res.text();
  let sid: string | null = null;
  try { sid = JSON.parse(txt).sid ?? null; } catch { /* keep raw */ }
  return { ok: res.ok, sid, to: t };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ ok: false, error: "no_token" }, 401);

  const { doc_id, approve, notes, expires_on } = await req.json().catch(() => ({} as any));
  if (!doc_id || typeof approve !== "boolean")
    return json({ ok: false, error: "missing doc_id/approve" }, 400);

  // As the caller. If they are not an admin the RPC says forbidden and nothing else runs.
  const asUser = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await asUser.rpc("loadq_doc_certify", {
    p_doc: doc_id, p_approve: approve,
    p_notes: notes ?? null, p_expires_on: expires_on || null,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!data?.ok) return json(data, data?.error === "forbidden" ? 403 : 400);

  // Approving is quiet on purpose. A driver does not need a message every time one of seven
  // documents clears — they need one when the LAST one does, and that is what the verified
  // flip is for. Only a send-back has to be said out loud.
  if (approve) return json({ ...data, notified: false });

  const db = createClient(URL_, SRK, { auth: { persistSession: false } });
  const { data: d } = await db.from("loadq_driver_documents")
    .select("doc_type, driver_id").eq("id", doc_id).maybeSingle();
  const { data: who } = await db.from("drivers")
    .select("phone").eq("id", (d as any)?.driver_id).maybeSingle();
  const phone = (who as any)?.phone;
  if (!phone) return json({ ...data, notified: false, why: "no_phone" });

  const { data: kind } = await db.from("loadq_doc_kinds")
    .select("label_fr, label_en").eq("doc_type", (d as any).doc_type).maybeSingle();
  const fr = (kind as any)?.label_fr ?? (d as any).doc_type;
  const en = (kind as any)?.label_en ?? (d as any).doc_type;

  const reason = (notes ?? "").trim();
  const body =
`LoadQ - votre document (${fr}) n'a pas pu etre accepte :
${reason}

Reprenez la photo dans l'application LoadQ.

Your ${en} could not be accepted. Please re-upload it in the LoadQ app.`;

  const sent = await sms(phone, body);
  return json({ ...data, notified: sent.ok, sms: sent });
});
