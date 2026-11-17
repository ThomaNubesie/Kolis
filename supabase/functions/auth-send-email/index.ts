// Brand-aware auth email sender (Supabase "Send Email" hook).
//
// LoadQ, Kolis and Quorly share ONE Supabase project, so they share one native auth email
// template — which was hard-coded LoadQ, meaning Kolis/Quorly sign-in codes arrived LoadQ-branded.
// This hook intercepts every auth email, figures out which product the sign-in came from (by the
// redirect_to / site_url host the app passed), and sends a correctly branded email via Resend.
//
// Enable in the dashboard: Auth → Hooks → "Send Email" → point at this function, and set
// SEND_EMAIL_HOOK_SECRET to the secret it shows you. Deployed with verify_jwt=false (the request
// is authenticated by the webhook signature, not a user JWT).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const RESEND = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";

type Brand = { key: string; name: string; initial: string; brand: string; tint: string; ink: string; from: string; logo?: string; footer: string };
const LOGO_BASE = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand";
const CONCORD_FOOTER = "Operated by Concord Express Co Inc. · support@concordexpress.ca";
const BRANDS: Record<string, Brand> = {
  kolis:  { key: "kolis",  name: "Kolis",  initial: "Ko", brand: "#E11D6B", tint: "#FDEEF4", ink: "#0F1A17", logo: `${LOGO_BASE}/kolis-logo.png`, footer: CONCORD_FOOTER, from: Deno.env.get("KOLIS_FROM_EMAIL")  || "Kolis <noreply@kolis.ca>" },
  loadq:  { key: "loadq",  name: "LoadQ",  initial: "LQ", brand: "#FF8A1A", tint: "#FFF1E3", ink: "#1A1205", logo: `${LOGO_BASE}/loadq-logo.png`, footer: CONCORD_FOOTER, from: Deno.env.get("LOADQ_FROM_EMAIL")  || "LoadQ <noreply@loadq.ca>" },
  // Quorly is a separate business — never carries the Concord footer.
  quorly: { key: "quorly", name: "Quorly", initial: "Q",  brand: "#4F46E5", tint: "#EEF0FE", ink: "#141427", footer: "© Quorly", from: Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@quorly.ca>" },
};

// Brand from the app's own redirect; the project Site URL is only a fallback.
// (Concatenating both let a kolis Site URL brand every LoadQ email as Kolis.)
function brandFor(redirect?: string, site?: string): Brand {
  const s = (redirect || site || "").toLowerCase();
  if (s.includes("kolis")) return BRANDS.kolis;
  if (s.includes("quorly")) return BRANDS.quorly;
  if (s.includes("loadq")) return BRANDS.loadq;
  return BRANDS.loadq; // incumbent default when nothing distinguishes it
}

// Heading + intro per auth action. Everything is a short "here is your code" email.
function copyFor(action: string, name: string): { heading: string; intro: string; subject: string } {
  switch (action) {
    case "signup":
      return { heading: "Verify your email", intro: `Use this code to continue signing up to ${name}.`, subject: `Your ${name} verification code` };
    case "recovery":
      return { heading: "Reset your password", intro: `Use this code to reset your ${name} password.`, subject: `Your ${name} password reset code` };
    case "invite":
      return { heading: "You're invited", intro: `Use this code to join ${name}.`, subject: `Your ${name} invite code` };
    case "email_change":
    case "email_change_new":
      return { heading: "Confirm your email change", intro: `Use this code to confirm your new email on ${name}.`, subject: `Confirm your email on ${name}` };
    case "reauthentication":
      return { heading: "Confirm it's you", intro: `Enter this code in ${name} to continue.`, subject: `Your ${name} code` };
    default: // magiclink / login / otp — same "Verify your email" card as the app's signup code
      return { heading: "Verify your email", intro: `Use this code to continue signing in to ${name}.`, subject: `Your ${name} verification code` };
  }
}

// Same card as kolis-send-email-otp ("Verify your email"): logo, heading, intro,
// code on a light brand tint, expiry line, footer. No outer frame.
function renderHtml(b: Brand, heading: string, intro: string, code: string): string {
  const mark = b.logo
    ? `<img src="${b.logo}" width="46" height="46" alt="${b.name}" style="border-radius:11px;display:block"/>`
    : `<div style="width:46px;height:46px;line-height:46px;background:${b.brand};border-radius:11px;color:#fff;font-weight:800;font-size:18px;text-align:center">${b.initial}</div>`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px">
  <div style="margin:0 0 16px">${mark}</div>
  <h2 style="color:${b.ink};margin:0 0 8px">${heading}</h2>
  <p style="color:#5A6B63;margin:0 0 16px">${intro}</p>
  <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:${b.brand};text-align:center;padding:16px;background:${b.tint};border-radius:12px">${code}</div>
  <p style="color:#8A978F;font-size:12px;margin:16px 0 0">Expires in 10 minutes.</p>
  <p style="color:#8A978F;font-size:12px;margin:6px 0 0">${b.footer}</p></div>`;
}

async function sendViaResend(from: string, to: string, subject: string, html: string, text: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`resend_${r.status}: ${t.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  try {
    const raw = await req.text();

    // Verify the hook signature (Supabase signs with the Standard Webhooks scheme).
    let payload: any;
    if (HOOK_SECRET) {
      const wh = new Webhook(HOOK_SECRET.replace("v1,whsec_", ""));
      payload = wh.verify(raw, {
        "webhook-id": req.headers.get("webhook-id") || "",
        "webhook-timestamp": req.headers.get("webhook-timestamp") || "",
        "webhook-signature": req.headers.get("webhook-signature") || "",
      });
    } else {
      payload = JSON.parse(raw); // unsigned: only for local/dev before the secret is set
    }

    const user = payload.user || {};
    const ed = payload.email_data || {};
    const to = user.email;
    const code = String(ed.token || "");
    if (!to || !code) return new Response(JSON.stringify({ error: "missing email or token" }), { status: 400 });

    const b = brandFor(ed.redirect_to, ed.site_url);
    console.log(`[auth-send-email] redirect_to=${ed.redirect_to || ""} site_url=${ed.site_url || ""} -> brand=${b.key}`);
    const { heading, intro, subject } = copyFor(String(ed.email_action_type || ""), b.name);
    const html = renderHtml(b, heading, intro, code);
    const text = `Your ${b.name} verification code is ${code}. Valid for 10 minutes.`;

    if (!RESEND) {
      console.error("[auth-send-email] RESEND_API_KEY not set — cannot send");
      return new Response(JSON.stringify({ error: "resend_not_configured" }), { status: 500 });
    }
    await sendViaResend(b.from, to, subject, html, text);
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[auth-send-email] error:", String((e as Error)?.message ?? e));
    // Return an error object in the shape Supabase surfaces to the client.
    return new Response(JSON.stringify({ error: { http_code: 500, message: String((e as Error)?.message ?? e) } }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
