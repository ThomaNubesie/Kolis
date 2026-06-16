"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const SCOPES = ["shipments:write", "shipments:read"];
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

export default function ApiKeys() {
  const { active } = useOrg();
  const { t } = useLang();
  const canManage = active.role === "owner" || active.role === "admin";
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("shipments:write");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => org.keys(active.org_id).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try { const plain = await org.createKey(active.org_id, name.trim(), [scope]); setCreated(plain); setName(""); load(); }
    catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };
  const revoke = async (id: string) => { if (!confirm(t("Revoke this key?", "Révoquer cette clé?"))) return; try { await org.revokeKey(active.org_id, id); load(); } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); } };

  return (
    <>
      <h1>{t("API keys", "Clés API")}</h1>
      <div className="sub">{active.name} · {t("authorize", "autorisez")} <code>POST /v1/shipments</code> {t("from your store or WMS.", "depuis votre boutique ou votre SGE.")}</div>

      {created && (
        <div className="card" style={{ maxWidth: 620, borderColor: "var(--accent)" }}>
          <div className="mono">{t("New key — copy it now, it won’t be shown again", "Nouvelle clé — copiez-la maintenant, elle ne sera plus affichée")}</div>
          <code style={{ display: "block", background: "#15110f", color: "#ff9ec4", padding: 12, borderRadius: 8, wordBreak: "break-all" }}>{created}</code>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setCreated(null)}>{t("Done", "Terminé")}</button>
        </div>
      )}

      {canManage && (
        <div className="card" style={{ maxWidth: 620 }}>
          <p className="mono">{t("Create key", "Créer une clé")}</p>
          <div className="row">
            <input className="input" placeholder={t("Label (e.g. Shopify prod)", "Libellé (ex. Shopify prod)")} value={name} onChange={(e) => setName(e.target.value)} />
            <select className="input" style={{ width: 180 }} value={scope} onChange={(e) => setScope(e.target.value)}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" disabled={busy} onClick={create}>{t("Create", "Créer")}</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}

      <table>
        <thead><tr><th>{t("Label", "Libellé")}</th><th>{t("Key", "Clé")}</th><th>{t("Scopes", "Portées")}</th><th>{t("Last used", "Dernière utilisation")}</th><th>{t("Status", "Statut")}</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{(k.scopes || []).join(", ")}</td>
              <td>{k.last_used_at ? fmt(k.last_used_at) : "—"}</td>
              <td>{k.revoked_at ? <span className="pill pred">{t("revoked", "révoquée")}</span> : <span className="pill pg">{t("active", "active")}</span>}</td>
              {canManage && <td>{!k.revoked_at && <button className="btn ghost" onClick={() => revoke(k.id)}>{t("Revoke", "Révoquer")}</button>}</td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No keys yet.", "Aucune clé pour l’instant.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
