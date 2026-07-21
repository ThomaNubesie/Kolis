// kolis-rate: public satisfaction capture. GET ?token=<parcel.satisfaction_token>
// &stars=N records/updates the rating and shows a thank-you page with an optional
// comment box. POST {token, comment} saves the comment. No auth (verify_jwt off).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOGO = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png";

const html = (body: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:48px auto;text-align:center;color:#0F1A17;padding:0 16px">
     <img src="${LOGO}" width="48" height="48" style="border-radius:12px"/>${body}</div>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const admin = createClient(SUPABASE_URL, SERVICE);

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const token = b.token, comment = String(b.comment || "").slice(0, 1000);
    if (!token) return new Response("bad", { status: 400 });
    const { data: p } = await admin.from("kolis_parcels").select("id").eq("satisfaction_token", token).single();
    if (p) await admin.from("kolis_satisfaction").update({ comment }).eq("parcel_id", p.id);
    return new Response("ok");
  }

  const token = url.searchParams.get("token");
  const stars = Math.max(1, Math.min(5, parseInt(url.searchParams.get("stars") || "0") || 0));
  if (!token || !stars) return html(`<h2 style="margin:16px 0 6px">Invalid rating link</h2>`, 400);

  const { data: p } = await admin.from("kolis_parcels").select("id, org_id, client_id, code").eq("satisfaction_token", token).single();
  if (!p) return html(`<h2 style="margin:16px 0 6px">Link not found</h2>`, 404);

  await admin.from("kolis_satisfaction").upsert(
    { parcel_id: p.id, org_id: p.org_id, client_id: p.client_id, rating: stars },
    { onConflict: "parcel_id" });

  const filled = "★".repeat(stars), empty = "☆".repeat(5 - stars);
  return html(`
    <h2 style="margin:16px 0 6px">Thanks for your feedback!</h2>
    <div style="font-size:30px;color:#E8B931;letter-spacing:2px;margin:6px 0 4px">${filled}<span style="color:#ddd">${empty}</span></div>
    <p style="color:#5A6B63;font-size:14px;margin:0 0 18px">You rated delivery <b>${p.code}</b> ${stars}/5.</p>
    <form method="POST" action="${SUPABASE_URL}/functions/v1/kolis-rate" onsubmit="event.preventDefault();fetch(this.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${token}',comment:this.comment.value})}).then(()=>{this.outerHTML='<p style=&quot;color:#12805a&quot;>Comment saved — thank you!</p>'})">
      <textarea name="comment" placeholder="Anything to add? (optional)" style="width:100%;height:80px;border:1px solid #e7e2d8;border-radius:10px;padding:10px;font-family:inherit;font-size:14px"></textarea>
      <button type="submit" style="margin-top:10px;background:#E11D6B;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer">Send comment</button>
    </form>`);
});
