// Sender picks their hub drop-off time. Token-based (dropoff_token on the parcel).
// POST {token, action:'get'} -> parcel + hub summary. action:'submit'{day,slot} ->
// saves dropoff_slot + emails dispatch (marketing@concordexpress.ca).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const DISPATCH = "marketing@concordexpress.ca";
const j = (b: unknown, s=200)=> new Response(JSON.stringify(b), { status:s, headers:{ "content-type":"application/json", "access-control-allow-origin":"*", "access-control-allow-headers":"content-type" } });
async function email(to:string,subject:string,text:string){ if(!RESEND)return; await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND}`,"content-type":"application/json"},body:JSON.stringify({from:FROM,to,subject,text})}).catch(()=>{}); }

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return j({},200);
  if(req.method!=="POST") return new Response("kolis-dropoff",{status:200});
  let b:any={}; try{ b=await req.json(); }catch{ /* */ }
  if(!b.token) return j({error:"no_token"},400);
  const { data:p } = await admin.from("kolis_parcels").select("id,code,from_city,to_city,contents_description,recipient_name,pickup_hub,dropoff_slot,status").eq("dropoff_token",b.token).maybeSingle();
  if(!p) return j({error:"invalid_link"},404);
  let hub:any=null; if(p.pickup_hub){ const { data } = await admin.from("kolis_hubs").select("name,address,hours").eq("id",p.pickup_hub).maybeSingle(); hub=data; }
  const summary = { code:p.code, from:p.from_city, to:p.to_city, contents:p.contents_description, recipient:p.recipient_name, hub, saved:p.dropoff_slot };

  if(b.action==="get") return j({ ok:true, parcel:summary });

  if(b.action==="submit"){
    const day=String(b.day||"").slice(0,40), slot=String(b.slot||"").slice(0,40), note=String(b.note||"").slice(0,300);
    if(!day||!slot) return j({ok:false,error:"pick_day_and_time"});
    const choice = `${day} · ${slot}`;
    await admin.from("kolis_parcels").update({ dropoff_slot: choice }).eq("id", p.id);
    const body = `Drop-off time selected for parcel ${p.code}.\n\nWhen: ${choice}\nHub: ${hub?.name??""} (${hub?.address??""})\nRoute: ${p.from_city} → ${p.to_city}\nContents: ${p.contents_description??""}\nTo: ${p.recipient_name??""}${note?`\nNote: ${note}`:""}`;
    await email(DISPATCH, `Kolis ${p.code} — drop-off ${choice}`, body);
    return j({ ok:true });
  }
  return j({error:"bad_action"},400);
});
