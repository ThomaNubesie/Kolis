// Concord Express mailer via Resend. Guarded by x-kolis-secret.
// Auto-applies the Concord Express letterhead to every email (brand wrapper),
// so branding persists across all sends. Supports custom from, reply_to,
// PDF attachments (base64), and a { action:'domains' } status check.
//
// Send body: { to, subject, body|html, from?, reply_to?, attachments?, wrap? }
//   body  = inner HTML (recommended) -> wrapped in letterhead automatically
//   html  = full HTML                -> wrapped unless wrap:false
//   wrap  = false to send html verbatim (no letterhead)
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const RESEND = Deno.env.get("RESEND_API_KEY");
const DEFAULT_FROM = "Concord Express <noreply@concordexpress.ca>";
const j = (b, s=200)=> new Response(JSON.stringify(b), { status:s, headers:{ "content-type":"application/json" } });

// ── Concord Express letterhead (single source of truth for email branding) ──
function letterhead(inner){
  return `<div style="background:#eef0ef;padding:20px 0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" align="center" style="background:#fff;border-collapse:collapse;margin:0 auto;max-width:620px">
  <tr><td style="padding:24px 30px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td valign="middle" style="width:86px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="82" height="72" align="center" valign="middle" style="background:#0E4632;border-radius:3px">
            <div style="color:#33D69F;font-size:29px;font-weight:800;line-height:1;font-family:Georgia,'Times New Roman',serif">CX</div>
            <div style="color:#33D69F;font-size:8.5px;letter-spacing:2.5px;margin-top:4px;border-top:1px solid #33D69F;padding-top:3px;display:inline-block">CONCORD</div>
          </td>
        </tr></table>
      </td>
      <td valign="middle" style="padding-left:16px">
        <div style="font-size:21px;font-weight:800;color:#181818">Concord Express Co Inc.</div>
        <div style="font-size:11px;color:#22A874;margin-top:3px">Intercity carpooling · Canada · France · West Africa</div>
        <div style="font-size:11px;color:#9a9a9a">Transport des personnes · Expédition · Gestion de file d’attente</div>
        <div style="font-size:11px;color:#22A874;font-style:italic">Là-bas aujourd’hui !</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:0 30px"><div style="border-top:1px solid #e6e6e6;font-size:0;line-height:0">&nbsp;</div></td></tr>
  <tr><td style="padding:22px 30px 26px;font-size:14px;line-height:1.65;color:#242424">${inner}</td></tr>
  <tr><td style="padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#F1F4F2;padding:13px 20px;font-size:10.5px;color:#5f5f5f;width:34%">www.concordexpress.ca</td>
      <td style="background:#2ECC8F;width:12px;font-size:0;line-height:0">&nbsp;</td>
      <td style="background:#F1F4F2;padding:13px 20px;font-size:10.5px;color:#5f5f5f">Ottawa, ca &nbsp;·&nbsp; (+1) 613 868 2982 &nbsp;·&nbsp; info@concordexpress.ca</td>
    </tr>
    <tr><td colspan="3" style="background:#0E4632;text-align:center;padding:9px 8px;font-size:10px;letter-spacing:2px;color:#8fe3c2;text-transform:uppercase">ConcordXpress &nbsp;·&nbsp; LoadQ &nbsp;·&nbsp; Kolis</td></tr>
    </table>
  </td></tr>
</table></div>`;
}

Deno.serve(async (req)=>{
  try{
    if(req.headers.get("x-kolis-secret")!==SECRET) return j({error:"forbidden"},403);
    if(!RESEND) return j({error:"resend not configured"},500);
    const b = await req.json();
    if(b.action==="domains"){
      const r = await fetch("https://api.resend.com/domains",{headers:{Authorization:`Bearer ${RESEND}`}});
      const d = await r.json().catch(()=>({}));
      return j({ ok:r.ok, domains:d?.data ?? d }, r.ok?200:502);
    }
    const { to, subject, from, reply_to, attachments } = b;
    if(!to||!subject) return j({error:"to and subject required"},400);
    const inner = b.body ?? b.html ?? "";
    const wrap = b.wrap !== false; // brand by default
    const html = wrap ? letterhead(inner) : inner;
    const payload = {
      from: from || DEFAULT_FROM,
      to, subject, html,
      ...(reply_to?{reply_to}:{}),
      ...(Array.isArray(attachments)&&attachments.length?{attachments}:{}),
    };
    const res = await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND}`,"content-type":"application/json"},body:JSON.stringify(payload)});
    const jr = await res.json().catch(()=>({}));
    return j({ ok:res.ok, id:jr?.id??null, error:jr?.message??null }, res.ok?200:502);
  }catch(e){ return j({error:String(e?.message??e)},500); }
});
