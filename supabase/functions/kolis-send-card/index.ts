// Sends a branded Kolis email with a hosted card image, via Resend.
// POST { to, subject, intro, image_url }  (service_role JWT required)
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND) return json({ error: "resend_not_configured" }, 500);
    const { to, subject, intro, image_url } = await req.json();
    if (!to || !image_url || !subject) return json({ error: "missing_fields" }, 400);
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:540px;margin:0 auto">
      <div style="background:#E11D6B;color:#fff;padding:22px 26px;border-radius:16px 16px 0 0">
        <span style="display:inline-block;background:#0A0A0A;color:#E11D6B;font-weight:800;font-size:15px;padding:6px 14px;border-radius:10px;letter-spacing:1px">KOLIS</span>
        <h2 style="margin:14px 0 0;font-size:22px">${esc(subject)}</h2>
      </div>
      <div style="padding:22px 26px;border:1px solid #eee;border-top:0;border-radius:0 0 16px 16px">
        <p style="color:#3d4a44;font-size:15px;line-height:1.55;margin:0 0 14px">${esc(intro || "")}</p>
        <img src="${esc(image_url)}" alt="Kolis" style="width:100%;max-width:100%;border-radius:12px;display:block"/>
        <p style="color:#8A978F;font-size:12px;margin:18px 0 0">Kolis · Exploité par Concord Express Co Inc. · support@concordexpress.ca</p>
      </div></div>`;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, html }) });
    const t = await r.text();
    return json({ ok: r.ok, status: r.status, resp: t.slice(0, 300) });
  } catch (e) { return json({ error: String((e as Error)?.message ?? e) }, 500); }
});
