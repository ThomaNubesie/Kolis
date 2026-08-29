// cf-send-pdf — email a client-generated form PDF to chosen recipients as a Resend attachment.
// POST { form_id, filename, pdf_base64, recipients:[email], message? }. Deploy verify_jwt=FALSE;
// admin-only enforced INSIDE. CORS must list x-client-info (supabase-js sends it).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084"; // operator send (standalone PDFs) — bypasses the form-admin JWT
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND) return json({ error: "resend_key_missing" }, 500);
    const secretOk = req.headers.get("x-kolis-secret") === CF_SECRET;
    let uid: string | null = null;
    if (!secretOk) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      uid = u.user.id;
    }
    const { form_id, filename, pdf_base64, recipients, message, title } = await req.json().catch(() => ({} as any));
    if (!pdf_base64) return json({ error: "missing_args" }, 400);
    let formName = String(title || "Quorly document");
    if (form_id) {
      const { data: form } = await admin.from("cf_forms").select("name, admin_id").eq("id", form_id).maybeSingle();
      if (form) { if (!secretOk && form.admin_id !== uid) return json({ error: "not_admin" }, 403); formName = form.name ?? formName; }
      else if (!secretOk) return json({ error: "form_not_found" }, 404);
    } else if (!secretOk) { return json({ error: "missing_args" }, 400); }
    const to = Array.from(new Set((recipients ?? []).map((e: string) => String(e).trim().toLowerCase()).filter(isEmail)));
    if (to.length === 0) return json({ error: "no_valid_recipients" }, 400);
    const fname = (filename && String(filename).endsWith(".pdf")) ? filename : `${formName.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    const body = String(message || "").trim();
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: `“${formName}” — Quorly export`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto"><div style="background:#2F3AA3;color:#fff;font-weight:800;font-size:14px;padding:12px 16px;border-radius:10px 10px 0 0">Quorly</div><div style="border:1px solid #EAE4DA;border-top:0;border-radius:0 0 12px 12px;padding:18px 16px;color:#1C1B19"><p style="font-size:14px;line-height:1.5">Attached is the export of <b>${formName}</b>.</p>${body ? `<p style="font-size:13.5px;line-height:1.5;color:#3a3833">${body.replace(/</g, "&lt;")}</p>` : ""}<p style="color:#98A0AE;font-size:11px;margin-top:14px">Sent from Quorly.</p></div></div>`,
        attachments: [{ filename: fname, content: pdf_base64 }] }) });
    if (!r.ok) return json({ ok: false, error: `resend_${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}` }, 200);
    return json({ ok: true, sent: to.length, recipients: to });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
