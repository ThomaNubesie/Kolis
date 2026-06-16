"use client";
import { useLang } from "@/lib/i18n";

const BASE = "https://kzjptcpjpwlxfofzhyku.functions.supabase.co/kolis-shopify";

export default function Shopify() {
  const { t } = useLang();
  const Code = ({ children }: { children: string }) => (
    <pre style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 9, padding: 12, fontSize: 12.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{children}</pre>
  );
  return (
    <>
      <h1>{t("Shopify integration", "Intégration Shopify")}</h1>
      <div className="sub">{t("Offer Kolis same-day local delivery at your Shopify checkout — local orders flow straight into Shipments.", "Offrez la livraison locale le jour même de Kolis à la caisse Shopify — les commandes locales arrivent directement dans vos Envois.")}</div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="mono">{t("Step 1 — Create an API key", "Étape 1 — Créer une clé API")}</div>
        <p>{t("In", "Dans")} <b>Developer → {t("API keys", "Clés API")}</b>, {t("create a key with the", "créez une clé avec la portée")} <code>shipments:write</code> {t("scope. Copy it — you'll paste it into the URLs below as", "scope. Copiez-la — vous la collerez dans les URL ci-dessous comme")} <code>YOUR_KEY</code>.</p>
      </div>

      <div className="card">
        <div className="mono">{t("Step 2 — Show a rate at checkout (CarrierService)", "Étape 2 — Afficher un tarif à la caisse (CarrierService)")}</div>
        <p>{t("Register this callback URL as a Shopify CarrierService. Kolis returns a “Same-Day Local Delivery” rate when the destination is in your province.", "Enregistrez cette URL de rappel comme CarrierService Shopify. Kolis renvoie un tarif « Livraison locale le jour même » lorsque la destination est dans votre province.")}</p>
        <Code>{`${BASE}/rates?key=YOUR_KEY`}</Code>
        <p className="sub">{t("Register it via the Shopify Admin API:", "Enregistrez-la via l’API Admin de Shopify :")}</p>
        <Code>{`POST https://YOUR-STORE.myshopify.com/admin/api/2024-10/carrier_services.json
{
  "carrier_service": {
    "name": "Kolis Same-Day",
    "callback_url": "${BASE}/rates?key=YOUR_KEY",
    "service_discovery": true
  }
}`}</Code>
      </div>

      <div className="card">
        <div className="mono">{t("Step 3 — Import chosen orders (webhook)", "Étape 3 — Importer les commandes choisies (webhook)")}</div>
        <p>{t("Add an", "Ajoutez un webhook")} <b>orders/create</b> {t("webhook pointing here. Orders where the buyer picked Kolis delivery become shipments automatically (deduplicated per order).", "pointant ici. Les commandes où l’acheteur a choisi la livraison Kolis deviennent automatiquement des envois (dédoublonnés par commande).")}</p>
        <Code>{`${BASE}/orders?key=YOUR_KEY`}</Code>
        <p className="sub">{t("Shopify → Settings → Notifications → Webhooks → Create webhook → Event: Order creation → Format: JSON → paste the URL above.", "Shopify → Paramètres → Notifications → Webhooks → Créer un webhook → Événement : Création de commande → Format : JSON → collez l’URL ci-dessus.")}</p>
      </div>

      <div className="card">
        <div className="mono">{t("That's it", "C’est tout")}</div>
        <p>{t("Buyers in your delivery area see Kolis at checkout; those orders appear in", "Les acheteurs de votre zone voient Kolis à la caisse ; ces commandes apparaissent dans")} <b>{t("Shipments", "Envois")}</b> {t("and are dispatched to a local courier. Recipients get tracking notifications automatically.", "et sont confiées à un livreur local. Les destinataires reçoivent automatiquement des notifications de suivi.")}</p>
      </div>
    </>
  );
}
