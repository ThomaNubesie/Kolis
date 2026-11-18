// Sends a 6-digit email verification code for Kolis signup. Stores it in
// kolis_email_otp and emails via Resend. A resend re-sends the SAME code while it is
// still valid; the code is never returned to the caller unless KOLIS_OTP_DEV=true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Set KOLIS_OTP_DEV=true ONLY on a development project: it returns the code in the
// response body when mail cannot be sent.
const DEV_EXPOSE_OTP = Deno.env.get("KOLIS_OTP_DEV") === "true";
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

    // Re-send the SAME code while it is still valid, instead of minting a new one.
    // There is one row per email, so minting on every tap silently invalidated the
    // code already sitting in the customer's inbox: verify then answered it with
    // "Wrong code — try again", which reads as a bad code and makes people tap resend,
    // which invalidates the next one too. (2026-11-02: a business customer asked for
    // four codes in six minutes before getting in — all four were delivered and opened
    // within seconds; only the newest one could ever have worked.)
    const { data: live } = await admin.from("kolis_email_otp").select("otp, expires, attempts").eq("email", e).maybeSingle();
    const stillValid = live && Date.now() < new Date(live.expires).getTime() && (live.attempts ?? 0) < 5;

    const otp = stillValid ? String(live!.otp) : String(Math.floor(100000 + Math.random() * 900000));
    const expires = stillValid ? String(live!.expires) : new Date(Date.now() + 10 * 60 * 1000).toISOString();
    // attempts are NOT reset on a resend — otherwise resending would hand an attacker
    // an unlimited supply of guesses against the same code.
    if (!stillValid) {
      await admin.from("kolis_email_otp").upsert({ email: e, otp, expires, attempts: 0, updated_at: new Date().toISOString() });
    }

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
              <div style="margin:0 0 16px"><img src="https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png" width="46" height="46" alt="Kolis" style="border-radius:11px;display:block"/></div>
              <h2 style="color:#0F1A17;margin:0 0 8px">Verify your email</h2>
              <p style="color:#5A6B63;margin:0 0 16px">Use this code to continue signing up to Kolis.</p>
              <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#E11D6B;text-align:center;padding:16px;background:#fdeef4;border-radius:12px">${otp}</div>
              <p style="color:#8A978F;font-size:12px;margin:16px 0 0">Expires in 10 minutes.</p>
              <p style="color:#8A978F;font-size:12px;margin:6px 0 0">Operated by Concord Express Co Inc. · support@concordexpress.ca</p></div>`,
          }),
        });
        const jr = await r.json().catch(() => ({}));
        if (!r.ok || jr?.error) throw new Error(jr?.message || jr?.error?.message || "Resend send failed");
        return json({ success: true });
      } catch (mailErr) {
        console.error("[kolis-email-otp] send failed:", String(mailErr));
        // NEVER hand the code back to the caller on a mail failure: this code is what
        // gates account access, and anyone can POST an address here. Only an explicit
        // dev flag may expose it.
        if (DEV_EXPOSE_OTP) return json({ success: true, dev_otp: otp });
        return json({ error: "Could not send the code. Please try again." }, 502);
      }
    }
    // No provider configured. Same rule: the code is only returned when this
    // deployment is explicitly marked as a development one.
    if (DEV_EXPOSE_OTP) return json({ success: true, dev_otp: otp });
    console.error("[kolis-email-otp] RESEND_API_KEY is not set — cannot send codes");
    return json({ error: "Email sending is not configured." }, 500);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
