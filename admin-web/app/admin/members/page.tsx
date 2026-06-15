"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";

const FILTERS = [["all", "All"], ["couriers", "Couriers"], ["senders", "Senders"], ["unverified", "Unverified"], ["founding", "Founding"], ["pending", "Pending"]];
const day = (s?: string) => (s ? s.slice(0, 10) : "—");

export default function Members() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  const load = useCallback((f = filter, s = search) => {
    if (f === "pending") { api.pendingMembers().then(setPending).catch(() => setPending([])); return; }
    api.members(f, s.trim() || null).then(setList).catch(() => {});
  }, [filter, search]);
  useEffect(() => { load("all", ""); }, []); // eslint-disable-line

  const toggle = async (m: any) => { if (!confirm(`${m.suspended ? "Reinstate" : "Suspend"} ${m.full_name || m.email}?`)) return; try { await api.suspend(m.id, !m.suspended); load(); } catch (e: any) { alert(e?.message); } };
  const nudgeAll = async () => { if (!confirm("Send a verification reminder to all unverified members with the app installed?")) return; try { const r = await api.nudgeUnverified(); alert(r.nudged ? `Reminder sent to ${r.nudged} member(s).` : "No unverified members have notifications enabled."); } catch (e: any) { alert(e?.message); } };
  const nudgeOne = async (m: any) => { try { const r = await api.nudgeUnverified(m.id); alert(r.nudged ? "Reminder sent." : "This member doesn't have notifications enabled."); } catch (e: any) { alert(e?.message); } };

  return (
    <>
      <h1>Members</h1>
      <div className="toolbar">
        {filter !== "pending" && <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="🔍 name, email…" />}
        {FILTERS.map(([f, l]) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); load(f, search); }}>{l}</button>)}
        {filter !== "pending" && <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={nudgeAll}>🔔 Nudge unverified</button>}
      </div>

      {filter === "pending" ? (
        <>
          <div className="sub" style={{ marginBottom: 8 }}>Accounts that started a signup but haven&apos;t finished onboarding — no member profile yet. (LoadQ drivers excluded.)</div>
          <table>
            <thead><tr><th>Email</th><th>Phone</th><th>Signed up</th><th>Last seen</th><th>Confirmed</th></tr></thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.id}>
                  <td>{m.email || "—"}</td>
                  <td>{m.phone ? "+" + m.phone : "—"}</td>
                  <td>{day(m.created_at)}</td>
                  <td>{day(m.last_sign_in_at)}</td>
                  <td>{m.confirmed ? <span className="pill pg">yes</span> : <span className="pill pgrey">no</span>}</td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={5} style={{ color: "var(--t3)" }}>No incomplete signups 🎉</td></tr>}
            </tbody>
          </table>
        </>
      ) : (
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Founding</th><th></th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} style={{ opacity: m.suspended ? 0.55 : 1 }}>
                <td><b>{m.full_name || "—"}</b></td>
                <td>{m.email || "—"}</td>
                <td style={{ textTransform: "capitalize" }}>{m.role || "—"}</td>
                <td>{m.identity_verified ? <span className="pill pg">verified</span> : <span className="pill pgrey">unverified</span>}{m.suspended ? <span className="pill pred" style={{ marginLeft: 5 }}>suspended</span> : null}</td>
                <td>{m.is_founding && m.founding_number ? `#${m.founding_number}` : "—"}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    {!m.identity_verified && <button className="btn ghost" onClick={() => nudgeOne(m)}>Remind</button>}
                    <button className="btn ghost" onClick={() => toggle(m)}>{m.suspended ? "Reinstate" : "Suspend"}</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No members.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
