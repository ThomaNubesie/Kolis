// loadq-incident-send — email one incident report, immediately, from the tablet.
//
// POST { incident_id, to: ["a@b.ca", ...] }   Authorization: the WRITER's JWT.
//
// Authorisation is delegated to the database: loadq_incident_get() is SECURITY
// DEFINER and returns {} unless the caller can write that zone's list, so a
// caller who is not a writer gets nothing to send. The service key is used only
// afterwards, to sign the media URLs and hand the mail to Resend.
//
// ATTACHMENTS. Photos ride along (mail servers commonly reject past ~20 MB, so
// there is a hard budget below). Video never does — a 40 s clip off a phone is
// tens of megabytes — so every file also gets a signed link, good for 7 days.
// The body reproduces the paper form in both languages, because the recipient
// at the City has the by-law in front of them and nothing else.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Concord Express <noreply@loadq.ca>";
const ATTACH_BUDGET = 15 * 1024 * 1024;   // keep the whole message under a typical 20 MB cap

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
const yn = (b: unknown) => (b ? "☑" : "☐");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    if (!RESEND) return json({ error: "resend_not_configured" }, 500);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "unauthorized" }, 401);

    const { incident_id, to } = await req.json().catch(() => ({}));
    const recipients: string[] = (Array.isArray(to) ? to : []).map((s) => String(s).trim()).filter(Boolean);
    if (!incident_id || !recipients.length) return json({ error: "missing incident_id or to" }, 400);

    // The writer's own client: the RPC decides whether they may see this at all.
    const asUser = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: inc } = await asUser.rpc("loadq_incident_get", { p_id: incident_id });
    if (!inc || !inc.id) return json({ error: "not_found_or_forbidden" }, 403);

    const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

    // Signed links for everything, attachments only for photos within budget.
    const media: any[] = inc.media ?? [];
    const links: string[] = [];
    const attachments: { filename: string; content: string }[] = [];
    let used = 0;
    for (const m of media) {
      const { data: signed } = await admin.storage.from("incident-media").createSignedUrl(m.path, 60 * 60 * 24 * 7);
      const name = String(m.path).split("/").pop() ?? "fichier";
      if (signed?.signedUrl) links.push(`<li>${esc(m.kind === "video" ? "Vidéo" : "Photo")} — ${esc(name)} · <a href="${signed.signedUrl}">ouvrir / open</a> <span style="color:#888">(7 jours)</span></li>`);
      if (m.kind === "photo" && used + (m.bytes ?? 0) < ATTACH_BUDGET) {
        const { data: blob } = await admin.storage.from("incident-media").download(m.path);
        if (blob) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          attachments.push({ filename: name, content: btoa(bin) });
          used += buf.length;
        }
      }
    }

    const when = `${inc.date} ${inc.time}`;
    const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:660px;color:#1a1917">
  <div style="background:#0F0A00;color:#FFF8F0;padding:16px 20px;border-bottom:3px solid #FF6B00">
    <div style="font-size:17px;font-weight:800">CONCORD EXPRESS CO. INC.</div>
    <div style="font-size:11px;color:#CC9966;margin-top:3px">ConcordXpress · LoadQ · Kolis — Ottawa (Ontario)</div>
    <div style="font-size:15px;font-weight:800;color:#FF6B00;margin-top:10px">REGISTRE D'INCIDENT · INCIDENT LOG</div>
  </div>
  <p style="font-size:12px;color:#8A6A44;margin:14px 0 4px">Sollicitation / prise en charge par un chauffeur sans permis —
     Solicitation / pickup by an unlicensed driver</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;width:210px;color:#6B6863">N° d'incident / Incident No.</td><td><b>${esc(inc.incident_no)}</b></td></tr>
    <tr><td style="padding:6px 0;color:#6B6863">Date et heure / Date &amp; time</td><td><b>${esc(when)}</b></td></tr>
    <tr><td style="padding:6px 0;color:#6B6863">Lieu / Location</td><td><b>${esc(inc.location)}</b></td></tr>
  </table>
  <h3 style="font-size:13px;background:#FF6B00;color:#0F0A00;padding:5px 10px;margin:18px 0 6px">VÉHICULE / VEHICLE</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;width:210px;color:#6B6863">N° de plaque / Licence plate</td><td><b>${esc(inc.plate ?? "—")}</b></td></tr>
    <tr><td style="padding:6px 0;color:#6B6863">Marque, modèle, couleur</td><td>${esc([inc.make, inc.model, inc.color].filter(Boolean).join(" · ") || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6863">Nb de passagers / Passengers</td><td>${esc(inc.passengers ?? "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6863">Description du chauffeur / Driver</td><td>${esc(inc.driver_desc ?? "—")}</td></tr>
  </table>
  <h3 style="font-size:13px;background:#FF6B00;color:#0F0A00;padding:5px 10px;margin:18px 0 6px">OBSERVATIONS</h3>
  <div style="font-size:14px;line-height:1.9">
    ${yn(inc.obs_solicitation)} Sollicitation au trottoir / Curb solicitation<br>
    ${yn(inc.obs_cash)} Paiement comptant observé / Cash payment observed<br>
    ${yn(inc.obs_hailed)} Passager hélé dans la rue / Passenger hailed in the street<br>
    ${yn(inc.obs_no_licence)} Aucun permis / identification visible — No visible licence / ID
  </div>
  <h3 style="font-size:13px;background:#FF6B00;color:#0F0A00;padding:5px 10px;margin:18px 0 6px">DESCRIPTION</h3>
  <p style="font-size:14px;line-height:1.65;white-space:pre-wrap">${esc(inc.description ?? "—")}</p>
  ${links.length ? `<h3 style="font-size:13px;background:#FF6B00;color:#0F0A00;padding:5px 10px;margin:18px 0 6px">PREUVE / EVIDENCE</h3><ul style="font-size:14px;line-height:1.7">${links.join("")}</ul>` : ""}
  <p style="font-size:14px;margin-top:18px">Consigné par / Recorded by : <b>${esc(inc.recorded_by_name ?? "—")}</b></p>
  <hr style="border:0;border-top:1px solid #EAE4DA;margin:18px 0">
  <p style="font-size:11px;color:#8A837A;line-height:1.6">
    Règlement sur les véhicules de location d'Ottawa n° 2016-272 — Ottawa Vehicle-for-Hire By-law No. 2016-272.<br>
    Seuls les taxis autorisés peuvent héler dans la rue ou accepter du comptant. Only licensed taxis may accept street hails or cash.<br>
    Plaintes / Complaints — BLRS, Ville d'Ottawa : 613-580-2424 · 311<br>
    Document interne — Concord Express Co. Inc. | Internal document
  </p>
</div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: recipients,
        subject: `Registre d'incident ${inc.incident_no} — ${inc.plate ?? "plaque inconnue"} — ${when}`,
        html, attachments,
      }),
    });
    const detail = (await r.text()).slice(0, 300);
    return json({ ok: r.ok, status: r.status, to: recipients,
                  attached: attachments.length, linked: links.length, detail }, r.ok ? 200 : 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
