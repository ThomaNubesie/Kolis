// Generic transactional email via Resend (service_role JWT required).
// POST { to, subject, html, text, attachments?, scheduled_at? }
//   scheduled_at: ISO 8601 — Resend holds the message until then, so a letter can be
//   queued for business hours without anything local staying awake.
//   attachments: [{ filename, content }] where content is base64 — Resend's own
//   shape, passed straight through. Used for the branded PDFs that go to business
//   accounts (the Kolis-for-Business sheets), which previously had to be sent by hand.
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    if(!RESEND) return json({error:"resend_not_configured"},500);
    const {to,subject,html,text,attachments,scheduled_at}=await req.json();
    if(!to||!subject||(!html&&!text)) return json({error:"missing_fields"},400);
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND}`,"Content-Type":"application/json"},body:JSON.stringify({from:FROM,to,subject,html,text,...(Array.isArray(attachments)&&attachments.length?{attachments}:{}),...(scheduled_at?{scheduled_at}:{})})});
    const t=await r.text();
    return json({ok:r.ok,status:r.status,resp:t.slice(0,300)});
  }catch(e){return json({error:String((e as Error)?.message??e)},500);}
});
