// Email verifier. Layers, cheapest first:
//   1) format  2) placeholder (dd@, aaaa@)  3) disposable domain
//   4) PAID mailbox-level check IF an API key is set (ZeroBounce / Kickbox / Abstract)
//   5) else DNS MX/A lookup (domain is real & mail-capable)
// Set ONE of these Supabase secrets to enable mailbox-level verification:
//   ZEROBOUNCE_API_KEY  |  KICKBOX_API_KEY  |  ABSTRACT_EMAIL_API_KEY
// Returns {ok, reason?, domain?, provider?, status?}. Fail-open on provider/DNS outage.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "dispostable.com", "mailnesia.com", "mintemail.com", "example.com", "test.com", "email.com"]);

async function hasRecord(domain, type) {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { headers: { accept: "application/dns-json" } });
    const d = await r.json().catch(() => ({}));
    return d?.Status === 0 && Array.isArray(d?.Answer) && d.Answer.some((a) => a.type === (type === "MX" ? 15 : 1));
  } catch { return null; }
}

// Mailbox-level verification via whichever provider key is configured.
// Returns a verdict object, or null (no key configured / provider errored).
async function paidVerify(email, domain) {
  const zb = Deno.env.get("ZEROBOUNCE_API_KEY");
  const kb = Deno.env.get("KICKBOX_API_KEY");
  const ab = Deno.env.get("ABSTRACT_EMAIL_API_KEY");
  try {
    if (zb) {
      const r = await fetch(`https://api.zerobounce.net/v2/validate?api_key=${zb}&email=${encodeURIComponent(email)}`);
      const d = await r.json().catch(() => ({}));
      const s = String(d?.status || "").toLowerCase();
      if (s === "valid") return { ok: true, provider: "zerobounce", status: s, domain };
      if (["invalid", "spamtrap", "abuse", "do_not_mail"].includes(s)) return { ok: false, reason: s === "do_not_mail" ? "disposable" : "undeliverable", provider: "zerobounce", status: s, domain };
      return { ok: true, reason: "inconclusive", provider: "zerobounce", status: s, domain }; // catch-all / unknown
    }
    if (kb) {
      const r = await fetch(`https://api.kickbox.com/v2/verify?email=${encodeURIComponent(email)}&apikey=${kb}`);
      const d = await r.json().catch(() => ({}));
      const s = String(d?.result || "").toLowerCase();
      if (s === "deliverable") return { ok: true, provider: "kickbox", status: s, domain };
      if (s === "undeliverable") return { ok: false, reason: "undeliverable", provider: "kickbox", status: s, domain };
      return { ok: true, reason: "inconclusive", provider: "kickbox", status: s, domain }; // risky / unknown
    }
    if (ab) {
      const r = await fetch(`https://emailvalidation.abstractapi.com/v1/?api_key=${ab}&email=${encodeURIComponent(email)}`);
      const d = await r.json().catch(() => ({}));
      if (d?.is_disposable_email?.value) return { ok: false, reason: "disposable", provider: "abstract", domain };
      const s = String(d?.deliverability || "").toUpperCase();
      if (s === "DELIVERABLE") return { ok: true, provider: "abstract", status: s, domain };
      if (s === "UNDELIVERABLE") return { ok: false, reason: "undeliverable", provider: "abstract", status: s, domain };
      return { ok: true, reason: "inconclusive", provider: "abstract", status: s, domain };
    }
  } catch { return null; }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email } = await req.json().catch(() => ({}));
    const e = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return json({ ok: false, reason: "format" });
    const [local, domain] = e.split("@");
    const core = local.replace(/[._+-]/g, "");
    if (new Set(core).size <= 1) return json({ ok: false, reason: "placeholder", domain });
    if (DISPOSABLE.has(domain)) return json({ ok: false, reason: "disposable", domain });

    // Mailbox-level (paid) verification when a provider key is configured.
    const paid = await paidVerify(e, domain);
    if (paid) return json(paid);

    // Free fallback: real, mail-capable domain.
    const mx = await hasRecord(domain, "MX");
    if (mx === null) return json({ ok: true, reason: "lookup_failed", domain });
    if (mx) return json({ ok: true, provider: "dns", domain });
    const a = await hasRecord(domain, "A");
    if (a) return json({ ok: true, provider: "dns", domain });
    return json({ ok: false, reason: "no_mail_server", domain });
  } catch (e) {
    return json({ ok: true, reason: "error" });
  }
});
