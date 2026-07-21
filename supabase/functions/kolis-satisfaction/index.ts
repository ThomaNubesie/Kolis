// kolis-satisfaction: send a post-delivery satisfaction survey for one parcel.
// Called by the delivered-status DB trigger (pg_net) with a bearer that must
// match KOLIS_CRON_SECRET. Sends a branded email with 1–5 star links pointing at
// kolis-rate, marks the parcel, and logs to kolis_email_events. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const CRON_SECRET = Deno.env.get("KOLIS_CRON_SECRET") || "";
const LOGO = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!CRON_SECRET || bearer !== CRON_SECRET) return json({ error: "unauthorized" }, 401);
    const { parcel_id } = await req.json().catch(() => ({}));
    if (!parcel_id) return json({ error: "parcel_id required" }, 400);
    if (!RESEND) return json({ error: "no_resend" }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id, code, org_id, client_id, recipient_name, recipient_email, satisfaction_token, satisfaction_email_sent_at")
      .eq("id", parcel_id).single();
    if (!p) return json({ error: "parcel_not_found" }, 404);
    if (p.satisfaction_email_sent_at) return json({ ok: true, skipped: "already_sent" });
    if (!p.recipient_email) return json({ ok: true, skipped: "no_email" });

    const { data: orgRow } = await admin.from("kolis_orgs").select("name").eq("id", p.org_id).single();
    const orgName = orgRow?.name || "your sender";
    const first = String(p.recipient_name || "").trim().split(/\s+/)[0] || "there";
    const rate = (n: number) => `${SUPABASE_URL}/functions/v1/kolis-rate?token=${p.satisfaction_token}&stars=${n}`;
    const stars = [1, 2, 3, 4, 5].map((n) =>
      `<a href="${rate(n)}" style="text-decoration:none;font-size:30px;padding:0 3px;color:#E8B931">★</a>`).join("");

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;text-align:center">
      <div style="margin:0 0 16px"><img src="${LOGO}" width="46" height="46" alt="Kolis" style="border-radius:11px;display:inline-block"/></div>
      <h2 style="color:#0F1A17;margin:0 0 6px">How was your delivery?</h2>
      <p style="color:#5A6B63;font-size:14px;margin:0 0 18px">Hi ${first}, your parcel <b>${p.code}</b> from <b>${orgName}</b> was delivered. Tap a star to rate it.</p>
      <div style="margin:8px 0 18px">${stars}</div>
      <p style="color:#8A978F;font-size:12px;margin:18px 0 0">Operated by Concord Express Co Inc. · support@concordexpress.ca</p>
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [p.recipient_email], subject: `How was your delivery of ${p.code}?`, html }),
    });
    const jr = await r.json().catch(() => ({}));
    await admin.from("kolis_parcels").update({ satisfaction_email_sent_at: new Date().toISOString() }).eq("id", p.id);
    if (r.ok && jr?.id) {
      await admin.from("kolis_email_events").insert({ org_id: p.org_id, kind: "satisfaction", ref_id: p.id, email: p.recipient_email, resend_email_id: jr.id, event: "sent" });
    }
    return json({ ok: r.ok, id: jr?.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
