// loadq-asset-put — put one marketing image in the bucket.
//
// Narrow on purpose. The service-role key can write anywhere, so this refuses to be a general
// file-writing endpoint: the bucket is fixed to `marketing`, the path is sanitised to a flat
// filename, and only images are accepted. Gated by x-kolis-secret like the other operational
// functions.
//
// It exists because uploading a flyer otherwise means pasting a service-role key somewhere it
// should never go.
//
// POST { name: "loadq-intercity-flyer.png", base64: "...", content_type?: "image/png" }
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATE = "kolis_notify_9f3a2c7b1e6d4084";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== GATE) return json({ ok: false, error: "forbidden" }, 403);
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const b = await req.json().catch(() => ({} as any));
  // Flat filename only: no slashes, no traversal, no writing outside the bucket root.
  const name = String(b.name ?? "").replace(/[^a-zA-Z0-9._-]/g, "");
  const type = String(b.content_type ?? "image/png");
  if (!name || !/\.(png|jpe?g|webp)$/i.test(name))
    return json({ ok: false, error: "name must be a flat .png/.jpg/.webp filename" }, 400);
  if (!/^image\/(png|jpeg|webp)$/.test(type))
    return json({ ok: false, error: "images only" }, 400);
  if (!b.base64) return json({ ok: false, error: "base64 required" }, 400);

  let bytes: Uint8Array;
  try {
    const bin = atob(String(b.base64));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return json({ ok: false, error: "base64 did not decode" }, 400); }

  const db = createClient(URL_, SRK, { auth: { persistSession: false } });
  const { error } = await db.storage.from("marketing")
    .upload(name, bytes, { contentType: type, upsert: true });
  if (error) return json({ ok: false, error: error.message }, 500);

  const { data } = db.storage.from("marketing").getPublicUrl(name);
  return json({ ok: true, name, bytes: bytes.length, url: data.publicUrl });
});
