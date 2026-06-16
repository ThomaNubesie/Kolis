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

  const addCard = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await org.setupCard(active.org_id);
      if (res.skipped) setMsg(t("Card-on-file is enabled at go-live (Stripe test key not yet configured).", "La carte enregistrée sera activée au lancement (clé de test Stripe pas encore configurée)."));
      else if (res.clientSecret) setMsg(t("Setup ready — secure card entry (Stripe Elements) opens here at go-live.", "Configuration prête — la saisie sécurisée de la carte (Stripe Elements) s’ouvrira ici au lancement."));
      else setMsg(t("Unexpected response.", "Réponse inattendue."));
    } catch (e: any) { setMsg(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  const usedPct = ov && ov.credit_limit_cents > 0 ? Math.min(100, Math.round((ov.outstanding_cents / ov.credit_limit_cents) * 100)) : 0;

  return (
    <>
      <h1>{t("Billing", "Facturation")}</h1>
      <div className="sub">{t(`${active.name} · net terms — shipments bill on a monthly invoice. A card on file is a backstop for overdue invoices.`, `${active.name} · conditions nettes — les envois sont facturés sur une facture mensuelle. Une carte enregistrée sert de garantie pour les factures en souffrance.`)}</div>

      <div className="tiles">
        <div className="tile"><div className="l">{t("Credit limit", "Limite de crédit")}</div><div className="n">{ov ? money(ov.credit_limit_cents) : "—"}</div></div>
        <div className="tile"><div className="l">{t("Outstanding", "Solde dû")}</div><div className="n">{ov ? money(ov.outstanding_cents) : "—"}</div></div>
        <div className="tile"><div className="l">{t("Available", "Disponible")}</div><div className="n" style={{ color: "var(--green)" }}>{ov ? money(ov.available_cents) : "—"}</div></div>
      </div>

      {ov && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="mono">{t("Credit used", "Crédit utilisé")} · {usedPct}%</div>
          <div style={{ height: 10, background: "var(--cardAlt)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${usedPct}%`, height: "100%", background: usedPct > 90 ? "var(--red)" : "var(--accent)" }} />
          </div>
          {ov.org_status === "suspended" && <div className="warn" style={{ marginTop: 10 }}>{t("⚠️ This account is suspended (over limit or overdue). New shipments are blocked until the balance is paid down.", "⚠️ Ce compte est suspendu (limite dépassée ou en souffrance). Les nouveaux envois sont bloqués tant que le solde n’est pas réglé.")}</div>}
        </div>
      )}

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="mono">{t("Card on file (backstop)", "Carte enregistrée (garantie)")}</div>
        <div className="sub" style={{ margin: "0 0 10px" }}>{t("Charged only if an invoice goes overdue. Primary billing is the monthly invoice.", "Débitée seulement si une facture devient en souffrance. La facturation principale demeure la facture mensuelle.")}</div>
        {active.role === "owner"
          ? <button className="btn" disabled={busy} onClick={addCard}>{busy ? "…" : t("Add card on file", "Ajouter une carte")}</button>
          : <div className="sub">{t("Only the account owner can manage billing.", "Seul le propriétaire du compte peut gérer la facturation.")}</div>}
        {msg ? <div className="sub" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>
    </>
  );
}
