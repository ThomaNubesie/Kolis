// External-driver custody: OTP-gated, no-app pickup/delivery for out-of-network drivers.
// JSON API only (driver PAGE is hosted on kolis.ca; Supabase forces text/plain here).
// POST {action,...}: create (x-kolis-secret) | request_otp | verify_otp | pickup | deliver
// Captures escrow on delivery, then DEACTIVATES the QR/link (no reuse after delivered).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const ADMIN_EMAIL = Deno.env.get("KOLIS_ADMIN_EMAIL") || "support@concordexpress.ca";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const GEOFENCE_M = 1000, OTP_TTL = 10*60*1000, VERIFY_TTL = 60*60*1000;
const admin = createClient(SUPABASE_URL, SERVICE);

const j = (b: unknown, s=200)=> new Response(JSON.stringify(b), { status:s, headers:{ "content-type":"application/json", "access-control-allow-origin":"*", "access-control-allow-headers":"content-type,x-kolis-secret" } });
function distM(aLat:number,aLng:number,bLat:number,bLng:number){ const R=6371000,r=(x:number)=>x*Math.PI/180; const dLat=r(bLat-aLat),dLng=r(bLng-aLng); const s=Math.sin(dLat/2)**2+Math.cos(r(aLat))*Math.cos(r(bLat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(s)); }
async function sms(to:string|null,body:string){ if(!TW_SID||!TW_TOKEN||!TW_FROM||!to)return; let n=String(to).replace(/[^\d+]/g,""); if(!n.startsWith("+"))n=n.length===10?"+1"+n:"+"+n; const f=new URLSearchParams({To:n,Body:body}); TW_FROM.startsWith("MG")?f.set("MessagingServiceSid",TW_FROM):f.set("From",TW_FROM); await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`,{method:"POST",headers:{Authorization:"Basic "+btoa(`${TW_SID}:${TW_TOKEN}`),"content-type":"application/x-www-form-urlencoded"},body:f.toString()}).catch(()=>{}); }
async function email(to:string|null,subject:string,text:string){ if(!RESEND||!to)return; await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND}`,"content-type":"application/json"},body:JSON.stringify({from:FROM,to,subject,text})}).catch(()=>{}); }

