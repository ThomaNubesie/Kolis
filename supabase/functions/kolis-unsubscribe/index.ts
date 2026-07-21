// kolis-unsubscribe: public one-click unsubscribe for promo emails (CASL).
// Token = kolis_org_clients.unsubscribe_token. GET shows a confirmation page;
// POST (List-Unsubscribe-Post one-click) returns 200. No auth (verify_jwt=false).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const page = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:60px auto;text-align:center;color:#0F1A17">
    <img src="https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png" width="48" height="48" style="border-radius:12px"/>
    <h2 style="margin:16px 0 6px">${msg}</h2>
    <p style="color:#8A978F;font-size:13px">You can close this window.</p>
  </div>`;

async function unsub(token: string | null): Promise<boolean> {
  if (!token) return false;
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data, error } = await admin.from("kolis_org_clients")
    .update({ marketing_consent: false, unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token).select("id");
  return !error && !!data?.length;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (req.method === "POST") {
    const ok = await unsub(token);
    return new Response(ok ? "unsubscribed" : "not_found", { status: ok ? 200 : 404 });
  }
  const ok = await unsub(token);
  return new Response(page(ok ? "You've been unsubscribed." : "Link invalid or already unsubscribed."), {
    status: ok ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
