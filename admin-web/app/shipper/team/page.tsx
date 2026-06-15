"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const ROLES = ["owner", "admin", "finance", "shipper"];

export default function Team() {
  const { active } = useOrg();
  const canManage = active.role === "owner" || active.role === "admin"; // invite + change roles
  const isOwner = active.role === "owner"; // remove member is owner-only
  const [data, setData] = useState<{ members: any[]; invites: any[] }>({ members: [], invites: [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("shipper");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => org.team(active.org_id).then(setData).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr("");
    try { await org.invite(active.org_id, email.trim(), role); setEmail(""); load(); }
    catch (e: any) { setErr(e?.message || "Invite failed."); }
    setBusy(false);
  };
  const changeRole = async (user: string, r: string) => { try { await org.setRole(active.org_id, user, r); load(); } catch (e: any) { setErr(e?.message || "Failed."); } };
  const remove = async (user: string) => { if (!confirm("Remove this member?")) return; try { await org.removeMember(active.org_id, user); load(); } catch (e: any) { setErr(e?.message || "Failed."); } };

  return (
    <>
      <h1>Team & seats</h1>
      <div className="sub">{active.name} · company KYB means no per-person verification fee.</div>
      {canManage && (
        <div className="card" style={{ maxWidth: 560 }}>
          <p className="mono">Invite member</p>
          <div className="row">
            <input className="input" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="input" style={{ width: 130 }} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="btn" disabled={busy} onClick={invite}>Invite</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th>{isOwner && <th></th>}</tr></thead>
        <tbody>
          {data.members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.full_name || "—"}</td><td>{m.email || "—"}</td>
              <td>{canManage ? (
                <select className="input" style={{ width: 120, padding: 6 }} value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : <span className="pill pmag">{m.role}</span>}</td>
              {isOwner && <td><button className="btn ghost" onClick={() => remove(m.user_id)}>Remove</button></td>}
            </tr>
          ))}
          {data.invites.map((i) => (
            <tr key={i.email}><td style={{ color: "var(--t3)" }}>—</td><td>{i.email}</td><td><span className="pill pgold">invited · {i.role}</span></td>{isOwner && <td></td>}</tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
