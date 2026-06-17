"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";

const SHOPIFY_CLIENT_ID = "ed2ed976ca0ff4a209a75db345a0914c"; // public app key (App Bridge)

// Embedded Shopify app screen (loads inside the Shopify admin iframe). Shows the
// connection status + quick links. Links use target=_top to break out of the iframe.
const FUNCTIONS = "https://kzjptcpjpwlxfofzhyku.functions.supabase.co";
const PORTAL = "https://business.kolis.ca";

export default function Page() {
  return <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><ShopifyApp /></Suspense>;
}

function ShopifyApp() {
  const params = useSearchParams();
  const shop = (params.get("shop") || "").toLowerCase();
  const [st, setSt] = useState<any | undefined>(undefined);

  useEffect(() => {
    if (!shop) { setSt(null); return; }
    let cancelled = false;
    (async () => {
      // When embedded in Shopify admin, exchange the App Bridge session token for
      // an (expiring) access token so the backend can provision + register.
      try {
        for (let i = 0; i < 25 && !(window as any).shopify?.idToken; i++) await new Promise((r) => setTimeout(r, 150));
        const idToken = await (window as any).shopify?.idToken?.();
        if (idToken) await fetch(`${FUNCTIONS}/kolis-shopify-auth/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop, session_token: idToken }) });
      } catch { /* not embedded / no App Bridge — fine */ }
      if (cancelled) return;
      fetch(`${FUNCTIONS}/kolis-shopify-auth/status?shop=${encodeURIComponent(shop)}`).then((r) => r.json()).then((d) => !cancelled && setSt(d)).catch(() => !cancelled && setSt(null));
    })();
    return () => { cancelled = true; };
  }, [shop]);

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: "#fff", border: "1px solid #E3E3E8", borderRadius: 14, padding: 22, marginBottom: 16, ...style }}>{children}</div>
  );
  const Btn = ({ href, children, ghost }: { href: string; children: string; ghost?: boolean }) => (
    <a href={href} target="_top" style={{ display: "inline-block", textDecoration: "none", fontWeight: 700, fontSize: 14, padding: "11px 18px", borderRadius: 10, marginRight: 10, ...(ghost ? { color: "#E11D6B", border: "1px solid #E11D6B" } : { background: "#E11D6B", color: "#fff" }) }}>{children}</a>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F6F6F8", fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif", color: "#1a1722" }}>
      <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={SHOPIFY_CLIENT_ID} strategy="afterInteractive" />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "#E11D6B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>Ko</div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Kolis Same-Day Delivery</div>
        </div>

        {st === undefined ? <Card>Loading…</Card> : !st?.installed ? (
          <Card>
            <h2 style={{ marginTop: 0 }}>Connect your store</h2>
            <p style={{ color: "#6B6675" }}>Install Kolis to offer same-day local delivery at your checkout.</p>
            {shop ? <Btn href={`${FUNCTIONS}/kolis-shopify-auth/install?shop=${encodeURIComponent(shop)}`}>Install Kolis</Btn> : <p style={{ color: "#b00" }}>Open this from your Shopify admin.</p>}
          </Card>
        ) : (
          <>
            <Card style={{ borderColor: "#bdebd6", background: "#f4fbf7" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 13, background: "#178a5e", color: "#fff", textAlign: "center", lineHeight: "26px", fontWeight: 800 }}>✓</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>Kolis is connected</div>
                  <div style={{ color: "#6B6675", fontSize: 13 }}>{st.shop_name}{st.org_name ? ` · ${st.org_name}` : ""}</div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>What's live</h3>
              <p style={{ margin: "6px 0", color: "#3a3744" }}>✅ <b>“Kolis Same-Day Local Delivery”</b> shows at checkout for local addresses.</p>
              <p style={{ margin: "6px 0", color: "#3a3744" }}>✅ Orders that pick it are <b>auto-imported</b> and dispatched to a local courier.</p>
              <p style={{ margin: "6px 0", color: "#3a3744" }}>✅ Recipients get branded tracking + delivery-code notifications.</p>
              {!st.connected ? <p style={{ color: "#8a6d2a", background: "#fdf6e6", border: "1px solid #e8b54a88", borderRadius: 10, padding: 11, fontSize: 13 }}>⏳ Finishing account setup — orders will start importing in a moment.</p> : null}
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>Manage</h3>
              <p style={{ color: "#6B6675", marginTop: 0 }}>Set your delivery rate, branding, and see all shipments in your Kolis dashboard.</p>
              <Btn href={PORTAL}>Open Kolis dashboard</Btn>
              <Btn href={`${PORTAL}/shipper/branding`} ghost>Branding &amp; rate</Btn>
            </Card>
          </>
        )}
        <div style={{ textAlign: "center", color: "#9b97a6", fontSize: 12, marginTop: 8 }}>Powered by Kolis · Concord Express Co Inc.</div>
      </div>
    </div>
  );
}
