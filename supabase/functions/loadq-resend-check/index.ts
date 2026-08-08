const SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const RESEND = Deno.env.get("RESEND_API_KEY");
const j = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-kolis-secret") !== SECRET) return j({ error: "forbidden" }, 403);
  if (!RESEND) return j({ error: "no RESEND_API_KEY" }, 500);
  const b = await req.json().catch(() => ({} as any));
  // Check delivery status of a previously-sent email id
  if (b.check) {
    const r = await fetch(`https://api.resend.com/emails/${b.check}`, { headers: { Authorization: `Bearer ${RESEND}` } });
    return j({ http: r.status, email: await r.json() });
  }
  // List verified domains
  if (b.domains) {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${RESEND}` } });
    return j({ http: r.status, domains: await r.json() });
  }
  // Send a single plain test and return the raw Resend response (incl. id / error)
  const from = b.from || "LoadQ <noreply@loadq.ca>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [b.to || "shaloderick@gmail.com"], subject: "LoadQ delivery test", html: "<p>LoadQ delivery test — if you see this, delivery works.</p>", text: "LoadQ delivery test." }),
  });
  return j({ from, http: r.status, body: await r.json() });
});
