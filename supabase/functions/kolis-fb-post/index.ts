// kolis-fb-post — publish one piece of the Kolis evergreen library to the Kolis Page.
//
//   POST {action:"preview"}  → the caption that WOULD go out, and which asset; publishes nothing
//   POST {action:"check"}    → confirms the token is a PAGE token for the Kolis Page
//   POST {action:"post"}     → publishes the next piece (text to /feed, flyer to /photos)
//   POST {action:"recent"}   → what the Page actually shows
//
// Separate from loadq-fb-post in every way that matters: its own table (kolis_fb_content), its
// own Page token (KOLIS_FB_PAGE_TOKEN), its own log (kolis_fb_posts). It touches nothing LoadQ
// owns. The content is a fixed library that rotates; LoadQ posts a live queue snapshot.
//
// A flyer is uploaded as BYTES to /photos, not as url=. Facebook will mint a photo id from a
// url= request while rendering nothing — the image silently missing — so the bytes are fetched
// from the public bucket and attached with multipart, the same shape Balenton settled on.
//
// WHY IT CAN DECLINE. Facebook demotes a Page that publishes byte-identical text, so a post whose
// caption matches the last successful one is refused unless {force:true}.
//
// Deploy with --no-verify-jwt: the weekday cron calls it with the shared secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAGE_TOKEN = Deno.env.get("KOLIS_FB_PAGE_TOKEN") || "";
const PAGE_ID = Deno.env.get("KOLIS_FB_PAGE_ID") || "";
// Shared operational secret the weekday cron sends as x-kolis-secret. Kept out of source: set it
// with `supabase secrets set KOLIS_NOTIFY_SECRET=...`. If it is unset the gate below fails closed.
const SECRET = Deno.env.get("KOLIS_NOTIFY_SECRET") || "";
const GRAPH = "https://graph.facebook.com/v21.0";
const BUCKET_BASE = `${SUPABASE_URL}/storage/v1/object/public/marketing/`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-kolis-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Equal bilingual: English, a blank line, French. kolis.ca appended once, only if neither
// language already names it — the rows deliberately omit it.
function caption(en: string, fr: string): string {
  const base = `${en.trim()}\n\n${fr.trim()}`;
  return /kolis\.ca/i.test(base) ? base : `${base}\n\nkolis.ca`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Fail closed: a missing SECRET must never match a missing or empty header.
  if (!SECRET || req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({} as any));
    const action = String(b.action || "preview");

    if (action === "check") {
      if (!PAGE_TOKEN || !PAGE_ID)
        return json({ ok: false, configured: false, need: ["KOLIS_FB_PAGE_TOKEN", "KOLIS_FB_PAGE_ID"] });
      const meR = await fetch(`${GRAPH}/me?fields=id,name,category&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
      const me = await meR.json().catch(() => ({} as any));
      const isPageToken = me?.id === PAGE_ID;
      return json({
        ok: isPageToken, configured: true, page_id: PAGE_ID,
        token_type: isPageToken ? "PAGE (correct)" : me?.category ? "PAGE (WRONG PAGE)" : "USER",
        token_identifies_as: me?.name ?? null,
        hint: isPageToken ? undefined
          : `Run GET /me/accounts and copy the access_token for page ${PAGE_ID}.`,
      });
    }

    if (action === "recent") {
      if (!PAGE_TOKEN || !PAGE_ID) return json({ error: "not_configured" }, 503);
      const r = await fetch(`${GRAPH}/${PAGE_ID}/posts?fields=id,created_time,message,is_published&limit=${b.limit ?? 6}&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
      const out = await r.json().catch(() => ({} as any));
      return json({ ok: r.ok, posts: out?.data ?? [], error: out?.error ?? null }, r.ok ? 200 : 502);
    }

    // ---- select the next piece --------------------------------------------------
    const { data: next, error: selErr } = await admin.rpc("kolis_fb_next");
    if (selErr) return json({ error: selErr.message }, 500);
    if (!next) return json({ error: "library_empty" }, 500);

    const msg = caption(next.body_en, next.body_fr);

    if (action === "preview") {
      return json({ ok: true, preview: true, kind: next.kind, pillar: next.pillar,
                    image: next.image_name ?? null, chars: msg.length, message: msg });
    }
    if (action !== "post") return json({ error: "unknown_action" }, 400);

    if (!PAGE_TOKEN || !PAGE_ID)
      return json({ error: "facebook_not_configured", need: ["KOLIS_FB_PAGE_TOKEN", "KOLIS_FB_PAGE_ID"] }, 503);

    // duplicate guard — the last thing that actually went out
    const { data: last } = await admin.from("kolis_fb_posts")
      .select("message").eq("ok", true).order("posted_at", { ascending: false }).limit(1);
    if (!b.force && last?.[0]?.message === msg)
      return json({ ok: false, skipped: "duplicate_of_last_post" });

    let fbId: string | null = null;
    let ok = false;
    let errText: string | null = null;

    if (next.kind === "flyer" && next.image_name) {
      // fetch the hosted bytes, attach with multipart so the image actually renders
      const imgUrl = BUCKET_BASE + next.image_name;
      const imgR = await fetch(imgUrl);
      if (!imgR.ok) { errText = `image_fetch_${imgR.status}`; }
      else {
        const blob = await imgR.blob();
        const form = new FormData();
        form.append("message", msg);
        form.append("access_token", PAGE_TOKEN);
        form.append("source", blob, next.image_name);
        const r = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: "POST", body: form });
        const out = await r.json().catch(() => ({} as any));
        ok = r.ok && (!!out.post_id || !!out.id);
        fbId = out.post_id ?? out.id ?? null;
        if (!ok) errText = out?.error?.message ?? `http_${r.status}`;
      }
    } else {
      const r = await fetch(`${GRAPH}/${PAGE_ID}/feed`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, access_token: PAGE_TOKEN }),
      });
      const out = await r.json().catch(() => ({} as any));
      ok = r.ok && !!out.id;
      fbId = out.id ?? null;
      if (!ok) errText = out?.error?.message ?? `http_${r.status}`;
    }

    await admin.from("kolis_fb_posts").insert({
      content_id: next.id, kind: next.kind, message: msg, fb_post_id: fbId, ok, error: errText,
    });
    // Only a real publish advances the rotation, so a failure is retried next time rather than skipped.
    if (ok) await admin.from("kolis_fb_content").update({ last_posted_at: new Date().toISOString() }).eq("id", next.id);

    return json({ ok, kind: next.kind, pillar: next.pillar, fb_post_id: fbId, error: errText }, ok ? 200 : 502);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
