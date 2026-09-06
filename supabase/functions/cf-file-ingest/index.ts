// cf-file-ingest — put a document into a form's Files without a browser.
//
// The normal path is the Files tab: the browser uploads to the cf-files bucket and
// then calls cf_file_add, which stamps auth.uid() as the uploader. That is the right
// path for a person. This is for filing a document on someone's behalf — an operator
// archiving a form, a scanned register, anything that arrives outside the app.
//
// It writes the cf_files row directly rather than calling cf_file_add, because that
// RPC reads auth.uid() and a service-role call has none. The uploader is therefore
// PASSED IN and validated: it must be an active member of the form, so a file can
// never be attributed to someone who does not belong there.
//
// POST { form_id, uploader_id, name, mime?, base64, folder_id? }
// Auth: x-kolis-secret. Deploy with verify_jwt=FALSE.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const BUCKET = "cf-files";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.headers.get("x-kolis-secret") !== CF_SECRET) return json({ error: "forbidden" }, 403);
    const { form_id, uploader_id, name, mime, base64, folder_id } = await req.json().catch(() => ({} as any));
    if (!form_id || !uploader_id || !name || !base64) return json({ error: "missing_args" }, 400);

    // The uploader must actually belong to the form — otherwise the audit trail would
    // credit a document to someone with no standing in it.
    const { data: mem } = await admin.from("cf_members")
      .select("id").eq("form_id", form_id).eq("user_id", uploader_id)
      .eq("status", "active").maybeSingle();
    if (!mem) return json({ error: "uploader_not_a_member" }, 403);

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const safe = String(name).replace(/[^\w.\-]+/g, "_").slice(-70);
    const path = `${form_id}/${crypto.randomUUID()}-${safe}`;

    const up = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime || "application/octet-stream", upsert: false,
    });
    if (up.error) return json({ error: `storage: ${up.error.message}` }, 502);

    const { data: row, error } = await admin.from("cf_files").insert({
      form_id, uploader: uploader_id, name, path,
      size: bytes.length, mime: mime || "application/octet-stream",
      folder_id: folder_id || null,
    }).select("id").single();
    if (error) {
      // Do not leave an orphan object behind if the row could not be written.
      await admin.storage.from(BUCKET).remove([path]);
      return json({ error: error.message }, 500);
    }

    // Same activity entry the browser path writes, so the file's history is complete.
    // supabase-js returns a thenable BUILDER from .rpc(), not a Promise — it has no
    // .catch, so chaining one throws AFTER the file is already saved and makes a
    // successful upload look like a failure. Await it inside a try instead.
    try {
      await admin.rpc("cf__log", { p_form: form_id, p_file: row.id, p_action: "uploaded",
                                   p_meta: { name, via: "cf-file-ingest" } });
    } catch { /* the file is filed; its history entry is not worth failing over */ }

    return json({ ok: true, file_id: row.id, path, size: bytes.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
