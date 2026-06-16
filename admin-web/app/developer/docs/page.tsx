"use client";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const API_BASE = "https://kzjptcpjpwlxfofzhyku.functions.supabase.co/kolis-api";

export default function Docs() {
  const { active } = useOrg();
  const { t } = useLang();
  return (
    <>
      <h1>{t("API docs", "Documentation API")}</h1>
      <div className="sub">{active.name} · {t("create shipments programmatically. Authenticate with an org API key.", "créez des envois par programmation. Authentifiez-vous avec une clé API d’organisation.")}</div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="mono">{t("Create a shipment", "Créer un envoi")}</p>
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
        <p className="mono" style={{ marginTop: 14 }}>{t("Response (201)", "Réponse (201)")}</p>
        <pre style={{ background: "#15110f", color: "#e8e2ef", borderRadius: 10, padding: 16, fontSize: 12.5, lineHeight: 1.6 }}>{`{ "shipment": { "id": "…", "code": "KL-8093", "status": "requested", "price_cents": 4500 } }`}</pre>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="mono">{t("Webhook events", "Événements de webhook")}</p>
        <div className="sub" style={{ margin: "0 0 8px" }}>{t("POSTed to your endpoint, signed with", "envoyés en POST à votre point de terminaison, signés avec")} <code>x-kolis-signature</code> {t("(HMAC-SHA256 of the body using your endpoint secret).", "(HMAC-SHA256 du corps à l’aide du secret de votre point de terminaison).")}</div>
        {["shipment.created", "shipment.matched", "shipment.picked_up", "shipment.in_transit", "shipment.delivered", "shipment.cancelled"].map((e) => (
          <div key={e} style={{ fontSize: 13, padding: "3px 0" }}><code>{e}</code></div>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <p className="mono">{t("Errors", "Erreurs")}</p>
        <div className="kv"><span className="k">401 unauthorized</span><span className="v">{t("missing / invalid / revoked key", "clé manquante / invalide / révoquée")}</span></div>
        <div className="kv"><span className="k">403 insufficient_scope</span><span className="v">{t("key lacks", "la clé n’a pas")} <code>shipments:write</code></span></div>
        <div className="kv"><span className="k">402 credit_limit_exceeded</span><span className="v">{t("org over its credit limit", "organisation au-delà de sa limite de crédit")}</span></div>
        <div className="kv"><span className="k">403 org_inactive</span><span className="v">{t("org suspended (overdue / over limit)", "organisation suspendue (en souffrance / hors limite)")}</span></div>
      </div>
    </>
  );
}
