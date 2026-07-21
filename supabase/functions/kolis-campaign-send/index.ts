// kolis-campaign-send: send a drafted campaign to the org's CONSENTED clients
// (CASL). Wraps the drafted body in Kolis branding + a working per-client
// unsubscribe, sends via Resend (open/click tracking on the domain), and records
// one kolis_campaign_recipients row per send. Caller must be owner/admin/shipper.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const LOGO = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const shell = (orgName: string, bodyHtml: string, unsubUrl: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <div style="margin:0 0 16px"><img src="${LOGO}" width="46" height="46" alt="Kolis" style="border-radius:11px;display:block"/></div>
    ${bodyHtml}
    <p style="color:#8A978F;font-size:12px;margin:22px 0 0;border-top:1px solid #eee;padding-top:12px">Sent by <b>${orgName}</b> via Kolis · Operated by Concord Express Co Inc.<br>
      <a href="${unsubUrl}" style="color:#8A978F">Unsubscribe</a> from these emails.</p>
  </div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authz = req.headers.get("Authorization") || "";
    const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authz } } });
    const { org_id, campaign_id } = await req.json().catch(() => ({}));
    if (!org_id || !campaign_id) return json({ error: "org_id and campaign_id required" }, 400);

    const { data: role } = await asUser.rpc("kolis_org_role", { p_org: org_id });
    if (!["owner", "admin", "shipper"].includes(String(role || ""))) return json({ error: "forbidden" }, 403);
    if (!RESEND) return json({ error: "not_configured", message: "RESEND_API_KEY missing" }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: camp } = await admin.from("kolis_campaigns").select("*").eq("id", campaign_id).eq("org_id", org_id).single();
    if (!camp) return json({ error: "campaign_not_found" }, 404);
    if (camp.status !== "draft") return json({ error: "already_sent" }, 409);
    const { data: orgRow } = await admin.from("kolis_orgs").select("name").eq("id", org_id).single();
    const orgName = orgRow?.name || "Your shipper";
    const from = `${orgName} via Kolis <noreply@loadq.ca>`;

    // CASL: consented, non-unsubscribed clients with an email.
    let q = admin.from("kolis_org_clients")
      .select("id, full_name, email, unsubscribe_token")
      .eq("org_id", org_id).eq("marketing_consent", true).is("unsubscribed_at", null).not("email", "is", null);
    let recipients = (await q).data || [];
    if (camp.audience === "past_customers") {
      const { data: pastIds } = await admin.from("kolis_parcels").select("client_id").eq("org_id", org_id).not("client_id", "is", null);
      const set = new Set((pastIds || []).map((x: any) => x.client_id));
      recipients = recipients.filter((c: any) => set.has(c.id));
    }

    await admin.from("kolis_campaigns").update({ status: "sending" }).eq("id", campaign_id);

    let sent = 0, failed = 0;
    for (const c of recipients) {
      const first = String(c.full_name || "").trim().split(/\s+/)[0] || "there";
      const unsub = `${SUPABASE_URL}/functions/v1/kolis-unsubscribe?token=${c.unsubscribe_token}`;
      const html = shell(orgName, String(camp.body_html).replaceAll("{{first_name}}", first), unsub);
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from, to: [c.email], subject: String(camp.subject).replaceAll("{{first_name}}", first), html,
            headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          }),
        });
        const jr = await r.json().catch(() => ({}));
        if (r.ok && jr?.id) {
          sent++;
          await admin.from("kolis_campaign_recipients").insert({ campaign_id, client_id: c.id, email: c.email, status: "sent", resend_email_id: jr.id });
        } else {
          failed++;
          await admin.from("kolis_campaign_recipients").insert({ campaign_id, client_id: c.id, email: c.email, status: "failed", error: JSON.stringify(jr).slice(0, 300) });
        }
      } catch (e) {
        failed++;
        await admin.from("kolis_campaign_recipients").insert({ campaign_id, client_id: c.id, email: c.email, status: "failed", error: String((e as Error)?.message ?? e).slice(0, 300) });
      }
    }

    await admin.from("kolis_campaigns").update({ status: "sent", sent_count: sent, recipients_count: recipients.length, sent_at: new Date().toISOString() }).eq("id", campaign_id);
    return json({ ok: true, recipients: recipients.length, sent, failed });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
