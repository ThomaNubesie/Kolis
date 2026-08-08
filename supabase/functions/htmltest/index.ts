// One-shot: publish the static external-driver custody page to public Storage
// (renders as real HTML, unlike the functions domain). Reads ?t= token from URL
// and calls the kolis-custody JSON API for actions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = `${SUPABASE_URL}/functions/v1/kolis-custody`;
const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kolis · Driver</title><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}body{background:#f2f4f8;color:#12141a}
.wrap{max-width:440px;margin:0 auto;min-height:100vh;background:#fff}
.hd{background:#E11D6B;color:#fff;padding:20px}.hd .lg{display:inline-block;background:#0A0A0A;font-weight:900;font-size:12px;padding:3px 8px;border-radius:6px}.hd h1{font-size:19px;margin-top:10px}
.b{padding:18px}.card{border:1px solid #e6eaf0;border-radius:12px;padding:14px;font-size:14px;line-height:1.5;margin-bottom:14px;background:#faf2f6}
.card b{color:#E11D6B}.lbl{font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;margin:14px 0 6px}
.inp{width:100%;border:1.5px solid #d7dce4;border-radius:11px;padding:13px;font-size:17px;letter-spacing:2px;text-align:center}
.btn{width:100%;background:#E11D6B;color:#fff;border:none;font-weight:800;font-size:16px;border-radius:12px;padding:15px;margin-top:14px}
.btn.sec{background:#fff;color:#0A0A0A;border:1.5px solid #0A0A0A}
.msg{font-size:13px;margin-top:12px;padding:11px;border-radius:10px}.err{background:#fdecec;color:#b3261e}.ok{background:#e7f6ec;color:#137a37}
.hide{display:none}.mut{color:#8a8f99;font-size:12px;text-align:center;margin-top:10px}
</style></head><body><div class="wrap">
<div class="hd"><span class="lg">KOLIS</span><h1>Driver handoff</h1></div>
<div class="b">
 <div id="pcard" class="card">Verify your phone to continue.</div>
 <div id="s_otp"><div class="lbl">Step 1 · Verify your phone</div><button class="btn" id="send">Text me a code</button>
   <div id="otpbox" class="hide"><div class="lbl">Enter the 6-digit code</div><input class="inp" id="otp" inputmode="numeric" maxlength="6" placeholder="------"><button class="btn" id="verify">Verify</button></div></div>
 <div id="s_pickup" class="hide"><div class="lbl">Confirm pickup at the hub</div><p class="mut">Tap when you have the parcel and you are at the hub.</p><button class="btn" id="pk">I have the parcel — confirm pickup</button></div>
 <div id="s_deliver" class="hide"><div class="lbl">Confirm delivery</div>
   <p class="mut">If the recipient is there, enter their delivery code. If no one is there, use “Left at drop-off” with a photo.</p>
   <input class="inp" id="dcode" inputmode="numeric" maxlength="4" placeholder="delivery code"><button class="btn" id="dv">Confirm with code</button>
   <div class="lbl" style="margin-top:18px">No one there?</div><input type="file" id="photo" accept="image/*" capture="environment" class="hide"><button class="btn sec" id="unatt">Left at drop-off (photo)</button></div>
 <div id="s_done" class="hide"><div class="msg ok">✓ All done. Thank you!</div></div>
 <div id="msg"></div>
</div></div><script>
const API=${JSON.stringify(API)}; const T=new URLSearchParams(location.search).get("t")||""; let PH=null;
const $=(i)=>document.getElementById(i); const show=(i)=>$(i).classList.remove("hide"), hide=(i)=>$(i).classList.add("hide");
function msg(t,ok){$("msg").className="msg "+(ok?"ok":"err");$("msg").textContent=t;}
async function post(o){const r=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:T,...o})});return r.json();}
function pos(){return new Promise((res)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude}),()=>res({}),{enableHighAccuracy:true,timeout:8000}):res({}));}
function render(st,p){if(p){$("pcard").innerHTML="<b>"+p.code+"</b> · "+(p.contents||"Parcel")+"<br>"+p.from+" → "+p.to+"<br>To: "+(p.recipient||"")+(p.hub?"<br>📍 "+p.hub.name:"");}
 hide("s_otp");hide("s_pickup");hide("s_deliver");hide("s_done");
 if(st==="pickup")show("s_pickup");else if(st==="deliver")show("s_deliver");else if(st==="done")show("s_done");}
$("send").onclick=async()=>{const r=await post({action:"request_otp"});if(r.ok){show("otpbox");msg("Code sent to "+r.sent_to,true);}else msg(r.error||"error");};
$("verify").onclick=async()=>{const r=await post({action:"verify_otp",otp:$("otp").value});if(r.ok){$("msg").textContent="";render(r.state,r.parcel);}else msg({expired:"Code expired — resend",wrong_code:"Wrong code",too_many:"Too many tries"}[r.error]||"error");};
$("pk").onclick=async()=>{msg("Getting location…",true);const g=await pos();const r=await post({action:"pickup",...g});if(r.ok){render("deliver");msg("Pickup confirmed.",true);}else msg(r.error==="too_far"?("You are "+r.distance_m+"m away — be within "+r.need_m+"m of the hub"):(r.error==="need_location"?"Enable location":r.error));};
$("dv").onclick=async()=>{const g=await pos();const r=await post({action:"deliver",mode:"code",code:$("dcode").value,...g});if(r.ok)render("done");else msg(r.error==="bad_code"?"Wrong delivery code":(r.error==="payment_not_captured"?"Payment issue — contact support":r.error));};
$("unatt").onclick=()=>$("photo").click();
$("photo").onchange=(e)=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=async()=>{PH=rd.result;msg("Getting location…",true);const g=await pos();const r=await post({action:"deliver",mode:"unattended",photo:PH,...g});if(r.ok)render("done");else msg(r.error==="too_far"?("You are "+r.distance_m+"m from the drop-off"):(r.error==="need_photo"?"Photo required":r.error));};rd.readAsDataURL(f);};
</script></body></html>`;
Deno.serve(async ()=>{
  const up = await admin.storage.from("marketing").upload("custody.html", new Blob([HTML],{type:"text/html; charset=utf-8"}), { contentType:"text/html; charset=utf-8", upsert:true });
  return new Response(JSON.stringify({ ok:!up.error, error:up.error?.message ?? null, url:`${SUPABASE_URL}/storage/v1/object/public/marketing/custody.html` }), { headers:{ "content-type":"application/json" } });
});