async function loadCustody(token:string){ const { data } = await admin.from("kolis_external_custody").select("*").eq("token",token).maybeSingle(); return data; }
async function loadParcel(id:string){ const { data } = await admin.from("kolis_parcels").select("id,code,from_city,to_city,contents_description,recipient_name,recipient_phone,recipient_email,dropoff_addr,dropoff_lat,dropoff_lng,dropoff_type,pickup_hub,pickup_code,delivery_code,status,stripe_payment_intent_id,sender_id").eq("id",id).maybeSingle(); return data; }
async function hubCoords(hubId:string|null){ if(!hubId)return null; const { data } = await admin.from("kolis_hubs").select("name,address,latitude,longitude").eq("id",hubId).maybeSingle(); return data; }
const verified = (c:any)=> c.phone_verified_at && (Date.now()-new Date(c.phone_verified_at).getTime() < VERIFY_TTL);
function stateOf(c:any,p:any){ if(c.delivered_at||p.status==="delivered")return "done"; if(c.picked_up_at||["picked_up","in_transit"].includes(p.status))return "deliver"; return "pickup"; }
async function capture(pid:string|null){ if(!pid)return "no_pi"; if(pid.startsWith("credit_"))return "credit"; try{ const pi=await stripe.paymentIntents.retrieve(pid); if(pi.status==="requires_capture"){ await stripe.paymentIntents.capture(pid); return "captured"; } return pi.status; }catch{ return "error"; } }
function summary(p:any,hub:any){ return { code:p.code, from:p.from_city, to:p.to_city, contents:p.contents_description, recipient:p.recipient_name, dropoff_type:p.dropoff_type, dropoff_addr:p.dropoff_addr, hub: hub?{name:hub.name,address:hub.address}:null }; }

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return j({},200);
  if(req.method!=="POST") return new Response("kolis-custody", { status:200 });
  let body:any={}; try{ body=await req.json(); }catch{ /* */ }
  const action = body.action as string;

  if(action==="create"){
    if(req.headers.get("x-kolis-secret")!==SECRET) return j({error:"forbidden"},403);
    const { parcel_id, driver_name, driver_phone, driver_vehicle } = body;
    if(!parcel_id||!driver_phone) return j({error:"parcel_id and driver_phone required"},400);
    const token = crypto.randomUUID().replace(/-/g,"");
    const { error } = await admin.from("kolis_external_custody").insert({ parcel_id, driver_name, driver_phone, driver_vehicle, token });
    if(error) return j({error:error.message},500);
    await admin.from("kolis_parcels").update({ external_driver_name: driver_name ?? null, external_driver_veh: driver_vehicle ?? null }).eq("id", parcel_id);
    return j({ ok:true, token, link:`https://kolis.ca/d?t=${token}` });
  }

  const c = await loadCustody(body.token);
  if(!c) return j({error:"invalid_link"},404);
  const p = await loadParcel(c.parcel_id);
  if(!p) return j({error:"parcel_gone"},404);
  const hub = await hubCoords(p.pickup_hub);
  const completed = p.status==="delivered" || !!c.delivered_at;

  if(action==="request_otp"){
    if(completed) return j({ok:false,error:"completed"});
    const otp = String(Math.floor(100000+Math.random()*900000));
    await admin.from("kolis_external_custody").update({ otp_code:otp, otp_expires_at:new Date(Date.now()+OTP_TTL).toISOString(), otp_attempts:0 }).eq("id",c.id);
    await sms(c.driver_phone, `Kolis: your driver verification code is ${otp}. Parcel ${p.code}.`);
    return j({ ok:true, sent_to: String(c.driver_phone).replace(/.(?=.{2})/g,"•") });
  }

  if(action==="verify_otp"){
    if(completed) return j({ok:true,state:"done",parcel:summary(p,hub)});
    if(!c.otp_code || !c.otp_expires_at || Date.now()>new Date(c.otp_expires_at).getTime()) return j({ok:false,error:"expired"});
    if((c.otp_attempts??0)>=5) return j({ok:false,error:"too_many"});
    if(String(body.otp).trim()!==c.otp_code){ await admin.from("kolis_external_custody").update({otp_attempts:(c.otp_attempts??0)+1}).eq("id",c.id); return j({ok:false,error:"wrong_code"}); }
    await admin.from("kolis_external_custody").update({ phone_verified_at:new Date().toISOString(), otp_code:null }).eq("id",c.id);
    return j({ ok:true, state:stateOf({...c,phone_verified_at:new Date().toISOString()},p), parcel:summary(p,hub) });
  }

  if(completed) return j({ok:false,error:"completed"});
  if(!verified(c)) return j({ok:false,error:"verify_first"},401);

  if(action==="pickup"){
    const { lat, lng } = body;
    if(hub?.latitude!=null && typeof lat==="number"){ const d=distM(lat,lng,hub.latitude,hub.longitude); if(d>GEOFENCE_M) return j({ok:false,error:"too_far",distance_m:Math.round(d),need_m:GEOFENCE_M}); }
    else if(typeof lat!=="number") return j({ok:false,error:"need_location"});
    await admin.from("kolis_parcels").update({ status:"picked_up", picked_up_scan_at:new Date().toISOString(), picked_up_lat:lat??null, picked_up_lng:lng??null }).eq("id",p.id);
    await admin.from("kolis_external_custody").update({ picked_up_at:new Date().toISOString(), pickup_lat:lat??null, pickup_lng:lng??null }).eq("id",c.id);
    const b2=`Parcel ${p.code} was picked up by external driver ${c.driver_name??""} (${c.driver_vehicle??""}) and is on the way to ${p.to_city}.`;
    sms(p.recipient_phone,b2); email(p.recipient_email,`Kolis ${p.code} — picked up`,b2); email(ADMIN_EMAIL,`Kolis ${p.code} — external pickup`,b2);
    return j({ ok:true, state:"deliver" });
  }

  if(action==="deliver"){
    const { mode, code, lat, lng, photo } = body;
    if(mode==="code"){
      if(String(code).trim()!==String(p.delivery_code??"").trim()) return j({ok:false,error:"bad_code"});
    } else if(mode==="unattended"){
      if(p.dropoff_lat!=null && typeof lat==="number"){ const d=distM(lat,lng,p.dropoff_lat,p.dropoff_lng); if(d>GEOFENCE_M) return j({ok:false,error:"too_far",distance_m:Math.round(d),need_m:GEOFENCE_M}); }
      else if(typeof lat!=="number") return j({ok:false,error:"need_location"});
      if(!photo) return j({ok:false,error:"need_photo"});
    } else return j({ok:false,error:"bad_mode"});
    let proofUrl:string|null=null;
    if(mode==="unattended" && typeof photo==="string"){
      try{ const b64=photo.split(",").pop()!; const bin=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0)); const path=`${p.code}-${Date.now()}.jpg`;
        const up=await admin.storage.from("custody-proof").upload(path,bin,{contentType:"image/jpeg",upsert:true});
        if(!up.error) proofUrl=`${SUPABASE_URL}/storage/v1/object/public/custody-proof/${path}`; }catch{ /* */ }
    }
    const settled = await capture(p.stripe_payment_intent_id);
    const paid = settled==="captured"||settled==="succeeded"||settled==="credit";
    if(!paid) return j({ok:false,error:"payment_not_captured",settled});
    await admin.from("kolis_parcels").update({ status:"delivered", delivered_at:new Date().toISOString(), delivered_scan_at:new Date().toISOString(), delivered_lat:lat??null, delivered_lng:lng??null, scan_token:null }).eq("id",p.id);
    await admin.from("kolis_external_custody").update({ delivered_at:new Date().toISOString(), delivery_mode:mode, proof_photo_url:proofUrl, proof_lat:lat??null, proof_lng:lng??null }).eq("id",c.id);
    const rbody = mode==="unattended"
      ? `Your Kolis parcel ${p.code} was delivered (left at drop-off).${proofUrl?` Photo: ${proofUrl}`:""} Not right? Reply to this text.`
      : `Your Kolis parcel ${p.code} was delivered — thank you!`;
    sms(p.recipient_phone,rbody); email(p.recipient_email,`Kolis ${p.code} — delivered`,rbody+(proofUrl?`\nProof: ${proofUrl}`:""));
    email(ADMIN_EMAIL,`Kolis ${p.code} — external delivery (${mode})`,`Captured: ${settled}. ${proofUrl??""}`);
    return j({ ok:true, state:"done", settled, proof:proofUrl });
  }

  return j({error:"bad_action"},400);
});
