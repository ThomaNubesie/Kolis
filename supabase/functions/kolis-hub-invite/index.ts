// Fired (via trigger) when a HUB parcel's payment is escrowed. Creates sender+receiver
// schedule links and sends each the link by SMS AND email (whichever exist). Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PAGE = "https://kolis-schedule-board.netlify.app/?t=";
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
function e164(p?:string|null){ if(!p) return null; let n=String(p).replace(/[^\d+]/g,""); if(!n.startsWith("+")) n = n.length===10?"+1"+n : "+"+n; return n; }
async function sms(to:string|null, body:string){
  const SID=Deno.env.get("KOLIS_TWILIO_SID"),TK=Deno.env.get("KOLIS_TWILIO_TOKEN"),FR=Deno.env.get("KOLIS_TWILIO_FROM");
  if(!SID||!TK||!FR||!to) return;
  const f=new URLSearchParams({To:to,Body:body}); FR.startsWith("MG")?f.set("MessagingServiceSid",FR):f.set("From",FR);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,{method:"POST",headers:{Authorization:"Basic "+btoa(`${SID}:${TK}`),"Content-Type":"application/x-www-form-urlencoded"},body:f.toString()}).catch(()=>{});
}
async function email(to:string|null, subject:string, body:string, url:string){
  if(!RESEND||!to) return;
  const html=`<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px"><div style="background:#E11D6B;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0"><span style="background:#0A0A0A;color:#E11D6B;font-weight:800;padding:6px 14px;border-radius:10px;letter-spacing:1px">KOLIS</span></div><div style="padding:22px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 14px 14px"><p style="font-size:15px;color:#3d4a44;line-height:1.55">${body}</p><p><a href="${url}" style="display:inline-block;background:#E11D6B;color:#fff;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:12px">${subject}</a></p><p style="color:#8A978F;font-size:12px">Kolis · Operated by Concord Express Co Inc.</p></div></div>`;
  await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND}`,"Content-Type":"application/json"},body:JSON.stringify({from:FROM_EMAIL,to,subject,html})}).catch(()=>{});
}
Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const { parcel_id } = await req.json();
    if(!parcel_id) return json({error:"missing parcel_id"},400);
    const { data: p } = await admin.from("kolis_parcels")
      .select("id,code,dropoff_type,payment_status,pickup_hub,from_city,to_city,sender_id,recipient_name,recipient_phone,recipient_lang,recipient_email").eq("id",parcel_id).maybeSingle();
    if(!p) return json({error:"not_found"},404);
    if(p.dropoff_type!=="hub" || !["authorized","paid"].includes(p.payment_status)) return json({skip:"not_hub_escrowed"});
    let hubName:string|null=null; if(p.pickup_hub){ const {data:h}=await admin.from("kolis_hubs").select("name").eq("id",p.pickup_hub).maybeSingle(); hubName=h?.name??null; }
    let senderName="Client", senderPhone:string|null=null, senderEmail:string|null=null, senderLocale="fr";
    if(p.sender_id){
      const {data:sp}=await admin.from("kolis_profiles").select("full_name").eq("id",p.sender_id).maybeSingle();
      senderName = sp?.full_name || senderName;
      try{ const {data:au}=await admin.auth.admin.getUserById(p.sender_id); senderPhone=au?.user?.phone?("+"+au.user.phone.replace(/^\+/,"")):null; senderEmail=au?.user?.email||null; }catch{}
    }
    const today = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const rows=[
      { role:"sender", client_name:senderName, phone:e164(senderPhone), email:senderEmail, locale:senderLocale, verb:"drop off", hub_id:p.pickup_hub, hub_name:hubName, lead_hours:4 },
      { role:"receiver", client_name:p.recipient_name||"Client", phone:e164(p.recipient_phone), email:p.recipient_email||null, locale:(p.recipient_lang==="en"?"en":"fr"), verb:"delivery", hub_id:null, hub_name:null, lead_hours:0 },
    ];
    const sent:string[]=[];
    for(const r of rows){
      let { data: link } = await admin.from("kolis_schedule_links").select("token,sms_sent_at").eq("parcel_id",parcel_id).eq("role",r.role).maybeSingle();
      if(!link){
        const ins = await admin.from("kolis_schedule_links").insert({ parcel_id, parcel_code:p.code, role:r.role, client_name:r.client_name, phone:r.phone,
          from_city:p.from_city, to_city:p.to_city, deliver_date:today, kind:"hub", locale:r.locale, verb:r.verb, hub_id:r.hub_id, hub_name:r.hub_name, lead_hours:r.lead_hours }).select("token,sms_sent_at").single();
        link = ins.data;
      }
      if(!link || link.sms_sent_at) continue;
      const url = PAGE + link.token; const fr=r.locale!=="en";
      const smsBody = r.role==="sender"
        ? (fr?`Bonjour ${r.client_name}! Kolis · Pour votre colis ${p.code} (${p.from_city}→${p.to_city}), choisissez votre heure de dépôt${hubName?" à "+hubName:""} : ${url} — Concord Express`
             :`Hi ${r.client_name}! Kolis · For parcel ${p.code} (${p.from_city}→${p.to_city}), pick your drop-off time${hubName?" at "+hubName:""}: ${url} — Concord Express`)
        : (fr?`Bonjour ${r.client_name}! Kolis · Votre colis ${p.code} arrive de ${p.from_city}. Choisissez votre plage de livraison : ${url} — Concord Express`
             :`Hi ${r.client_name}! Kolis · Your parcel ${p.code} is arriving from ${p.from_city}. Pick your delivery window: ${url} — Concord Express`);
      const subj = r.role==="sender" ? (fr?"Choisir l'heure de dépôt":"Pick your drop-off time") : (fr?"Choisir la plage de livraison":"Pick your delivery window");
      if(r.phone)  await sms(r.phone, smsBody);
      if(r.email)  await email(r.email, subj, smsBody.replace(url,"").trim(), url);
      await admin.from("kolis_schedule_links").update({ sms_sent_at:new Date().toISOString() }).eq("parcel_id",parcel_id).eq("role",r.role);
      sent.push(`${r.role}:${r.phone?"sms":""}${r.email?"+email":""}`);
      await sms("+16138622639", `Kolis · schedule link sent to ${r.role} (${r.client_name}) for ${p.code}: ${url}`);
    }
    return json({ ok:true, sent });
  }catch(e){ return json({error:String((e as Error)?.message??e)},500); }
});
