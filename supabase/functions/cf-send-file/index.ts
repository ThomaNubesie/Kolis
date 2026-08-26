// cf-send-file — send a Quorly file to someone: either a secure share LINK (default, recommended)
// or as an email ATTACHMENT. POST { file_id, to:[email], message?, mode:'link'|'attach', base_url? }.
// Deploy verify_jwt=FALSE; the caller's Bearer JWT is validated INSIDE and must be an active member
// of the file's form/vault. Link mode reuses (or mints) a share link so access stays revocable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const b64url = (n: number) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return encodeBase64(a).replace(/\//g, "_").replace(/\+/g, "-").replace(/=+$/, ""); };

function shell(inner: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto"><div style="background:#2F3AA3;color:#fff;font-weight:800;font-size:14px;padding:12px 16px;border-radius:10px 10px 0 0">Quorly</div><div style="border:1px solid #EAE4DA;border-top:0;border-radius:0 0 12px 12px;padding:18px 16px;color:#1C1B19">${inner}<p style="color:#98A0AE;font-size:11px;margin-top:14px;border-top:1px solid #EAE4DA;padding-top:10px">Sent securely via Quorly · quorly.ca</p></div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND) return json({ error: "resend_key_missing" }, 500);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const uid = u.user.id;
    const { file_id, to, message, mode, base_url } = await req.json().catch(() => ({} as any));
    if (!file_id) return json({ error: "missing_file" }, 400);
    const recips = Array.from(new Set((to ?? []).map((e: string) => String(e).trim().toLowerCase()).filter(isEmail)));
    if (recips.length === 0) return json({ error: "no_valid_recipients" }, 400);

    const { data: file } = await admin.from("cf_files").select("form_id, name, path, mime, size, deleted_at, encrypted").eq("id", file_id).maybeSingle();
    if (!file || file.deleted_at) return json({ error: "file_not_found" }, 404);
    if (file.encrypted) return json({ error: "cannot_send_encrypted" }, 400);  // server can't decrypt E2E files
    const { data: mem } = await admin.from("cf_members").select("id").eq("form_id", file.form_id).eq("user_id", uid).eq("status", "active").maybeSingle();
    if (!mem) return json({ error: "forbidden" }, 403);
    const note = String(message || "").trim();
    const noteHtml = note ? `<p style="font-size:13.5px;line-height:1.5;color:#3a3833">${note.replace(/</g, "&lt;")}</p>` : "";

    let payload: any;
    if (mode === "attach") {
      if ((file.size ?? 0) > 20 * 1024 * 1024) return json({ error: "too_large_for_attach" }, 400);
      const dl = await admin.storage.from("cf-files").download(file.path);
      if (dl.error || !dl.data) return json({ error: "download_failed" }, 500);
      const b64 = encodeBase64(new Uint8Array(await dl.data.arrayBuffer()));
      payload = { from: FROM, to: recips, subject: `A file was shared with you: ${file.name}`,
        html: shell(`<p style="font-size:14px;line-height:1.5">Someone shared <b>${file.name}</b> with you via Quorly. It's attached to this email.</p>${noteHtml}`),
        attachments: [{ filename: file.name, content: b64 }] };
    } else {
      // link mode (default): reuse an active link or mint one
      let token: string | null = null;
      const { data: existing } = await admin.from("cf_share_links").select("token").eq("file_id", file_id).eq("revoked", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing?.token) token = existing.token;
      else { token = b64url(9); await admin.from("cf_share_links").insert({ file_id, form_id: file.form_id, token, created_by: uid, allow_download: true }); }
      const base = (base_url || "https://quorly.ca").replace(/\/$/, "");
      const url = `${base}/s/${token}`;
      payload = { from: FROM, to: recips, subject: `A file was shared with you: ${file.name}`,
        html: shell(`<p style="font-size:14px;line-height:1.5">Someone shared <b>${file.name}</b> with you via Quorly.</p><a href="${url}" style="display:inline-block;background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:11px 18px;border-radius:10px;margin-top:6px">Open the file</a>${noteHtml}<p style="color:#98A0AE;font-size:11px;margin-top:12px">Link: ${url}</p>`) };
    }
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) return json({ ok: false, error: `resend_${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}` }, 200);
    return json({ ok: true, sent: recips.length, mode: mode === "attach" ? "attach" : "link" });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
