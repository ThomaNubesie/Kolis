// Public Shopify App backend: OAuth install + callback (auto-registers the
// CarrierService rate callback + orders webhook), plus the mandatory GDPR
// compliance webhooks. Needs SHOPIFY_API_KEY / SHOPIFY_API_SECRET (from your
// Shopify Partner app). Deploy with --no-verify-jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("SHOPIFY_API_KEY") || "";
const API_SECRET = Deno.env.get("SHOPIFY_API_SECRET") || "";
const SCOPES = "read_orders,write_orders,write_shipping";
const BASE = "https://kzjptcpjpwlxfofzhyku.functions.supabase.co";
const SHOPIFY_FN = `${BASE}/kolis-shopify`;     // rates + orders endpoints
const CB = `${BASE}/kolis-shopify-auth/callback`;
const API_VER = "2025-10"; // keep on a currently-supported Admin API version

const enc = new TextEncoder();
async function hmac(secret: string, msg: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, msg);
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const okShop = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(s);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Verify an App Bridge session token (HS256 JWT signed with the app secret).
async function verifyJwt(token: string): Promise<any | null> {
  try {
    const [h, p, s] = token.split("."); if (!h || !p || !s) return null;
    const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", enc.encode(API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("HMAC", key, sig, enc.encode(`${h}.${p}`)))) return null;
    const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

// Store the token, auto-provision the Kolis org (from shop.json email), and
// register the CarrierService + orders webhook. Used after token exchange.
async function provisionAndRegister(admin: any, shop: string, token: string) {
  let shopName = shop, shopEmail: string | null = null;
  try {
    const s = await fetch(`https://${shop}/admin/api/${API_VER}/shop.json`, { headers: { "X-Shopify-Access-Token": token } }).then((r) => r.json());
    shopName = s?.shop?.name || shop; shopEmail = s?.shop?.email || null;
  } catch { /* ignore */ }
  await admin.from("kolis_shopify_shops").upsert({ shop_domain: shop, access_token: token, shop_name: shopName, shop_email: shopEmail, uninstalled_at: null }, { onConflict: "shop_domain" });
  try {
    let ownerId: string | null = null;
    if (shopEmail) {
      const c = await admin.auth.admin.createUser({ email: shopEmail, email_confirm: true });
      ownerId = c.data?.user?.id ?? null;
      if (!ownerId) { const { data } = await admin.rpc("kolis_auth_user_by_email", { p_email: shopEmail }); ownerId = (data as string) ?? null; }
    }
    // always provision the org (owner attached only if we have an email)
    await admin.rpc("kolis_shopify_provision", { p_shop: shop, p_name: shopName, p_owner_user: ownerId, p_email: shopEmail });
  } catch { /* best-effort */ }
  const sh = (p: string, body: unknown) => fetch(`https://${shop}/admin/api/${API_VER}/${p}`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  await sh("carrier_services.json", { carrier_service: { name: "Kolis Same-Day", callback_url: `${SHOPIFY_FN}/rates?shop=${shop}`, service_discovery: true } });
  await sh("webhooks.json", { webhook: { topic: "orders/create", address: `${SHOPIFY_FN}/orders?shop=${shop}`, format: "json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const path = url.pathname;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // ── Token exchange (modern, expiring tokens): embedded app posts its
    //    App Bridge session token; we exchange it for an offline access token. ──
    if (path.endsWith("/exchange")) {
      const { shop, session_token } = await req.json().catch(() => ({}));
      if (!okShop(shop || "") || !session_token) return json({ error: "bad request" }, 400);
      const payload = await verifyJwt(session_token);
      if (!payload) return json({ error: "invalid session token" }, 401);
      if ((payload.dest || "").replace(/^https?:\/\//, "") !== shop) return json({ error: "shop mismatch" }, 401);
      const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: API_KEY, client_secret: API_SECRET,
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: session_token,
          subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
          requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
        }),
      }).then((x) => x.json());
      if (!r.access_token) return json({ error: "exchange failed", detail: r }, 502);
      await provisionAndRegister(admin, shop, r.access_token);
      return json({ ok: true });
    }

    // ── Embedded app status (read by the in-Shopify UI) ──
    if (path.endsWith("/status")) {
      const shop = (url.searchParams.get("shop") || "").toLowerCase();
      const { data: s } = await admin.from("kolis_shopify_shops").select("shop_name, org_id, uninstalled_at").eq("shop_domain", shop).maybeSingle();
      if (!s) return json({ installed: false });
      let orgName: string | null = null;
      if (s.org_id) { const { data: o } = await admin.from("kolis_orgs").select("name").eq("id", s.org_id).maybeSingle(); orgName = o?.name ?? null; }
      return json({ installed: !s.uninstalled_at, shop_name: s.shop_name, connected: !!s.org_id, org_name: orgName });
    }
    // ── Step 1: install → redirect merchant to Shopify's consent screen ──
    if (path.endsWith("/install")) {
      const shop = (url.searchParams.get("shop") || "").toLowerCase();
      if (!okShop(shop)) return new Response("bad shop", { status: 400 });
      const state = crypto.randomUUID();
      const auth = `https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(CB)}&state=${state}`;
      return Response.redirect(auth, 302);
    }

    // ── Step 2: callback → verify HMAC, exchange token, auto-register, store ──
    if (path.endsWith("/callback")) {
      const shop = (url.searchParams.get("shop") || "").toLowerCase();
      const code = url.searchParams.get("code") || "";
      const got = url.searchParams.get("hmac") || "";
      if (!okShop(shop) || !code) return new Response("bad request", { status: 400 });
      // verify hmac over the sorted query string (minus hmac)
      const params = [...url.searchParams.entries()].filter(([k]) => k !== "hmac").sort(([a], [b]) => a.localeCompare(b));
      const msg = params.map(([k, v]) => `${k}=${v}`).join("&");
      const calc = hex(await hmac(API_SECRET, enc.encode(msg)));
      if (calc !== got) return new Response("hmac mismatch", { status: 401 });

      // exchange the code for a permanent access token
      const tok = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code }),
      }).then((r) => r.json());
      const token = tok.access_token as string;
      if (!token) return new Response("token exchange failed", { status: 502 });

      // fetch shop name/email (best-effort)
      let shopName = shop, shopEmail = null;
      try {
        const s = await fetch(`https://${shop}/admin/api/${API_VER}/shop.json`, { headers: { "X-Shopify-Access-Token": token } }).then((r) => r.json());
        shopName = s?.shop?.name || shop; shopEmail = s?.shop?.email || null;
      } catch { /* ignore */ }

      await admin.from("kolis_shopify_shops").upsert({ shop_domain: shop, access_token: token, scope: tok.scope, shop_name: shopName, shop_email: shopEmail, uninstalled_at: null }, { onConflict: "shop_domain" });

      // auto-provision a Kolis org owned by the shop's email (best-effort)
      try {
        if (shopEmail) {
          const c = await admin.auth.admin.createUser({ email: shopEmail, email_confirm: true });
          let ownerId = c.data?.user?.id ?? null;
          if (!ownerId) { const { data } = await admin.rpc("kolis_auth_user_by_email", { p_email: shopEmail }); ownerId = (data as string) ?? null; }
          if (ownerId) await admin.rpc("kolis_shopify_provision", { p_shop: shop, p_name: shopName, p_owner_user: ownerId, p_email: shopEmail });
        }
      } catch { /* provisioning is best-effort; staff can link later */ }

      // auto-register: CarrierService (rate at checkout) + orders/create webhook
      const sh = (p: string, body: unknown) => fetch(`https://${shop}/admin/api/${API_VER}/${p}`, {
        method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).catch(() => null);
      await sh("carrier_services.json", { carrier_service: { name: "Kolis Same-Day", callback_url: `${SHOPIFY_FN}/rates?shop=${shop}`, service_discovery: true } });
      await sh("webhooks.json", { webhook: { topic: "orders/create", address: `${SHOPIFY_FN}/orders?shop=${shop}`, format: "json" } });
      await sh("webhooks.json", { webhook: { topic: "app/uninstalled", address: `${BASE}/kolis-shopify-auth/compliance?topic=uninstalled`, format: "json" } });

      // back to the merchant's admin
      return Response.redirect(`https://${shop}/admin/apps`, 302);
    }

    // ── Mandatory GDPR / uninstall webhooks (verify body HMAC) ──
    if (path.endsWith("/compliance")) {
      const raw = new Uint8Array(await req.arrayBuffer());
      const got = req.headers.get("x-shopify-hmac-sha256") || "";
      if (b64(await hmac(API_SECRET, raw)) !== got) return new Response("unauthorized", { status: 401 });
      const topic = (req.headers.get("x-shopify-topic") || url.searchParams.get("topic") || "").toLowerCase();
      const shop = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase();
      if (topic.includes("uninstall")) {
        await admin.from("kolis_shopify_shops").update({ uninstalled_at: new Date().toISOString(), access_token: null }).eq("shop_domain", shop);
      } else if (topic.includes("redact")) {
        // shop/redact → remove our record; customer redact → nothing PII stored by us
        if (topic.includes("shop")) await admin.from("kolis_shopify_shops").delete().eq("shop_domain", shop);
      }
      return new Response("ok", { status: 200 });
    }

    return new Response("not found", { status: 404 });
  } catch (e) {
    return new Response(String((e as Error)?.message ?? e), { status: 500 });
  }
});
