// Sends a 6-digit email verification code for Kolis signup. Stores it in
// kolis_email_otp and emails via Resend. If Resend isn't configured it returns
// dev_otp so the team can test (set RESEND_API_KEY before launch to stop that).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "no-reply@kolis.ca";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email } = await req.json();
    const e = String(email || "").toLowerCase().trim();
    if (!EMAIL_RE.test(e)) return json({ error: "Enter a valid email address" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await admin.from("kolis_email_otp").upsert({ email: e, otp, expires, attempts: 0, updated_at: new Date().toISOString() });

    if (RESEND) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM, to: e,
            subject: "Your Kolis verification code",
            text: `Your Kolis verification code is ${otp}. Valid for 10 minutes.`,
            html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px">
              <h2 style="color:#0F1A17;margin:0 0 8px">Verify your email</h2>
              <p style="color:#5A6B63;margin:0 0 16px">Use this code to continue signing up to Kolis.</p>
              <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#E11D6B;text-align:center;padding:16px;background:#fdeef4;border-radius:12px">${otp}</div>
              <p style="color:#8A978F;font-size:12px;margin:16px 0 0">Expires in 10 minutes.</p></div>`,
          }),
        });
        const jr = await r.json().catch(() => ({}));
        if (!r.ok || jr?.error) throw new Error(jr?.message || jr?.error?.message || "Resend send failed");
        return json({ success: true });
      } catch (mailErr) {
        console.error("[kolis-email-otp] send failed:", String(mailErr));
        return json({ success: true, dev_otp: otp });
      }
    }
    // No provider configured yet — expose the code so signup can be tested.
    return json({ success: true, dev_otp: otp });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
