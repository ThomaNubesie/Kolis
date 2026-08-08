// Unified hub/delivery scheduler. Token-gated via kolis_schedule_links.
// GET  ?t=<token>   -> { client_name, from_city, to_city, date_label, verb, role, hub_name, blocks, spots, locale }
// POST { t, block, spot } -> saves, alerts dispatch, { ok }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// drop-off / delivery window 7:00–17:00, one-hour blocks
const HOURS = [7,8,9,10,11,12,13,14,15,16];
function blockLabel(h:number, locale:string){
  const to12=(x:number)=>{const ap=x<12?"AM":"PM";let hh=x%12; if(hh===0)hh=12; return `${hh}:00 ${ap}`;};
  if(locale==="fr") return `${h} h – ${h+1} h`;
  return `${to12(h)} – ${to12(h+1)}`;
}
// meeting spots per hub id (fallback default)
const HUB_SPOTS: Record<string,string[]> = {
  "c924b57f-e092-4d70-8298-055e4859df25": ["Great Hall","GO Concourse","VIA Rail","Front St entrance"],       // Union Station
  "d15c3498-d6b4-4e2e-bc9d-7ce497623b89": ["Main entrance","Food court","Bus terminal","Indigo entrance"],     // Yorkdale
  "ae99f949-e1cc-474c-a921-1cd833da38f9": ["Main entrance","Food court","Transit bay","Customer service"],     // St Laurent
  "b85f534a-aefc-45eb-b980-6e30427afac1": ["Store entrance","Pumps","Parking lot"],                            // Shell Laurier
  "bf710024-52d3-43ce-adeb-c3d03f1c5566": ["Bay 2","Main entrance","Bus bay"],                                 // Montréal drop-off hub
  "2a5e4075-92e8-45a1-888f-4f147854f967": ["Bay 4","Main entrance","Parking"],                                 // Ottawa drop-off hub
};
const DEFAULT_SPOTS = ["Main entrance","Parking lot","Front desk"];
const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS" };
const json = (b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});

function torontoNow(){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hour12:false}).formatToParts(new Date());
  const g=(t:string)=>p.find(x=>x.type===t)!.value;
  return { date:`${g("year")}-${g("month")}-${g("day")}`, hour:parseInt(g("hour"),10) };
}
function dateLabel(d:string|null, locale:string){
  if(!d) return "";
  try{ return new Date(d+"T12:00:00Z").toLocaleDateString(locale==="fr"?"fr-CA":"en-CA",{weekday:"long",month:"long",day:"numeric",timeZone:"UTC"}); }catch{ return d; }
}

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const url=new URL(req.url);
    let t=url.searchParams.get("t")||""; let block="",spot="";
    if(req.method==="POST"){ const b=await req.json().catch(()=>({})); t=b.t||t; block=b.block||""; spot=b.spot||""; }
    if(!t) return json({error:"missing token"},400);
    const { data: row } = await admin.from("kolis_schedule_links").select("*").eq("token",t).maybeSingle();
    if(!row) return json({error:"not_found"},404);

    const locale = (row.locale==="en") ? "en" : "fr";
    const role = row.role || "receiver";
    const isSender = role==="sender";
    // spots only for hub drop-offs; a door/non-hub sender picks time only
    const spots = (isSender && row.hub_id) ? (HUB_SPOTS[row.hub_id] || DEFAULT_SPOTS) : [];
    // build blocks, applying same-day lead for sender
    const tn=torontoNow();
    const lead = row.lead_hours || 0;
    const sameDay = row.deliver_date === tn.date;
    const blocks = HOURS.filter(h => !(isSender && sameDay && h < tn.hour + lead)).map(h=>blockLabel(h,locale));

    if(req.method==="POST"){
      if(!blocks.includes(block)) return json({error: locale==="fr"?"choisissez une heure valide":"pick a valid time"},400);
      if(isSender && spots.length && !spots.includes(spot)) return json({error: locale==="fr"?"choisissez un lieu":"pick a spot"},400);
      await admin.from("kolis_schedule_links").update({ selected_block:block, selected_spot: spot||null, selected_at:new Date().toISOString() }).eq("token",t);
      // populate the admin side on the parcel
      if(row.parcel_id){
        const when = `${dateLabel(row.deliver_date,locale)} · ${block}`;
        if(isSender){ await admin.from("kolis_parcels").update({ pickup_slot: `${row.hub_name?row.hub_name+" — ":""}${spot?spot+" · ":""}${when}` }).eq("id",row.parcel_id); }
        else { await admin.from("kolis_parcels").update({ dropoff_slot: when }).eq("id",row.parcel_id); }
      }
      const TW_SID=Deno.env.get("KOLIS_TWILIO_SID"),TW_TOKEN=Deno.env.get("KOLIS_TWILIO_TOKEN"),TW_FROM=Deno.env.get("KOLIS_TWILIO_FROM");
      if(TW_SID&&TW_TOKEN&&TW_FROM){
        const what = isSender ? "ramassage/dépôt" : "livraison";
        const line = `Kolis · ${row.parcel_code||""} ${row.client_name} (${role}) a choisi ${what}: ${dateLabel(row.deliver_date,locale)} · ${block}${spot?" · "+spot:""}`;
        const body=new URLSearchParams({To:"+16138622639",Body:line});
        TW_FROM.startsWith("MG")?body.set("MessagingServiceSid",TW_FROM):body.set("From",TW_FROM);
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`,{method:"POST",headers:{Authorization:"Basic "+btoa(`${TW_SID}:${TW_TOKEN}`),"Content-Type":"application/x-www-form-urlencoded"},body:body.toString()}).catch(()=>{});
      }
      return json({ ok:true, saved:block, spot });
    }
    return json({ client_name:row.client_name, from_city:row.from_city, to_city:row.to_city,
      date_label:dateLabel(row.deliver_date,locale), verb:row.verb||(isSender?"drop off":"delivery"),
      role, hub_name:row.hub_name, blocks, spots, locale,
      selected: !!row.selected_at, selected_block: row.selected_block||null, selected_spot: row.selected_spot||null });
  }catch(e){ return json({error:String((e as Error)?.message??e)},500); }
});
