"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Billing() {
  const { active } = useOrg();
  const { t } = useLang();
  const [ov, setOv] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { org.overview(active.org_id).then(setOv).catch(() => {}); }, [active.org_id]);

  // Coming back from Stripe hosted Checkout (?card=saved | ?card=cancel).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("card");
    if (p) window.history.replaceState({}, "", window.location.pathname);
    if (p === "cancel") { setMsg(t("Card setup cancelled.", "Ajout de carte annulé.")); return; }
    if (p === "saved") {
      // Record the card as default immediately (don't wait on the webhook).
      org.confirmCard(active.org_id)
        .then((r) => setMsg(r?.has_card
          ? t(`✓ Card saved (•••• ${r.last4}). It'll be used to pay for your shipments.`, `✓ Carte enregistrée (•••• ${r.last4}). Elle servira à payer vos envois.`)
          : t("✓ Card saved. It'll be used to pay for your shipments.", "✓ Carte enregistrée. Elle servira à payer vos envois.")))
        .catch(() => setMsg(t("✓ Card saved.", "✓ Carte enregistrée.")));
    }
  }, [active.org_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addCard = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await org.setupCard(active.org_id);
      if (res.url) { window.location.href = res.url; return; } // redirect to Stripe hosted Checkout
      if (res.skipped) setMsg(t("Card-on-file is enabled at go-live (Stripe test key not yet configured).", "La carte enregistrée sera activée au lancement (clé de test Stripe pas encore configurée)."));
      else setMsg(res.error || t("Unexpected response.", "Réponse inattendue."));
    } catch (e: any) { setMsg(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  const usedPct = ov && ov.credit_limit_cents > 0 ? Math.min(100, Math.round((ov.outstanding_cents / ov.credit_limit_cents) * 100)) : 0;
  const payg = ov ? ov.payg !== false : true; // default to PAYG until overview loads

  return (
    <>
      <h1>{t("Billing", "Facturation")}</h1>
      <div className="sub">{payg
        ? t(`${active.name} · pay-as-you-go — your card on file is charged automatically for each shipment. No invoices, no minimums.`, `${active.name} · paiement à l’usage — votre carte enregistrée est débitée automatiquement pour chaque envoi. Aucune facture, aucun minimum.`)
        : t(`${active.name} · net terms — shipments bill on a monthly invoice. A card on file is a backstop for overdue invoices.`, `${active.name} · conditions nettes — les envois sont facturés sur une facture mensuelle. Une carte enregistrée sert de garantie pour les factures en souffrance.`)}</div>

      {!payg && (
        <div className="tiles">
          <div className="tile"><div className="l">{t("Credit limit", "Limite de crédit")}</div><div className="n">{ov ? money(ov.credit_limit_cents) : "—"}</div></div>
          <div className="tile"><div className="l">{t("Outstanding", "Solde dû")}</div><div className="n">{ov ? money(ov.outstanding_cents) : "—"}</div></div>
          <div className="tile"><div className="l">{t("Available", "Disponible")}</div><div className="n" style={{ color: "var(--green)" }}>{ov ? money(ov.available_cents) : "—"}</div></div>
        </div>
      )}

      {ov && !payg && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="mono">{t("Credit used", "Crédit utilisé")} · {usedPct}%</div>
          <div style={{ height: 10, background: "var(--cardAlt)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${usedPct}%`, height: "100%", background: usedPct > 90 ? "var(--red)" : "var(--accent)" }} />
          </div>
          {ov.org_status === "suspended" && <div className="warn" style={{ marginTop: 10 }}>{t("⚠️ This account is suspended (over limit or overdue). New shipments are blocked until the balance is paid down.", "⚠️ Ce compte est suspendu (limite dépassée ou en souffrance). Les nouveaux envois sont bloqués tant que le solde n’est pas réglé.")}</div>}
        </div>
      )}

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="mono">{payg ? t("Payment method", "Moyen de paiement") : t("Card on file (backstop)", "Carte enregistrée (garantie)")}</div>
        <div className="sub" style={{ margin: "0 0 10px" }}>{payg
          ? (ov?.has_card
              ? t("✓ Card on file — charged automatically for each shipment you create.", "✓ Carte enregistrée — débitée automatiquement pour chaque envoi que vous créez.")
              : t("Add a card to pay for your shipments. Each shipment is charged to it automatically when you create it.", "Ajoutez une carte pour payer vos envois. Chaque envoi y est débité automatiquement à sa création."))
          : t("Charged only if an invoice goes overdue. Primary billing is the monthly invoice.", "Débitée seulement si une facture devient en souffrance. La facturation principale demeure la facture mensuelle.")}</div>
        {active.role === "owner"
          ? <button className="btn" disabled={busy} onClick={addCard}>{busy ? "…" : (ov?.has_card ? t("Update card", "Mettre à jour la carte") : t("Add a card", "Ajouter une carte"))}</button>
          : <div className="sub">{t("Only the account owner can manage billing.", "Seul le propriétaire du compte peut gérer la facturation.")}</div>}
        {msg ? <div className="sub" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>
    </>
  );
}
