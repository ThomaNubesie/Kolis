// JSON API for the clickable drop-off page (hosted separately).
// GET  ?t=<token>          -> { code, from_city, to_city, dropoff_slot }
// POST { t, block, spot }  -> validates token, saves choice to dropoff_slot, { ok:true }
// Token-gated (dropoff_token); no login. CORS open so the static page can call it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BLOCKS = ["11:00 AM – 12:00 PM","12:00 – 1:00 PM","1:00 – 2:00 PM","2:00 – 3:00 PM","3:00 – 4:00 PM","4:00 – 5:00 PM"];
const ZONES  = ["Great Hall (main clock)","GO Concourse","VIA Rail Concourse","Front St entrance"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t") || (req.method === "POST" ? "" : "");
    let t = token;
    let block = "", spot = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      t = body.t || token; block = body.block || ""; spot = body.spot || "";
    }
    if (!t) return json({ error: "missing token" }, 400);

    const { data: p } = await admin.from("kolis_parcels")
      .select("id, code, from_city, to_city, dropoff_slot").eq("dropoff_token", t).maybeSingle();
    if (!p) return json({ error: "not_found" }, 404);

    if (req.method === "POST") {
      if (!BLOCKS.includes(block) || !ZONES.includes(spot)) return json({ error: "pick a block and a spot" }, 400);
      const slot = `Today ${block} · Union Station — ${spot}`;
      await admin.from("kolis_parcels").update({ dropoff_slot: slot }).eq("id", p.id);
      // Alert dispatch (Concord Express) with the chosen slot.
      const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
      if (TW_SID && TW_TOKEN && TW_FROM) {
        const b = new URLSearchParams({ To: "+16138622639", Body: `Kolis · ${p.code} drop-off set: ${slot}` });
        TW_FROM.startsWith("MG") ? b.set("MessagingServiceSid", TW_FROM) : b.set("From", TW_FROM);
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" }, body: b.toString() }).catch(() => {});
      }
      return json({ ok: true, saved: slot });
    }
    return json({ code: p.code, from_city: p.from_city, to_city: p.to_city, dropoff_slot: p.dropoff_slot, blocks: BLOCKS, zones: ZONES });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
