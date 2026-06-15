"use client";
import { useOrg } from "@/lib/org-context";

const API_BASE = "https://kzjptcpjpwlxfofzhyku.functions.supabase.co/kolis-api";

export default function Docs() {
  const { active } = useOrg();
  return (
    <>
      <h1>API docs</h1>
      <div className="sub">{active.name} · create shipments programmatically. Authenticate with an org API key.</div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="mono">Create a shipment</p>
        <pre style={{ background: "#15110f", color: "#e8e2ef", borderRadius: 10, padding: 16, overflow: "auto", fontSize: 12.5, lineHeight: 1.6 }}>{`curl ${API_BASE} \\
  -H "Authorization: Bearer kolis_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to_name":   "Acme Retail",
    "to_phone":  "+15145550148",
    "to_city":   "Montréal",
    "to_address":"1240 Rue Sainte-Catherine",
    "size":      "small",          // envelope | small | large
    "pickup":    "door",           // door | hub | zone
    "client_ref":"order-10231"     // idempotency: same ref → same shipment
  }'`}</pre>
        <p className="mono" style={{ marginTop: 14 }}>Response (201)</p>
        <pre style={{ background: "#15110f", color: "#e8e2ef", borderRadius: 10, padding: 16, fontSize: 12.5, lineHeight: 1.6 }}>{`{ "shipment": { "id": "…", "code": "KL-8093", "status": "requested", "price_cents": 4500 } }`}</pre>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="mono">Webhook events</p>
        <div className="sub" style={{ margin: "0 0 8px" }}>POSTed to your endpoint, signed with <code>x-kolis-signature</code> (HMAC-SHA256 of the body using your endpoint secret).</div>
        {["shipment.created", "shipment.matched", "shipment.picked_up", "shipment.in_transit", "shipment.delivered", "shipment.cancelled"].map((e) => (
          <div key={e} style={{ fontSize: 13, padding: "3px 0" }}><code>{e}</code></div>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="mono">Errors</p>
        <div className="kv"><span className="k">401 unauthorized</span><span className="v">missing / invalid / revoked key</span></div>
        <div className="kv"><span className="k">403 insufficient_scope</span><span className="v">key lacks <code>shipments:write</code></span></div>
        <div className="kv"><span className="k">402 credit_limit_exceeded</span><span className="v">org over its credit limit</span></div>
        <div className="kv"><span className="k">403 org_inactive</span><span className="v">org suspended (overdue / over limit)</span></div>
      </div>
    </>
  );
}
