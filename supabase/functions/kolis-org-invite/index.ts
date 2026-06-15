// Invite someone to a business org AND email them the invitation (the RPC alone
// only writes a DB row, so invitees never heard about it). Caller must be staff
// or an owner/admin of the org. They accept by signing in at the portal with the
// invited email (kolis_accept_org_invite matches on sign-in).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "no-reply@kolis.ca";
const PORTAL = Deno.env.get("KOLIS_PORTAL_URL") || "https://business.kolis.ca";
const ADMIN_PORTAL = Deno.env.get("KOLIS_ADMIN_URL") || "https://admin.kolis.ca";

async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!RESEND) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, text, html }),
  });
  return res.ok;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { org_id, email, role } = await req.json();
    const e = String(email || "").toLowerCase().trim();
    if (!EMAIL_RE.test(e) || !role) return json({ error: "a valid email and role are required" }, 400);

    // ── Staff invite (no org_id): to the admin console ──
    if (!org_id) {
      const { error: sErr } = await userClient.rpc("kolis_admin_invite", { p_email: e, p_role: role });
      if (sErr) return json({ error: sErr.message }, 400);
      const emailed = await sendMail(e,
        "You've been given access to the Kolis admin console",
        `You've been granted ${role} access to the Kolis admin console.\n\nSign in at ${ADMIN_PORTAL} using this email address (${e}). We'll email you a 6-digit code — no password needed.`,
        `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">
          <h2 style="color:#E11D6B">Kolis admin access</h2>
          <p>You've been granted <b>${role}</b> access to the Kolis admin console.</p>
          <p>Sign in with this email (<b>${e}</b>):</p>
          <p><a href="${ADMIN_PORTAL}" style="display:inline-block;background:#E11D6B;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700">Open the admin console →</a></p>
          <p style="color:#6B6675;font-size:13px">We'll email you a 6-digit code to sign in — no password needed.</p>
        </div>`);
      return json({ ok: true, emailed });
    }

    // Authorize: staff, or owner/admin of this org. Reuse the gated RPC to create
    // the invite (handles role checks + the unique-per-org conflict).
    const { data: staff } = await userClient.rpc("kolis_is_staff");
    let inviteErr;
    if (staff === true) {
      ({ error: inviteErr } = await userClient.rpc("kolis_admin_org_invite", { p_org: org_id, p_email: e, p_role: role }));
    } else {
      const { data: orole } = await userClient.rpc("kolis_org_role", { p_org: org_id });
      if (orole !== "owner" && orole !== "admin") return json({ error: "forbidden" }, 403);
      ({ error: inviteErr } = await userClient.rpc("kolis_org_invite_member", { p_org: org_id, p_email: e, p_role: role }));
    }
    if (inviteErr) return json({ error: inviteErr.message }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: org } = await admin.from("kolis_orgs").select("name").eq("id", org_id).single();
    const orgName = org?.name || "a business on Kolis";

    if (!RESEND) return json({ ok: true, emailed: false, note: "invite created; email provider not configured" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: e,
        subject: `You've been invited to ${orgName} on Kolis`,
        text: `You've been added to ${orgName} on Kolis as ${role}.\n\nTo accept, sign in at ${PORTAL} using this email address (${e}). We'll email you a 6-digit code to sign in — no password needed.\n\nIf you weren't expecting this, you can ignore this email.`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">
          <h2 style="color:#E11D6B">You're invited to ${orgName}</h2>
          <p>You've been added to <b>${orgName}</b> on Kolis as <b>${role}</b>.</p>
          <p>To accept, sign in with this email address (<b>${e}</b>):</p>
          <p><a href="${PORTAL}" style="display:inline-block;background:#E11D6B;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700">Open the Kolis portal →</a></p>
          <p style="color:#6B6675;font-size:13px">We'll email you a 6-digit code to sign in — no password needed. If you weren't expecting this, you can ignore this email.</p>
        </div>`,
      }),
    });
    if (!res.ok) return json({ ok: true, emailed: false, error: "invite created but email failed: " + (await res.text()) });
    return json({ ok: true, emailed: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
