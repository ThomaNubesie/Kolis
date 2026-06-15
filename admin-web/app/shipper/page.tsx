"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  requested: "pgrey", received_at_hub: "pgold", matched: "pmag", dispatched: "pblue",
  picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred",
};

export default function ShipperOverview() {
  const { active } = useOrg();
  const [ov, setOv] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    org.overview(active.org_id).then(setOv).catch(() => {});
    org.shipments(active.org_id, "all", null).then((r) => setRows(r.slice(0, 8))).catch(() => {});
  }, [active.org_id]);

  return (
    <>
      <h1>Overview</h1>
      <div className="sub">{active.name} · {active.kyb_status === "verified" ? "KYB verified" : "KYB " + active.kyb_status}{active.status === "suspended" ? " · ⚠️ suspended" : ""}</div>
      <div className="tiles">
        <div className="tile"><div className="l">In transit</div><div className="n">{ov?.in_transit ?? "—"}</div></div>
        <div className="tile"><div className="l">Awaiting pickup</div><div className="n">{ov?.awaiting ?? "—"}</div></div>
        <div className="tile"><div className="l">Delivered (30d)</div><div className="n">{ov?.delivered_30d ?? "—"}</div></div>
        <div className="tile"><div className="l">Accrued this cycle</div><div className="n">{ov ? money(ov.accrued_cents) : "—"}</div></div>
      </div>
      <div className="toolbar"><h1 style={{ fontSize: 16 }}>Recent shipments</h1><Link className="btn" style={{ marginLeft: "auto" }} href="/shipper/create">+ New shipment</Link></div>
      <table>
        <thead><tr><th>Code</th><th>Route</th><th>Recipient</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}><td>{p.code}</td><td>{p.from_city} → {p.to_city}</td><td>{p.recipient_name || "—"}</td>
              <td><span className={"pill " + (STATUS[p.status] || "pgrey")}>{p.status.replace(/_/g, " ")}</span></td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>No shipments yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
