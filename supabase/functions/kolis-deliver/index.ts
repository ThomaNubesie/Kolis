// External-driver delivery confirmation. One function serves the page (GET) + the API (POST).
// GET  ?t=<scan_token>          -> branded HTML page with a NIP field
// POST { t, nip }               -> if nip == delivery_code, mark parcel delivered
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const html = (b: string, s = 200) => new Response(b, { status: s, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
const esc = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function page(p: any, token: string) {
  const done = p.status === "delivered";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kolis · Livraison ${esc(p.code)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;background:#E8176B;color:#fff;min-height:100vh}
.wrap{max-width:520px;margin:0 auto;padding:28px 22px 60px}.chip{display:inline-block;background:#0A0A0A;color:#E8176B;font-weight:800;font-size:15px;padding:6px 13px;border-radius:9px;letter-spacing:1px}
.eyebrow{margin-top:20px;font-size:13px;font-weight:700;letter-spacing:2px;color:#fbd0e2}h1{font-size:34px;font-weight:800;margin-top:8px;line-height:1.1}
.sub{margin-top:8px;font-size:17px;font-weight:600;color:#ffe3ef}.panel{background:#0A0A0A;border-radius:18px;padding:22px;margin-top:22px}
.lab{font-size:12px;font-weight:700;letter-spacing:2px;color:#8a8a92}.val{font-size:20px;font-weight:800;margin-top:4px}.val.m{color:#ff4fa0}
input{width:100%;margin-top:10px;font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;padding:16px;border-radius:13px;border:0;background:#161616;color:#fff}
button{width:100%;margin-top:16px;background:#E8176B;color:#fff;border:0;border-radius:13px;padding:17px;font-size:18px;font-weight:800}button:disabled{opacity:.5}
.hint{font-size:13px;color:#8a8a92;margin-top:10px;text-align:center}.foot{margin-top:26px;text-align:center;font-weight:800;letter-spacing:1px;font-size:14px;color:#0A0A0A}
.ok{text-align:center;padding:40px 0}.ok .c{font-size:70px}.ok h2{font-size:26px;margin-top:10px}.err{color:#ffd0d0;text-align:center;margin-top:10px;font-weight:600;min-height:20px}</style></head>
<body><div class="wrap"><span class="chip">KOLIS</span>
<div class="eyebrow">LIVRAISON · ${esc(p.code)}</div>
<h1>Confirmer la livraison</h1>
<div class="sub">Pour <b>${esc(p.recipient_name || "")}</b> · ${esc(p.to_city || "")}</div>
<div id="app">
${done ? `<div class="panel"><div class="ok"><div class="c">✅</div><h2>Déjà confirmée</h2></div></div>`
: `<div class="panel">
  <div class="lab">FENÊTRE</div><div class="val">${esc(p.dropoff_slot || "")}</div>
  <div class="lab" style="margin-top:16px">NIP DE LIVRAISON (fourni par ${esc(p.recipient_name || "le client")})</div>
  <input id="nip" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">
  <div class="err" id="err"></div>
  <button id="go">Confirmer la livraison</button>
  <div class="hint">Demandez le NIP à ${esc(p.recipient_name || "la destinataire")} et saisissez-le pour confirmer.</div>
</div>`}
</div>
<div class="foot">CONCORD EXPRESS CO INC.</div></div>
<script>
const t=${JSON.stringify(token)};
const go=document.getElementById('go');
if(go){go.onclick=async()=>{const nip=document.getElementById('nip').value.trim();const err=document.getElementById('err');err.textContent='';
 if(!/^[0-9]{4}$/.test(nip)){err.textContent='Entrez le NIP à 4 chiffres.';return;}
 go.disabled=true;go.textContent='…';
 try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t,nip})});const j=await r.json();
  if(j.ok){document.getElementById('app').innerHTML='<div class="panel"><div class="ok"><div class="c">✅</div><h2>Livraison confirmée</h2></div></div>';}
  else{err.textContent=j.error==='bad_nip'?'NIP incorrect. Réessayez.':(j.error||'Erreur, réessayez.');go.disabled=false;go.textContent='Confirmer la livraison';}
 }catch(e){err.textContent='Erreur réseau.';go.disabled=false;go.textContent='Confirmer la livraison';}
};}
</script></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const t = url.searchParams.get("t") || "";
      const { data: p } = await admin.from("kolis_parcels")
        .select("code,status,recipient_name,to_city,dropoff_slot")
        .eq("scan_token", t).maybeSingle();
      if (!p) return json({ error: "not_found" }, 404);
      return json({ code: p.code, status: p.status, recipient_name: p.recipient_name, to_city: p.to_city, dropoff_slot: p.dropoff_slot, delivered: p.status === "delivered" });
    }
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const t = b.t || "", nip = String(b.nip || "").trim();
      const { data: p } = await admin.from("kolis_parcels")
        .select("id,status,delivery_code").eq("scan_token", t).maybeSingle();
      if (!p) return json({ ok: false, error: "not_found" }, 404);
      if (p.status === "delivered") return json({ ok: true, already: true });
      if (!["matched", "picked_up", "in_transit"].includes(p.status)) return json({ ok: false, error: "not_active" });
      if (nip !== String(p.delivery_code)) return json({ ok: false, error: "bad_nip" });
      await admin.from("kolis_parcels").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", p.id);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  } catch (e) { return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500); }
});
