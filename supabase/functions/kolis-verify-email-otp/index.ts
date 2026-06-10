// Verifies a Kolis email OTP against kolis_email_otp. Deletes on success or
// expiry; caps attempts. Public (no JWT) since it runs during signup before the
// phone-auth session exists.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, otp } = await req.json();
    const e = String(email || "").toLowerCase().trim();
    if (!e || !otp) return json({ error: "Email and code are required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data } = await admin.from("kolis_email_otp").select("*").eq("email", e).maybeSingle();
    if (!data) return json({ error: "No code found. Request a new one." }, 400);
    if (Date.now() > new Date(data.expires).getTime()) {
      await admin.from("kolis_email_otp").delete().eq("email", e);
      return json({ error: "Code expired. Request a new one." }, 400);
    }
    if (data.attempts >= 5) {
      await admin.from("kolis_email_otp").delete().eq("email", e);
      return json({ error: "Too many attempts. Request a new code." }, 400);
    }
    if (String(data.otp) !== String(otp)) {
      await admin.from("kolis_email_otp").update({ attempts: data.attempts + 1 }).eq("email", e);
      return json({ error: "Wrong code — try again." }, 400);
    }
    await admin.from("kolis_email_otp").delete().eq("email", e);
    return json({ success: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
