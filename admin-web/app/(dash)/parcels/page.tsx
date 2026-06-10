"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";

const FILTERS = [["all", "All"], ["awaiting", "Awaiting"], ["hub", "At hub"], ["transit", "In transit"], ["delivered", "Delivered"], ["issues", "Issues"]];
const tone = (s: string) => ({ requested: "pmag", received_at_hub: "pgrey", matched: "pblue", dispatched: "pblue", picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred" } as any)[s] || "pgrey";

export default function Parcels() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<any[]>([]);

  const load = useCallback((f = filter, s = search) => { api.parcels(f, s.trim() || null).then(setList).catch(() => {}); }, [filter, search]);
  useEffect(() => { load("all", ""); }, []); // eslint-disable-line

  return (
    <>
      <h1>Parcels</h1>
      <div className="toolbar">
        <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="🔍 code, city, recipient, sender…" />
        {FILTERS.map(([f, l]) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); load(f, search); }}>{l}</button>)}
      </div>
      <table>
        <thead><tr><th>Code</th><th>Route</th><th>Size</th><th>Value / ins.</th><th>Paid</th><th>Driver</th><th>Status</th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} className="clk" onClick={() => router.push(`/parcels/${p.id}`)}>
              <td>#{p.code}</td>
              <td>{p.from_city} → {p.to_city}</td>
              <td style={{ textTransform: "capitalize" }}>{p.size}</td>
              <td>{p.insured ? `C$${Math.round((p.declared_value_cents ?? 0) / 100)} 🛡️` : "— ⚠️"}</td>
              <td>C${(p.price_cents / 100).toFixed(0)}</td>
              <td>{p.driver_name || "—"}</td>
              <td><span className={"pill " + (p.has_open_claim ? "pred" : tone(p.status))}>{p.has_open_claim ? "Claim" : p.status.replace(/_/g, " ")}</span></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>No parcels.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
