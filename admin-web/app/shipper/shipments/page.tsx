"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  requested: "pgrey", received_at_hub: "pgold", matched: "pmag", dispatched: "pblue",
  picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred",
};

export default function Shipments() {
  const { active } = useOrg();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = () => org.shipments(active.org_id, filter, search || null).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id, filter]);

  return (
    <>
      <h1>Shipments</h1>
      <div className="sub">{active.name} · org-wide</div>
      <div className="toolbar">
        {["all", "active", "delivered"].map((f) => (
          <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <input className="search" placeholder="Search code, city, recipient…" value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn ghost" onClick={load}>Search</button>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Route</th><th>Recipient</th><th>Size</th><th>Status</th><th>Cost</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td><td>{p.from_city} → {p.to_city}</td><td>{p.recipient_name || "—"}</td><td>{p.size}</td>
              <td><span className={"pill " + (STATUS[p.status] || "pgrey")}>{p.status.replace(/_/g, " ")}</span></td>
              <td>{money(p.price_cents)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No shipments.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
