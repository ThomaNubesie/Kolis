"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const EVENTS = ["shipment.created", "shipment.matched", "shipment.picked_up", "shipment.in_transit", "shipment.delivered", "shipment.cancelled"];
const fmt = (d: string) => (d ? new Date(d).toLocaleString() : "—");

export default function Webhooks() {
  const { active } = useOrg();
  const { t } = useLang();
  const canManage = active.role === "owner" || active.role === "admin";
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    org.webhooks(active.org_id).then(setEndpoints).catch(() => {});
    org.webhookDeliveries(active.org_id).then(setDeliveries).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr("");
    try { await org.createWebhook(active.org_id, url.trim(), []); setUrl(""); load(); }
    catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };
  const del = async (id: string) => { if (!confirm(t("Delete this endpoint?", "Supprimer ce point de terminaison?"))) return; try { await org.deleteWebhook(active.org_id, id); load(); } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); } };

  const pill = (s: string) => (s === "delivered" ? "pg" : s === "failed" ? "pred" : s === "sending" ? "pblue" : "pgold");
  const deliveryLabel = (s: string) => ({ delivered: t("delivered", "livré"), failed: t("failed", "échec"), sending: t("sending", "envoi"), pending: t("pending", "en attente") }[s] || s);

  return (
    <>
      <h1>Webhooks</h1>
      <div className="sub">{active.name} · {t("we POST signed events (header", "nous envoyons des événements signés (en-tête")} <code>x-kolis-signature</code>{t(", HMAC-SHA256) on every status change.", ", HMAC-SHA256) à chaque changement de statut.")}</div>

      {canManage && (
        <div className="card" style={{ maxWidth: 620 }}>
          <p className="mono">{t("Add endpoint (receives all events)", "Ajouter un point de terminaison (reçoit tous les événements)")}</p>
          <div className="row">
            <input className="input" placeholder="https://yourapp.com/hooks/kolis" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={busy} onClick={add}>{t("Add", "Ajouter")}</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}

      <table>
        <thead><tr><th>{t("Endpoint", "Point de terminaison")}</th><th>{t("Events", "Événements")}</th><th>{t("Status", "Statut")}</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {endpoints.map((w) => (
            <tr key={w.id}>
              <td><code>{w.url}</code></td><td>{(w.events || []).length ? w.events.join(", ") : t("all", "tous")}</td>
              <td>{w.active ? <span className="pill pg">{t("active", "actif")}</span> : <span className="pill pgrey">{t("off", "inactif")}</span>}</td>
              {canManage && <td><button className="btn ghost" onClick={() => del(w.id)}>{t("Delete", "Supprimer")}</button></td>}
            </tr>
          ))}
          {endpoints.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>{t("No endpoints.", "Aucun point de terminaison.")}</td></tr>}
        </tbody>
      </table>

      <div className="toolbar" style={{ marginTop: 20 }}><h1 style={{ fontSize: 16 }}>{t("Recent deliveries", "Livraisons récentes")}</h1></div>
      <table>
        <thead><tr><th>{t("Event", "Événement")}</th><th>{t("Endpoint", "Point de terminaison")}</th><th>{t("Status", "Statut")}</th><th>{t("Attempts", "Tentatives")}</th><th>{t("Code", "Code")}</th><th>{t("When", "Quand")}</th></tr></thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td>{d.event}</td><td><code>{d.url}</code></td>
              <td><span className={"pill " + pill(d.status)}>{deliveryLabel(d.status)}</span></td>
              <td>{d.attempts}</td><td>{d.response_code ?? "—"}</td><td>{fmt(d.created_at)}</td>
            </tr>
          ))}
          {deliveries.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No deliveries yet.", "Aucune livraison pour l’instant.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
