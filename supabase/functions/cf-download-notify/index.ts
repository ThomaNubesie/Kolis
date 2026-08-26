// cf-download-notify — email the form admin when a member requests to download a file.
// POST { file_id, base_url }. Deploy verify_jwt=FALSE; the caller's Bearer JWT is validated inside
// and must be an active member of the file's form.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND) return json({ error: "resend_key_missing" }, 500);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const uid = u.user.id;
    const body = await req.json().catch(() => ({} as any));
    const type = body.target_type || (body.file_id ? "file" : "");
    const id = body.target_id || body.file_id;
    if (!id) return json({ error: "missing_target" }, 400);
    let formId = ""; let name = "";
    if (type === "receipt") {
      const { data: rc } = await admin.from("cf_receipts").select("form_id, merchant").eq("id", id).maybeSingle();
      if (!rc) return json({ error: "not_found" }, 404); formId = rc.form_id; name = "Receipt · " + (rc.merchant || "receipt");
    } else {
      const { data: f } = await admin.from("cf_files").select("form_id, name").eq("id", id).maybeSingle();
      if (!f) return json({ error: "not_found" }, 404); formId = f.form_id; name = f.name;
    }
    const file = { form_id: formId, name };
    const { data: mem } = await admin.from("cf_members").select("id, name").eq("form_id", file.form_id).eq("user_id", uid).eq("status", "active").maybeSingle();
    if (!mem) return json({ error: "forbidden" }, 403);
    const { data: form } = await admin.from("cf_forms").select("name, admin_id").eq("id", file.form_id).maybeSingle();
    if (!form) return json({ error: "form_not_found" }, 404);
    const { data: adminMem } = await admin.from("cf_members").select("email, name").eq("form_id", file.form_id).eq("user_id", form.admin_id).maybeSingle();
    const to = adminMem?.email;
    if (!to) return json({ ok: false, error: "admin_no_email" });
    const who = mem.name || "A member";
    const base = (base_url || "https://quorly.ca").replace(/\/$/, "");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto"><div style="background:#2F3AA3;color:#fff;font-weight:800;font-size:14px;padding:12px 16px;border-radius:10px 10px 0 0">Quorly</div><div style="border:1px solid #EAE4DA;border-top:0;border-radius:0 0 12px 12px;padding:18px 16px;color:#1C1B19"><p style="font-size:14px;line-height:1.5"><b>${who}</b> requested to download <b>${file.name}</b> in <b>${form.name}</b>.</p><a href="${base}/forms?open=${file.form_id}" style="display:inline-block;background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:11px 18px;border-radius:10px;margin-top:6px">Review & approve</a><p style="color:#98A0AE;font-size:11px;margin-top:14px;border-top:1px solid #EAE4DA;padding-top:10px">Approve or decline in the form's Download requests panel.</p></div></div>`;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject: `Download request: “${file.name}”`, html }) });
    return json({ ok: r.ok });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
