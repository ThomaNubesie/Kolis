"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";
import { BellOff, RotateCw } from "lucide-react";

// Notifications that exhausted their retries (state = 'dead') — usually a bad
// phone/email. Staff can inspect and re-queue them.
const KIND: Record<string, string> = {
  created: "Created", incoming: "Delivery code", pickup: "Pickup", picked_up: "Picked up",
  in_transit: "In transit", delivered: "Delivered",
};

export default function DeadNotifications() {
  const { t, lang } = useLang();
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const when = (s?: string) => s ? new Date(s).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const load = useCallback(() => { api.deadNotifications().then((r) => setList(r || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const retry = async (id: string) => {
    setBusy(id);
    try { await api.retryNotification(id); load(); } catch (e: any) { alert(e?.message || "Error"); }
    setBusy(null);
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}><BellOff size={20} strokeWidth={2} /> {t("Failed notifications", "Notifications échouées")}</h1>
          <div className="sub">{t("Texts/emails that exhausted all retries — usually a bad phone or email. Fix the contact, then re-queue.", "Textos/courriels ayant épuisé les tentatives — souvent un mauvais numéro ou courriel. Corrigez le contact, puis relancez.")}</div>
        </div>
        <button className="btn ghost" onClick={load} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RotateCw size={15} strokeWidth={2} /> {t("Refresh", "Actualiser")}</button>
      </div>

      <table style={{ marginTop: 14 }}>
        <thead><tr><th>{t("Parcel", "Colis")}</th><th>{t("Notification", "Notification")}</th><th>{t("Recipient", "Destinataire")}</th><th>{t("Tries", "Essais")}</th><th>{t("Last error", "Dernière erreur")}</th><th>{t("Last try", "Dernier essai")}</th><th></th></tr></thead>
        <tbody>
          {list.map((n) => (
            <tr key={n.id}>
              <td><b>{n.code}</b><div className="sub" style={{ fontSize: 11.5 }}>{n.parcel_status}</div></td>
              <td>{KIND[n.kind] || n.kind}</td>
              <td>{n.recipient_name || "—"}<div className="sub" style={{ fontSize: 11.5 }}>{n.recipient_phone || n.recipient_email || t("no contact", "aucun contact")}</div></td>
              <td>{n.attempts}</td>
              <td className="sub" style={{ fontSize: 12, maxWidth: 220 }}>{n.last_error || "—"}</td>
              <td style={{ whiteSpace: "nowrap", color: "var(--t2)" }}>{when(n.last_attempt_at)}</td>
              <td><button className="btn" disabled={busy === n.id} onClick={() => retry(n.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RotateCw size={14} strokeWidth={2} /> {busy === n.id ? t("…", "…") : t("Re-queue", "Relancer")}</button></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>{t("✓ No failed notifications — everything went out.", "✓ Aucune notification échouée — tout est parti.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
