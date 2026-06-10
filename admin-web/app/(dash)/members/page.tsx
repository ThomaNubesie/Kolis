"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";

const FILTERS = [["all", "All"], ["couriers", "Couriers"], ["senders", "Senders"], ["unverified", "Unverified"], ["founding", "Founding"]];

export default function Members() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<any[]>([]);

  const load = useCallback((f = filter, s = search) => { api.members(f, s.trim() || null).then(setList).catch(() => {}); }, [filter, search]);
  useEffect(() => { load("all", ""); }, []); // eslint-disable-line

  const toggle = async (m: any) => { if (!confirm(`${m.suspended ? "Reinstate" : "Suspend"} ${m.full_name || m.email}?`)) return; try { await api.suspend(m.id, !m.suspended); load(); } catch (e: any) { alert(e?.message); } };

  return (
    <>
      <h1>Members</h1>
      <div className="toolbar">
        <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="🔍 name, email…" />
        {FILTERS.map(([f, l]) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); load(f, search); }}>{l}</button>)}
      </div>
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
              <td><button className="btn ghost" onClick={() => toggle(m)}>{m.suspended ? "Reinstate" : "Suspend"}</button></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No members.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
