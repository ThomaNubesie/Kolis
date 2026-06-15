// kolis-resend-signup: email a "finish setting up your Kolis account" reminder to
// someone who started signing up but never confirmed/onboarded (no profile yet).
// These users have no app session, so push can't reach them — email is the lever.
// Caller must be staff with the 'members' capability.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: allowed } = await userClient.rpc("kolis_admin_has_cap", { p_cap: "members" });
    if (!allowed) return json({ error: "forbidden" }, 403);

    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "user_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: got } = await admin.auth.admin.getUserById(user_id);
    const e = got?.user?.email;
    if (!e) return json({ error: "that account has no email to write to" }, 400);

    if (!RESEND) return json({ ok: true, sent: false, error: "email provider not configured" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: e,
        subject: "Finish setting up your Kolis account",
        text: `You started creating a Kolis account but didn't finish.\n\nOpen the Kolis app and sign in with this email (${e}) — you'll get a 6-digit code to verify and complete your profile. The first 100 members per role get founding status free (you just need to verify your identity).\n\nIf you didn't start this, you can ignore this email.`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">
          <h2 style="color:#E11D6B">Finish setting up your Kolis account</h2>
          <p>You started creating a Kolis account but didn't finish.</p>
          <p>Open the <b>Kolis app</b> and sign in with this email (<b>${e}</b>) — you'll get a 6-digit code to verify and complete your profile.</p>
          <p style="background:#fdf6e6;border:1px solid #e8b54a88;border-radius:10px;padding:11px;color:#8a6d2a;font-size:13px">The first 100 members per role get <b>founding status free</b> — you just need to verify your identity.</p>
          <p style="color:#6B6675;font-size:12.5px">If you didn't start this, you can ignore this email.</p>
        </div>`,
      }),
    });
    if (!res.ok) return json({ ok: true, sent: false, error: `from=${FROM} · ${res.status} ${await res.text()}` });
    return json({ ok: true, sent: true, email: e });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
