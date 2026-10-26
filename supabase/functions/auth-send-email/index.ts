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

type Brand = { key: string; name: string; initial: string; brand: string; ink: string; from: string };
const BRANDS: Record<string, Brand> = {
  kolis:  { key: "kolis",  name: "Kolis",  initial: "K", brand: "#E11D6B", ink: "#0F1A17", from: Deno.env.get("KOLIS_FROM_EMAIL")  || "Kolis <noreply@kolis.ca>" },
  loadq:  { key: "loadq",  name: "LoadQ",  initial: "L", brand: "#FF8A1A", ink: "#1A1205", from: Deno.env.get("LOADQ_FROM_EMAIL")  || "LoadQ <noreply@loadq.ca>" },
  quorly: { key: "quorly", name: "Quorly", initial: "Q", brand: "#4F46E5", ink: "#141427", from: Deno.env.get("QUORLY_FROM_EMAIL") || "Quorly <noreply@quorly.ca>" },
};

function brandFor(redirect?: string, site?: string): Brand {
  const s = `${redirect || ""} ${site || ""}`.toLowerCase();
  if (s.includes("kolis")) return BRANDS.kolis;
  if (s.includes("quorly")) return BRANDS.quorly;
  if (s.includes("loadq")) return BRANDS.loadq;
  return BRANDS.loadq; // incumbent default when nothing distinguishes it
}

// Heading + intro per auth action. Everything is a short "here is your code" email.
function copyFor(action: string, name: string): { heading: string; intro: string; subject: string } {
  switch (action) {
    case "signup":
      return { heading: "Confirm your email", intro: `Use this code to finish signing up to ${name}.`, subject: `Your ${name} confirmation code` };
    case "recovery":
      return { heading: "Reset your password", intro: `Use this code to reset your ${name} password.`, subject: `Your ${name} password reset code` };
    case "invite":
      return { heading: "You're invited", intro: `Use this code to join ${name}.`, subject: `Your ${name} invite code` };
    case "email_change":
    case "email_change_new":
      return { heading: "Confirm your email change", intro: `Use this code to confirm your new email on ${name}.`, subject: `Confirm your email on ${name}` };
    case "reauthentication":
      return { heading: "Confirm it's you", intro: `Enter this code in ${name} to continue.`, subject: `Your ${name} code` };
    default: // magiclink / login / otp
      return { heading: "Your sign-in code", intro: `Enter this code in the ${name} app to sign in.`, subject: `Your ${name} sign-in code` };
  }
}

function renderHtml(b: Brand, heading: string, intro: string, code: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#eceef1;padding:24px 0;margin:0">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9ec">
    <div style="padding:26px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
        <td style="width:40px;height:40px;background:${b.brand};border-radius:11px;color:#fff;font-weight:800;font-size:18px;text-align:center;vertical-align:middle">${b.initial}</td>
        <td style="padding-left:10px;font-weight:800;font-size:15px;color:${b.ink};vertical-align:middle">${b.name}</td>
      </tr></table>
      <h2 style="font-size:17px;color:${b.ink};margin:0 0 6px">${heading}</h2>
      <p style="color:#6b7772;font-size:13.5px;line-height:1.5;margin:0 0 16px">${intro}</p>
      <div style="background:${b.ink};border-radius:12px;padding:18px 20px;text-align:center">
        <span style="font-weight:800;letter-spacing:.3em;font-size:30px;color:${b.brand}">${code}</span>
      </div>
      <p style="color:#9aa4ab;font-size:12px;margin:14px 0 0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>
    <div style="font-size:11px;color:#9aa4ab;border-top:1px solid #eef1f3;padding:14px 26px">&copy; ${b.name} &middot; ${b.from.replace(/.*<|>.*/g, "")}</div>
  </div>
</div>`;
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
    const { heading, intro, subject } = copyFor(String(ed.email_action_type || ""), b.name);
    const html = renderHtml(b, heading, intro, code);
    const text = `${heading}\n\n${intro}\n\nCode: ${code}\n\nThis code expires in 10 minutes.`;

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
