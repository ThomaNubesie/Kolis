"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const SCOPES = ["shipments:write", "shipments:read"];
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

export default function ApiKeys() {
  const { active } = useOrg();
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
    catch (e: any) { setErr(e?.message || "Failed."); }
    setBusy(false);
  };
  const revoke = async (id: string) => { if (!confirm("Revoke this key?")) return; try { await org.revokeKey(active.org_id, id); load(); } catch (e: any) { setErr(e?.message || "Failed."); } };

  return (
    <>
      <h1>API keys</h1>
      <div className="sub">{active.name} · authorize <code>POST /v1/shipments</code> from your store or WMS.</div>

      {created && (
        <div className="card" style={{ maxWidth: 620, borderColor: "var(--accent)" }}>
          <div className="mono">New key — copy it now, it won’t be shown again</div>
          <code style={{ display: "block", background: "#15110f", color: "#ff9ec4", padding: 12, borderRadius: 8, wordBreak: "break-all" }}>{created}</code>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setCreated(null)}>Done</button>
        </div>
      )}

      {canManage && (
        <div className="card" style={{ maxWidth: 620 }}>
          <p className="mono">Create key</p>
          <div className="row">
            <input className="input" placeholder="Label (e.g. Shopify prod)" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="input" style={{ width: 180 }} value={scope} onChange={(e) => setScope(e.target.value)}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" disabled={busy} onClick={create}>Create</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}

      <table>
        <thead><tr><th>Label</th><th>Key</th><th>Scopes</th><th>Last used</th><th>Status</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{(k.scopes || []).join(", ")}</td>
              <td>{k.last_used_at ? fmt(k.last_used_at) : "—"}</td>
              <td>{k.revoked_at ? <span className="pill pred">revoked</span> : <span className="pill pg">active</span>}</td>
              {canManage && <td>{!k.revoked_at && <button className="btn ghost" onClick={() => revoke(k.id)}>Revoke</button>}</td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No keys yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
