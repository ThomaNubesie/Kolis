"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const ROLES = ["driver", "dispatcher", "admin", "owner"];

export default function Drivers() {
  const { active } = useOrg();
  const canManage = active.role === "owner" || active.role === "admin";
  const [rows, setRows] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => org.drivers(active.org_id).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr("");
    try { await org.invite(active.org_id, email.trim(), "driver"); setEmail(""); load(); }
    catch (e: any) { setErr(e?.message || "Invite failed."); }
    setBusy(false);
  };

  return (
    <>
      <h1>Drivers</h1>
      <div className="sub">{active.name} · each driver still passes individual identity verification; fee waived under the fleet.</div>
      {canManage && (
        <div className="card" style={{ maxWidth: 520 }}>
          <p className="mono">Add driver (invite by email)</p>
          <div className="row">
            <input className="input" placeholder="driver@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" disabled={busy} onClick={invite}>Invite</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}
      <table>
        <thead><tr><th>Driver</th><th>Fleet role</th><th>Identity</th><th>Courier status</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.user_id}>
              <td>{d.full_name || "—"}</td>
              <td><span className="pill pgrey">{d.role}</span></td>
              <td>{d.identity_verified ? <span className="pill pg">Verified</span> : <span className="pill pgold">Pending</span>}</td>
              <td>{d.kolis_role === "courier" || d.kolis_role === "both" ? <span className="pill pg">Can carry</span> : <span className="pill pgrey">{d.kolis_role || "—"}</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>No drivers yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
