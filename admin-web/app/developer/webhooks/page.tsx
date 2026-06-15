"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const EVENTS = ["shipment.created", "shipment.matched", "shipment.picked_up", "shipment.in_transit", "shipment.delivered", "shipment.cancelled"];
const fmt = (d: string) => (d ? new Date(d).toLocaleString() : "—");

export default function Webhooks() {
  const { active } = useOrg();
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
    catch (e: any) { setErr(e?.message || "Failed."); }
    setBusy(false);
  };
  const del = async (id: string) => { if (!confirm("Delete this endpoint?")) return; try { await org.deleteWebhook(active.org_id, id); load(); } catch (e: any) { setErr(e?.message || "Failed."); } };

  const pill = (s: string) => (s === "delivered" ? "pg" : s === "failed" ? "pred" : s === "sending" ? "pblue" : "pgold");

  return (
    <>
      <h1>Webhooks</h1>
      <div className="sub">{active.name} · we POST signed events (header <code>x-kolis-signature</code>, HMAC-SHA256) on every status change.</div>

      {canManage && (
        <div className="card" style={{ maxWidth: 620 }}>
          <p className="mono">Add endpoint (receives all events)</p>
          <div className="row">
            <input className="input" placeholder="https://yourapp.com/hooks/kolis" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={busy} onClick={add}>Add</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}

      <table>
        <thead><tr><th>Endpoint</th><th>Events</th><th>Status</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {endpoints.map((w) => (
            <tr key={w.id}>
              <td><code>{w.url}</code></td><td>{(w.events || []).length ? w.events.join(", ") : "all"}</td>
              <td>{w.active ? <span className="pill pg">active</span> : <span className="pill pgrey">off</span>}</td>
              {canManage && <td><button className="btn ghost" onClick={() => del(w.id)}>Delete</button></td>}
            </tr>
          ))}
          {endpoints.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>No endpoints.</td></tr>}
        </tbody>
      </table>

      <div className="toolbar" style={{ marginTop: 20 }}><h1 style={{ fontSize: 16 }}>Recent deliveries</h1></div>
      <table>
        <thead><tr><th>Event</th><th>Endpoint</th><th>Status</th><th>Attempts</th><th>Code</th><th>When</th></tr></thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td>{d.event}</td><td><code>{d.url}</code></td>
              <td><span className={"pill " + pill(d.status)}>{d.status}</span></td>
              <td>{d.attempts}</td><td>{d.response_code ?? "—"}</td><td>{fmt(d.created_at)}</td>
            </tr>
          ))}
          {deliveries.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No deliveries yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
