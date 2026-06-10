// Emails the Kolis onboarding receipt to the user's verified email (from their
// profile). Uses Resend; no-ops gracefully if Resend isn't configured.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "no-reply@kolis.ca";

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

    const { receiptId, lines, total, date } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: prof } = await admin.from("kolis_profiles").select("email").eq("id", user.id).maybeSingle();
    const to = prof?.email;
    if (!to) return json({ error: "No email on file" }, 400);
    if (!RESEND) return json({ ok: true, skipped: true });

    const rows = (lines || []).map((l: any) =>
      `<tr><td style="padding:6px 0;color:#5A6B63">${l.label}</td><td style="padding:6px 0;text-align:right;color:#0F1A17">${l.amount}</td></tr>`).join("");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:24px">
      <h2 style="color:#0F1A17;margin:0 0 4px">Your Kolis receipt</h2>
      <p style="color:#8A978F;font-size:12px;margin:0 0 18px">Receipt ${receiptId || ""} · ${date || ""}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
        <tr><td style="padding:10px 0;font-weight:800;border-top:1px solid #eee">Total</td>
        <td style="padding:10px 0;text-align:right;font-weight:800;color:#E11D6B;border-top:1px solid #eee">${total}</td></tr>
      </table>
      <p style="color:#8A978F;font-size:12px;margin:18px 0 0">Thank you for joining Kolis.</p></div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: `Your Kolis receipt ${receiptId || ""}`.trim(), text: `Kolis receipt ${receiptId || ""} — Total ${total}.`, html }),
    });
    const jr = await r.json().catch(() => ({}));
    if (!r.ok || jr?.error) return json({ error: jr?.message || "Could not email the receipt." }, 503);
    return json({ ok: true, emailed_to: to });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
