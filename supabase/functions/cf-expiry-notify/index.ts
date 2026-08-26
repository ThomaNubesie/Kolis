// cf-expiry-notify — daily scan: email owners before their documents expire (30/14/7/1/0 days).
// Cron-invoked; gated by x-kolis-secret. Deploy verify_jwt=FALSE. Idempotent via cf_file_reminders.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@loadq.ca>";
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function body(name: string, days: number, on: string) {
  const when = days <= 0 ? "expires <b>today</b>" : days === 1 ? "expires <b>tomorrow</b>" : `expires in <b>${days} days</b>`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:460px;margin:0 auto"><div style="background:#2F3AA3;color:#fff;font-weight:800;font-size:14px;padding:12px 16px;border-radius:10px 10px 0 0">Quorly</div><div style="border:1px solid #EAE4DA;border-top:0;border-radius:0 0 12px 12px;padding:18px 16px;color:#1C1B19"><p style="font-size:14px;line-height:1.5">Your document <b>${name}</b> ${when} <span style="color:#6B6863">(on ${on})</span>.</p><a href="https://quorly.ca" style="display:inline-block;background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:11px 18px;border-radius:10px;margin-top:6px">Open My Files</a><p style="color:#98A0AE;font-size:11px;margin-top:14px;border-top:1px solid #EAE4DA;padding-top:10px">You're getting this because you set an expiry date on this document in Quorly.</p></div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.headers.get("x-kolis-secret") !== SECRET) return json({ error: "unauthorized" }, 401);
  if (!RESEND) return json({ error: "resend_key_missing" }, 500);
  const { data: due, error } = await admin.rpc("cf_expiry_due");
  if (error) return json({ error: String(error.message) }, 500);
  const rows = (due ?? []).filter((r: any) => r.days_before !== null && r.owner_email);
  let sent = 0; const fails: any[] = [];
  for (const r of rows) {
    try {
      const resp = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: r.owner_email, subject: `Reminder: “${r.name}” ${r.days_before <= 0 ? "expires today" : "expires soon"}`, html: body(r.name, r.days_before, r.expires_at) }) });
      if (resp.ok) { await admin.rpc("cf_expiry_mark", { p_file: r.file_id, p_days: r.days_before }); sent++; }
      else fails.push({ file: r.file_id, error: `resend_${resp.status}` });
    } catch (e) { fails.push({ file: r.file_id, error: String(e) }); }
  }
  return json({ ok: true, scanned: rows.length, sent, fails });
});
