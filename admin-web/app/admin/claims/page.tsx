"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

export default function Claims() {
  const { t } = useLang();
  const [status, setStatus] = useState("open");
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"card" | "interac">("card");
  const [busy, setBusy] = useState(false);

  const load = useCallback((s = status) => { api.claims(s).then(setList).catch(() => {}); }, [status]);
  useEffect(() => { load("open"); }, []); // eslint-disable-line

  const cap = (c: any) => c.insured ? (c.declared_value_cents ?? 0) : c.price_cents;
  const open = (c: any) => { setActive(c); setAmount((cap(c) / 100).toFixed(2)); setMethod("card"); };

  const approve = async () => {
    const cents = Math.min(Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100), cap(active));
    setBusy(true);
    try { await api.refund({ parcel_id: active.parcel_id, claim_id: active.id, action: "claim", amount_cents: cents, method }); setActive(null); load(); }
    catch (e: any) { alert(e?.message || t("Error", "Erreur")); }
    setBusy(false);
  };
  const deny = async () => { setBusy(true); try { await api.denyClaim(active.id); setActive(null); load(); } catch (e: any) { alert(e?.message); } setBusy(false); };

  // Status filter labels + status pill text (backend status keys unchanged).
  const statusLabel = (s: string) => ({ open: t("Open", "Ouvertes"), approved: t("Approved", "Approuvées"), denied: t("Denied", "Refusées") } as Record<string, string>)[s] || s;
  const pillLabel = (s: string) => ({ open: t("open", "ouverte"), approved: t("approved", "approuvée"), denied: t("denied", "refusée") } as Record<string, string>)[s] || s;

  return (
    <>
      <h1>{t("Insurance claims", "Réclamations d’assurance")}</h1>
      <div className="toolbar">{["open", "approved", "denied"].map((s) => <button key={s} className={"chip" + (status === s ? " on" : "")} onClick={() => { setStatus(s); load(s); }}>{statusLabel(s)}</button>)}</div>
      <table>
        <thead><tr><th>{t("Parcel", "Colis")}</th><th>{t("Type", "Type")}</th><th>{t("Route", "Trajet")}</th><th>{t("Policy", "Police")}</th><th>{t("Refund", "Remboursement")}</th><th></th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="clk" onClick={() => status === "open" ? open(c) : null}>
              <td>#{c.code}</td><td style={{ textTransform: "capitalize" }}>{c.type}</td>
              <td>{c.from_city} → {c.to_city}</td>
              <td>{c.insured ? `🛡️ C$${Math.round((c.declared_value_cents ?? 0) / 100)}` : t(`⚠️ fee C$${Math.round(c.price_cents / 100)}`, `⚠️ frais C$${Math.round(c.price_cents / 100)}`)}</td>
              <td>{c.refund_cents != null ? `C$${(c.refund_cents / 100).toFixed(2)}` : "—"}</td>
              <td><span className={"pill " + (c.status === "approved" ? "pg" : c.status === "denied" ? "pred" : "pmag")}>{pillLabel(c.status)}</span></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t(`No ${status} claims.`, `Aucune réclamation ${pillLabel(status)}.`)}</td></tr>}
        </tbody>
      </table>

      {active && (
        <div className="modalbg" onClick={() => setActive(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t("Claim", "Réclamation")} #{active.code} · {active.type}</h3>
            <div className="warn">{active.insured ? t(`Insured → refund up to the declared value (max C$${Math.round((active.declared_value_cents ?? 0) / 100)}).`, `Assuré → remboursement jusqu’à la valeur déclarée (max C$${Math.round((active.declared_value_cents ?? 0) / 100)}).`) : t(`Declined → cap is the shipping fee (C$${Math.round(active.price_cents / 100)}).`, `Refusée → le plafond est les frais d’envoi (C$${Math.round(active.price_cents / 100)}).`)}</div>
            <div className="mono">{t("Refund amount", "Montant du remboursement")}</div>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="row" style={{ marginTop: 10 }}>
              {(["card", "interac"] as const).map((m) => <button key={m} className={"chip" + (method === m ? " on" : "")} onClick={() => setMethod(m)}>{m === "card" ? t("Original card", "Carte d’origine") : "Interac"}</button>)}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn green" style={{ width: "100%", marginBottom: 8 }} disabled={busy} onClick={approve}>{t("Approve & refund", "Approuver et rembourser")}</button>
              <div className="row"><button className="btn ghost" style={{ flex: 1 }} onClick={() => setActive(null)}>{t("Close", "Fermer")}</button><button className="btn red" style={{ flex: 1 }} disabled={busy} onClick={deny}>{t("Deny", "Refuser")}</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
