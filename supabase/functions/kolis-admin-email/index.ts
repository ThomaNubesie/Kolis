// Admin one-off email via Resend. Guarded by x-kolis-secret. Body: { to, subject, text, html }.
const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("KOLIS_FROM_EMAIL") || "Kolis <noreply@loadq.ca>";
const j = (b: unknown, s=200)=> new Response(JSON.stringify(b), { status:s, headers:{ "content-type":"application/json" } });
Deno.serve(async (req)=>{
  try{
    if(req.headers.get("x-kolis-secret")!==SECRET) return j({error:"forbidden"},403);
    const { to, subject, text, html } = await req.json();
    if(!to||!subject) return j({error:"to and subject required"},400);
    if(!RESEND) return j({error:"resend not configured"},500);
    const res = await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND}`,"content-type":"application/json"},body:JSON.stringify({from:FROM,to,subject,text,html})});
    const jr = await res.json().catch(()=>({}));
    return j({ ok:res.ok, id:(jr as Record<string,unknown>)?.id??null, error:(jr as Record<string,unknown>)?.message??null }, res.ok?200:502);
  }catch(e){ return j({error:String((e as Error)?.message??e)},500); }
});
