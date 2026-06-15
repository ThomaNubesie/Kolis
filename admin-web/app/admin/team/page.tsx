"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";

const ROLES = ["admin", "dispatcher", "finance", "support"];
const roleTone = (r: string) => ({ owner: "pmag", admin: "pmag", dispatcher: "pblue", finance: "pgold", support: "pgrey" } as any)[r] || "pgrey";

export default function Team() {
  const [team, setTeam] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [keyModal, setKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(() => { api.team().then(setTeam).catch(() => {}); api.keys().then(setKeys).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const sendInvite = async () => { if (!email.trim()) return; try { const r: any = await api.invite(email.trim(), role); setInvite(false); setEmail(""); alert(r?.emailed ? "Invite emailed." : "Invite created, but email failed: " + (r?.error || "unknown")); load(); } catch (e: any) { alert(e?.message); } };
  const remove = async (m: any) => { if (!m.user_id || !confirm(`Remove ${m.name || m.email}?`)) return; try { await api.removeStaff(m.user_id); load(); } catch (e: any) { alert(e?.message); } };
  const resend = async (m: any) => { try { const r: any = await api.invite(m.email, m.role); alert(r?.emailed ? "Invite re-sent." : "Re-created, but email failed: " + (r?.error || "unknown")); load(); } catch (e: any) { alert(e?.message); } };
  const cancelInvite = async (m: any) => { if (!confirm(`Delete the pending invite for ${m.email}?`)) return; try { await api.cancelInvite(m.email); load(); } catch (e: any) { alert(e?.message); } };
  const createKey = async () => { if (!keyName.trim()) return; try { const r = await api.createKey(keyName.trim(), ["read_parcels"]); setKeyModal(false); setKeyName(""); setNewKey(r.key); load(); } catch (e: any) { alert(e?.message); } };
  const revoke = async (k: any) => { if (!confirm(`Revoke ${k.name}?`)) return; try { await api.revokeKey(k.id); load(); } catch {} };

  return (
    <>
      <h1>Team & access</h1>
      <div className="sub">Owner only · scoped staff roles + API keys</div>

      <div className="mono">Staff</div>
      <table style={{ marginBottom: 12 }}>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {team.map((m, i) => (
            <tr key={(m.user_id ?? m.email) + i}>
              <td><b>{m.name || m.email}</b>{m.pending ? <span className="pill pgrey" style={{ marginLeft: 6 }}>pending</span> : null}</td>
              <td>{m.email}</td>
              <td><span className={"pill " + roleTone(m.role)}>{m.role}</span></td>
              <td>
                {m.pending ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost" onClick={() => resend(m)}>Resend</button>
                    <button className="btn ghost" onClick={() => cancelInvite(m)}>Delete</button>
                  </div>
                ) : m.user_id && m.role !== "owner" ? (
                  <button className="btn ghost" onClick={() => remove(m)}>Remove</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn dark" onClick={() => setInvite(true)}>＋ Invite staff</button>

      <div className="mono" style={{ marginTop: 22 }}>API access keys</div>
      <table style={{ marginBottom: 12 }}>
        <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} style={{ opacity: k.revoked_at ? 0.5 : 1 }}>
              <td><b>{k.name}</b></td>
              <td style={{ fontFamily: "monospace" }}>{k.prefix}••••</td>
              <td>{(k.scopes || []).join(", ")}</td>
              <td><span className={"pill " + (k.revoked_at ? "pred" : "pg")}>{k.revoked_at ? "revoked" : "active"}</span></td>
              <td>{!k.revoked_at && <button className="btn ghost" onClick={() => revoke(k)}>Revoke</button>}</td>
            </tr>
          ))}
          {keys.length === 0 && <tr><td colSpan={5} style={{ color: "var(--t3)" }}>No keys.</td></tr>}
        </tbody>
      </table>
      <button className="btn ghost" onClick={() => setKeyModal(true)}>＋ Create access key</button>

      {invite && (
        <div className="modalbg" onClick={() => setInvite(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>Invite staff</h3>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@kolis.ca" />
          <div style={{ marginTop: 10 }}>{ROLES.map((r) => <button key={r} className={"chip" + (role === r ? " on" : "")} style={{ marginRight: 6, marginBottom: 6, textTransform: "capitalize" }} onClick={() => setRole(r)}>{r}</button>)}</div>
          <div className="row" style={{ marginTop: 14 }}><button className="btn ghost" style={{ flex: 1 }} onClick={() => setInvite(false)}>Cancel</button><button className="btn" style={{ flex: 1 }} onClick={sendInvite}>Send invite</button></div>
        </div></div>
      )}
      {keyModal && (
        <div className="modalbg" onClick={() => setKeyModal(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>New access key</h3>
          <input className="input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="ops-integration" />
          <div className="sub" style={{ marginTop: 8 }}>Scope: read parcels. Shown once on creation.</div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn ghost" style={{ flex: 1 }} onClick={() => setKeyModal(false)}>Cancel</button><button className="btn" style={{ flex: 1 }} onClick={createKey}>Create</button></div>
        </div></div>
      )}
      {newKey && (
        <div className="modalbg"><div className="modal">
          <h3 style={{ marginTop: 0 }}>🔑 Copy your key now</h3>
          <div className="sub">It won't be shown again.</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "var(--bg)", padding: 12, borderRadius: 9, wordBreak: "break-all", margin: "10px 0" }}>{newKey}</div>
          <button className="btn dark" style={{ width: "100%" }} onClick={() => setNewKey(null)}>Done</button>
        </div></div>
      )}
    </>
  );
}
