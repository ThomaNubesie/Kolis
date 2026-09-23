// loadq-fb-post — publishes the daily queue snapshot to the Concord Express Page.
//
//   POST {action:"preview"}      → the text that WOULD be posted, publishes nothing
//   POST {action:"post"}         → publishes the text post
//   POST {action:"post_boards"}  → publishes ONE post carrying a board image per active zone
//   POST {action:"post_photo"}   → publishes ONE image (base64) with a caption
//   POST {action:"post_flyer"}   → publishes ONE hosted image (image_url) with a caption
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
            ? `This token belongs to "${me?.name}". In GET /me/accounts, copy the access_token for page ${PAGE_ID} instead.`
            : `This is a user token. Run GET /me/accounts and copy the access_token for page ${PAGE_ID}.`,
      });
    }

    // ---- a single image post (a flyer, a poster) ------------------------------
    // Bytes are passed in rather than fetched from a URL: uploading by url= let Facebook
    // mint a photo id while rendering nothing, which is how earlier posts went out as
    // text with the images silently missing.
    // NOT renaming the Page — it cannot be done from here.
    //
    // Tried 2026-09-16: POST /{page-id} with `name` is refused with
    //   (#3) Application does not have the capability to make this API call.
    // That is an APP-level capability, not a missing scope, so no token, permission or review
    // request fixes it — Meta does not allow programmatic Page renames for standard apps.
    // The Page must be renamed by hand: Page > Settings > Page setup > Name, which Meta then
    // reviews. Recorded here so the next person does not rediscover it.

    // What the Page actually shows. Our own log records that Facebook returned a post id, which
    // is not the same as the post being visible — a post can be accepted and then restricted,
    // or land somewhere the Page owner does not look. This asks the Page itself.
    if (action === "recent") {
      if (!PAGE_TOKEN || !PAGE_ID) return json({ error: "not configured" }, 500);
      const r = await fetch(`${GRAPH}/${PAGE_ID}/posts?fields=id,created_time,message,is_published,is_hidden,privacy,permalink_url&limit=${b.limit ?? 6}&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
      const out = await r.json().catch(() => ({}));
      return json({ ok: r.ok, posts: (out?.data ?? []).map((p: any) => ({
        id: p.id, at: p.created_time, published: p.is_published, hidden: p.is_hidden,
        privacy: p?.privacy?.value ?? null, url: p.permalink_url,
        first_line: String(p.message ?? "").split("\n")[0].slice(0, 70),
      })), error: out?.error ?? null }, r.ok ? 200 : 502);
    }

    // post_flyer — one hosted image with a caption.
    //
    // The noon cron has always called this action; the function never implemented it. An
    // unknown action does not error here, it falls through to the plain text post, so on
    // 16 Sept the noon slot published the auto-generated queue summary instead of the flyer
    // and every layer reported success. That is the whole bug: a typo in an action name is
    // indistinguishable from working, because the fall-through is itself a valid post.
    //
    // Differs from post_photo only in taking a URL rather than base64 — the cron cannot carry
    // a 1.3 MB image in its body.
    // Removing one of our own posts. Requires the id to be passed in rather than read from the
    // log, so this can never sweep — one post, named explicitly, or nothing.
    if (action === "delete") {
      if (!PAGE_TOKEN) return json({ error: "not configured" }, 500);
      const id = String(b.post_id || "");
      if (!id) return json({ error: "post_id_required" }, 400);
      const r = await fetch(`${GRAPH}/${id}?access_token=${encodeURIComponent(PAGE_TOKEN)}`,
                            { method: "DELETE" });
      const o = await r.json().catch(() => ({}));
      if (r.ok && o?.success) {
        await admin.from("loadq_fb_posts").update({ error: "deleted from the Page" })
          .eq("fb_post_id", id);
      }
      return json({ ok: r.ok && !!o?.success, post_id: id, response: o }, r.ok ? 200 : 502);
    }

    if (action === "post_flyer") {
      if (!PAGE_TOKEN || !PAGE_ID) {
        return json({ error: "facebook_not_configured", need: ["LOADQ_FB_PAGE_TOKEN", "LOADQ_FB_PAGE_ID"] }, 503);
      }
      // One OR MORE images in a single story. `image_url` stays for the one-image case; pass
      // `image_urls` to attach several — the landmark flyer first, then the matching destination
      // screen, so the photo Facebook shows as the cover is the flyer.
      //
      // Multiple images cannot go through /photos with published=true: that creates one story
      // per photo. They must be uploaded UNPUBLISHED to collect media ids, then attached to a
      // single /feed post — the same shape the board post already uses.
      const urls: string[] = Array.isArray(b.image_urls) && b.image_urls.length
        ? b.image_urls.map((u: unknown) => String(u)).filter(Boolean)
        : (b.image_url ? [String(b.image_url)] : []);
      if (!urls.length) return json({ error: "image_url_or_image_urls_required" }, 400);
      const caption = String(b.caption ?? b.message ?? message);

      if (urls.length === 1) {
        const url = urls[0];
        const img = await fetch(url).catch(() => null);
        if (!img || !img.ok) {
          const m = `flyer fetch ${img?.status ?? "failed"}`;
          await admin.from("loadq_fb_posts").insert({ message: caption, error: m });
          return json({ error: m }, 502);
        }
        const blob = await img.blob();
        const fd = new FormData();
        fd.append("source", blob, url.split("/").pop() || "flyer.png");
        fd.append("caption", caption);
        fd.append("published", "true");
        fd.append("access_token", PAGE_TOKEN);

        const r = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: "POST", body: fd });
        const o = await r.json().catch(() => ({}));
        if (!r.ok || o.error) {
          const m = o?.error?.message ?? `http_${r.status}`;
          await admin.from("loadq_fb_posts").insert({ message: caption, error: String(m).slice(0, 400) });
          return json({ error: m }, 502);
        }
        await admin.from("loadq_fb_posts").insert({ message: caption, fb_post_id: o.post_id ?? o.id ?? null });
        return json({ ok: true, fb_post_id: o.post_id ?? o.id ?? null, photo_id: o.id ?? null,
                      flyer: url.split("/").pop() });
      }

      const mediaIds: string[] = [];
      const failed: string[] = [];
      for (const url of urls) {
        const img = await fetch(url).catch(() => null);
        if (!img || !img.ok) { failed.push(`${url.split("/").pop()}: fetch ${img?.status ?? "err"}`); continue; }
        const fd = new FormData();
        fd.append("source", await img.blob(), url.split("/").pop() || "image.jpg");
        fd.append("published", "false");
        fd.append("access_token", PAGE_TOKEN);
        const r = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: "POST", body: fd });
        const o = await r.json().catch(() => ({}));
        if (r.ok && o.id) mediaIds.push(o.id);
        else failed.push(`${url.split("/").pop()}: ${o?.error?.message ?? r.status}`);
      }
      // A partial upload still posts — losing the second image is far better than losing the day.
      if (!mediaIds.length) {
        const m = `no media uploaded — ${failed.join("; ")}`.slice(0, 400);
        await admin.from("loadq_fb_posts").insert({ message: caption, error: m });
        return json({ error: m }, 502);
      }

      const form = new URLSearchParams();
      form.set("message", caption);
      mediaIds.forEach((id, i) => form.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
      form.set("access_token", PAGE_TOKEN);
      const fr = await fetch(`${GRAPH}/${PAGE_ID}/feed`, { method: "POST", body: form });
      const fo = await fr.json().catch(() => ({}));
      if (!fr.ok || fo.error) {
        const m = fo?.error?.message ?? `http_${fr.status}`;
        await admin.from("loadq_fb_posts").insert({ message: caption, error: String(m).slice(0, 400) });
        return json({ error: m }, 502);
      }
      await admin.from("loadq_fb_posts").insert({ message: caption, fb_post_id: fo.id ?? null });
      return json({ ok: true, fb_post_id: fo.id ?? null, images: mediaIds.length,
                    attached: urls.map(u => u.split("/").pop()),
                    failed: failed.length ? failed : undefined });
    }

    if (action === "post_photo") {
      if (!PAGE_TOKEN || !PAGE_ID) {
        return json({ error: "facebook_not_configured", need: ["LOADQ_FB_PAGE_TOKEN", "LOADQ_FB_PAGE_ID"] }, 503);
      }
      const b64 = String(b.image_b64 || "");
      if (!b64) return json({ error: "image_b64_required" }, 400);
      const caption = String(b.caption ?? message);

      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const fd = new FormData();
      fd.append("source", new Blob([bin], { type: "image/png" }), String(b.filename || "loadq.png"));
      fd.append("caption", caption);
      fd.append("published", "true");
      fd.append("access_token", PAGE_TOKEN);

      const r = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: "POST", body: fd });
      const o = await r.json().catch(() => ({}));
      if (!r.ok || o.error) {
        const m = o?.error?.message ?? `http_${r.status}`;
        await admin.from("loadq_fb_posts").insert({ message: caption, error: String(m).slice(0, 400) });
        return json({ error: m }, 502);
      }
      await admin.from("loadq_fb_posts").insert({ message: caption, fb_post_id: o.post_id ?? o.id ?? null });
      return json({ ok: true, fb_post_id: o.post_id ?? o.id ?? null, photo_id: o.id ?? null, bytes: bin.length });
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

      // The marketing flyer leads the post: it is attached FIRST so it appears as the
      // cover photo, with the live boards following. It is a fixed hosted PNG (not a
      // live render), uploaded as bytes exactly like the boards. A flyer that fails to
      // fetch must never sink the post — the boards still go out — so we only warn.
      // The lead image on a board post: the destination flyer of the day, drawn on demand in
      // the colour of the day, so the morning post, the noon post and the TikTok frames all
      // carry one landmark and one colour. It replaces the fixed loadq-intercity-flyer.png,
      // which was navy whatever the day and never changed landmark.
      const FLYER_URL = "https://admin.loadq.ca/flyer/today";
      if (b.flyer === true) {
        const fi = await fetch(FLYER_URL).catch(() => null);
        if (fi && fi.ok) {
          const fblob = await fi.blob();
          const ffd = new FormData();
          ffd.append("source", fblob, "loadq-flyer.png");
          ffd.append("published", "false");
          ffd.append("access_token", PAGE_TOKEN);
          const frr = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: "POST", body: ffd });
          const foo = await frr.json().catch(() => ({}));
          if (frr.ok && foo.id) ids.push(foo.id);
          else failed.push(`flyer: ${foo?.error?.message ?? frr.status}`);
        } else {
          failed.push(`flyer: fetch ${fi?.status ?? "err"}`);
        }
      }

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

      // attached_media MUST be a real JSON array here — FB ignores "attached_media[0]"
      // bracket-keys in a JSON body (that syntax is form-encoded only), which silently
      // produced a text-only post with the photos uploaded but never shown.
      const body: Record<string, unknown> = { message, access_token: PAGE_TOKEN, attached_media: ids.map((id) => ({ media_fbid: id })) };
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
