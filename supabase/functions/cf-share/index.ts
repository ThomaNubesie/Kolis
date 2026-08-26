// cf-share — public resolver for Quorly Files share links. POST { token, password? }.
// Deploy verify_jwt=FALSE (public, unauthenticated). Uses service role to validate the link
// (cf_share_resolve enforces revoked/expiry/password) then mints a short-lived signed URL.
// The bucket stays private — nothing is exposed except a time-boxed URL for a valid token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token, password } = await req.json().catch(() => ({} as any));
    if (!token) return json({ error: "missing_token" }, 400);
    const { data, error } = await admin.rpc("cf_share_resolve", { p_token: String(token), p_password: password ? String(password) : null });
    if (error) return json({ error: "server_error" }, 500);
    const r = data as any;
    if (!r || r.error) return json({ error: r?.error || "not_found" }, r?.error === "password_required" || r?.error === "bad_password" ? 401 : 404);
    const signed = await admin.storage.from("cf-files").createSignedUrl(r.path, 900, r.allow_download ? { download: r.name } : undefined);
    if (signed.error) return json({ error: "sign_failed" }, 500);
    // Return a separate inline URL for preview (no forced download) regardless of allow_download.
    const inline = await admin.storage.from("cf-files").createSignedUrl(r.path, 900);
    return json({ ok: true, name: r.name, mime: r.mime, size: r.size, allow_download: r.allow_download, url: signed.data.signedUrl, inline_url: inline.data?.signedUrl });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
