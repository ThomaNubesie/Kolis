// loadq-fb-post — publishes the daily queue snapshot to the Concord CarPool Page.
//
//   POST {action:"preview"}      → the text that WOULD be posted, publishes nothing
//   POST {action:"post"}         → publishes the text post
//   POST {action:"post_boards"}  → publishes ONE post carrying a board image per active zone
//
// The text is composed in the database (loadq_fb_daily_text), not here, so the wording
// can be changed without redeploying a function, and so the same text can be previewed
// from SQL before it ever reaches Facebook.
//
// WHY IT CAN DECLINE TO POST. Facebook's own spam heuristics demote a Page that publishes
// near-identical content day after day, so this refuses to publish text byte-identical to
// the previous post unless {force:true}. On a day when the queue has not changed, silence
// costs nothing; a duplicate costs reach on every future post.
//
// Deploy with --no-verify-jwt: pg_cron calls it with the shared secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAGE_TOKEN = Deno.env.get("LOADQ_FB_PAGE_TOKEN") || "";
const PAGE_ID = Deno.env.get("LOADQ_FB_PAGE_ID") || "";
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const GRAPH = "https://graph.facebook.com/v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-kolis-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-kolis-secret") !== CF_SECRET) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({} as any));
    const action = String(b.action || "preview");

    const { data: message, error } = await admin.rpc("loadq_fb_daily_text");
    if (error) return json({ error: error.message }, 500);
    if (!message) return json({ error: "empty_message" }, 500);

    if (action === "preview") return json({ ok: true, preview: true, chars: message.length, message });

    // Confirms the token resolves to the page we intend, and publishes nothing. Worth a
    // round trip: this account administers four pages, and a token for the wrong one
    // authenticates perfectly well while posting somewhere it should not.
    if (action === "check") {
      if (!PAGE_TOKEN || !PAGE_ID) return json({ ok: false, configured: false, need: ["LOADQ_FB_PAGE_TOKEN", "LOADQ_FB_PAGE_ID"] });
      const r = await fetch(`${GRAPH}/${PAGE_ID}?fields=name,fan_count&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
      const o = await r.json().catch(() => ({}));
      if (!r.ok || o.error) return json({ ok: false, configured: true, error: o?.error?.message ?? `http_${r.status}` });
      // Reading the page works with EITHER token type, so that alone proves nothing.
      // /me is the discriminator: a PAGE token identifies as the page, a USER token
      // identifies as the person — and only the former may publish as the page.
      const meR = await fetch(`${GRAPH}/me?fields=id,name,category&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
      const me = await meR.json().catch(() => ({}));
      // A page token's /me returns the PAGE (which carries a category); a user token's
      // returns the person. Both fail to publish here unless the page is the right one,
      // so the diagnostic has to separate "not a page token" from "wrong page".
      const isPage = !!me?.category;
      const isPageToken = me?.id === PAGE_ID;
      return json({
        ok: isPageToken, configured: true,
        page_id: o.id, page_name: o.name, followers: o.fan_count ?? null,
        token_type: isPageToken ? "PAGE (correct)" : isPage ? "PAGE (WRONG PAGE)" : "USER",
        token_identifies_as: me?.name ?? null,
        hint: isPageToken ? undefined
          : isPage
            ? `This token belongs to "${me?.name}". In GET /me/accounts, copy the access_token from the Concord CarPool entry instead.`
            : "This is a user token. Run GET /me/accounts and copy the access_token from the Concord CarPool entry.",
      });
    }

    // ---- one post, one image per active zone ---------------------------------
    if (action === "post_boards") {
      if (!PAGE_TOKEN || !PAGE_ID) {
        return json({ error: "facebook_not_configured", need: ["LOADQ_FB_PAGE_TOKEN", "LOADQ_FB_PAGE_ID"] }, 503);
      }
      const { data: boards, error: berr } = await admin.rpc("loadq_board_public");
      if (berr) return json({ error: berr.message }, 500);
      const list = (boards ?? []) as { zone_id: string; zone: string }[];
      if (!list.length) return json({ ok: true, skipped: "no_active_boards" });

      // Facebook builds a multi-photo post in two steps: upload each image unpublished to
      // collect its media id, then create ONE feed story that attaches them. Uploading by
      // URL means Facebook fetches admin.loadq.ca itself — no image bytes pass through
      // this function, which is what kept the render out of memory trouble.
      const ids: string[] = [];
      const failed: string[] = [];
      for (const b of list) {
        const url = `https://admin.loadq.ca/board/${encodeURIComponent(b.zone_id)}`;
        // Upload the actual PNG BYTES (multipart), not a url= for FB to fetch. Fetching by
        // url let Facebook create a photo id while silently rendering nothing (the post
        // showed no image); uploading the bytes we fetched ourselves guarantees the image.
        const img = await fetch(url).catch(() => null);
        if (!img || !img.ok) { failed.push(`${b.zone}: board fetch ${img?.status ?? "err"}`); continue; }
        const blob = await img.blob();
        const fd = new FormData();
        fd.append("source", blob, `${b.zone_id}.png`);
        fd.append("published", "false");
        fd.append("access_token", PAGE_TOKEN);
        const r = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: "POST", body: fd });
        const o = await r.json().catch(() => ({}));
        if (r.ok && o.id) ids.push(o.id); else failed.push(`${b.zone}: ${o?.error?.message ?? r.status}`);
      }
      if (!ids.length) {
        await admin.from("loadq_fb_posts").insert({ message, error: `no images uploaded — ${failed.join(" | ")}`.slice(0, 400) });
        return json({ error: "no_images_uploaded", detail: failed }, 502);
      }

      const body: Record<string, unknown> = { message, access_token: PAGE_TOKEN };
      ids.forEach((id, i) => { body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
      const fr = await fetch(`${GRAPH}/${PAGE_ID}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const fo = await fr.json().catch(() => ({}));
      if (!fr.ok || fo.error) {
        const m = fo?.error?.message ?? `http_${fr.status}`;
        await admin.from("loadq_fb_posts").insert({ message, error: String(m).slice(0, 400) });
        return json({ error: m }, 502);
      }
      await admin.from("loadq_fb_posts").insert({ message, fb_post_id: fo.id ?? null });
      // Partial failures are reported, never swallowed: three of four boards posting is
      // a result the caller needs to see, not a success.
      return json({ ok: true, fb_post_id: fo.id ?? null, images: ids.length, failed });
    }

    if (!PAGE_TOKEN || !PAGE_ID) {
      // Loud, not silent. A missing secret is the failure mode that let the outreach
      // campaign report success for five days while sending nothing.
      return json({ error: "facebook_not_configured", need: ["LOADQ_FB_PAGE_TOKEN", "LOADQ_FB_PAGE_ID"] }, 503);
    }

    // Refuse an exact repeat of the last published post.
    const { data: last } = await admin.from("loadq_fb_posts")
      .select("message").order("posted_at", { ascending: false }).limit(1).maybeSingle();
    if (!b.force && last?.message === message) {
      await admin.from("loadq_fb_posts").insert({ message, skipped: "duplicate" });
      return json({ ok: true, skipped: "duplicate_of_last_post" });
    }

    const r = await fetch(`${GRAPH}/${PAGE_ID}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
    });
    const out = await r.json().catch(() => ({}));

    if (!r.ok || out.error) {
      const msg = out?.error?.message ?? `http_${r.status}`;
      await admin.from("loadq_fb_posts").insert({ message, error: String(msg).slice(0, 400) });
      return json({ error: msg, fb_code: out?.error?.code ?? null }, 502);
    }

    await admin.from("loadq_fb_posts").insert({ message, fb_post_id: out.id ?? null });
    return json({ ok: true, fb_post_id: out.id ?? null, chars: message.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
