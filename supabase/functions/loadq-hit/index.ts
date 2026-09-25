// loadq-hit — counts a visit to loadq.ca, and where it came from.
//
//   POST { v, p: "/get", r: "https://l.facebook.com/", s: "fb-noon", ... }   the page opened
//   POST { v, t: 47 }                                                        it was left, 47 s later
//
// Facebook can tell you 344 engagements and 3 new followers; it cannot tell you whether anyone
// arrived. This does: one row per page view, with the campaign tag carried in the link
// (loadq.ca/?s=tk-board) and the referrer's HOST if there is no tag.
//
// The two calls are matched by `v`, a random id the page makes per PAGE VIEW. It is not a
// visitor id: it is never reused, so two visits by the same person cannot be joined.
//
// What it deliberately does NOT store: no IP, no cookie, no persistent id, no full referrer URL
// (only its host) and no user agent string — just "phone" or "desktop". Nothing here identifies a
// person, which is why loadq.ca needs no consent banner for it.
//
// Deploy with --no-verify-jwt: the page calls it with no Authorization header.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const clip = (v: unknown, n: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, n) : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "post_only" }, 405);

  const b = await req.json().catch(() => ({} as Record<string, unknown>));

  // The referrer is reduced to its host before it is stored: "l.facebook.com" tells you the
  // channel, the full URL would carry whatever the other site put in its query string.
  let refHost: string | null = null;
  const ref = clip(b.r, 400);
  if (ref) {
    try { refHost = new URL(ref).hostname.replace(/^www\./, "").slice(0, 120); } catch { refHost = null; }
  }
  // Our own pages are not a source of traffic.
  if (refHost && /(^|\.)loadq\.ca$/.test(refHost)) refHost = null;

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const visit = clip(b.v, 64);

  // The second call: how long they stayed. It updates the row the first call wrote, and is
  // capped at an hour — a tab left open overnight is not a reader.
  const secs = typeof b.t === "number" && isFinite(b.t) ? Math.round(b.t) : null;
  if (secs !== null) {
    if (!visit) return json({ error: "visit_required" }, 400);
    if (secs < 1 || secs > 3600) return json({ ok: true, ignored: "out_of_range" });
    const { error: upErr } = await admin.from("loadq_hit")
      .update({ dwell_s: secs }).eq("visit_id", visit).is("dwell_s", null);
    if (upErr) return json({ error: upErr.message }, 500);
    return json({ ok: true, dwell: secs });
  }

  const { error } = await admin.from("loadq_hit").insert({
    visit_id: visit,
    path: clip(b.p, 200),
    ref_host: refHost,
    source: clip(b.s, 60),
    medium: clip(b.m, 60),
    campaign: clip(b.c, 60),
    device: b.d === "phone" || b.d === "tablet" ? String(b.d) : "desktop",
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
