"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = { draft: "pgrey", open: "pgold", paid: "pg", void: "pgrey", uncollectible: "pred" };
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

export default function Invoices() {
  const { active } = useOrg();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { org.invoices(active.org_id).then(setRows).catch(() => {}); }, [active.org_id]);

  const open = rows.filter((i) => i.status === "open");
  const outstanding = open.reduce((s, i) => s + (i.total_cents || 0), 0);
  const draft = rows.find((i) => i.status === "draft");

  return (
    <>
      <h1>Invoices</h1>
      <div className="sub">{active.name} · net-{active && (rows[0]?.net_terms_days ?? "")} terms — shipments accrue all cycle and bill once.</div>
      <div className="tiles">
        <div className="tile"><div className="l">Current cycle (open draft)</div><div className="n">{draft ? money(draft.total_cents) : "—"}</div></div>
        <div className="tile"><div className="l">Outstanding</div><div className="n">{money(outstanding)}</div></div>
        <div className="tile"><div className="l">Invoices</div><div className="n">{rows.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Period</th><th>Status</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Due</th><th></th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>{fmt(i.period_start)} – {fmt(i.period_end)}</td>
              <td><span className={"pill " + (STATUS[i.status] || "pgrey")}>{i.status}</span></td>
              <td>{money(i.subtotal_cents)}</td><td>{money(i.tax_cents)}</td><td><b>{money(i.total_cents)}</b></td>
              <td>{i.status === "draft" ? "—" : fmt(i.due_at)}</td>
              <td><Link href={`/shipper/invoices/${i.id}`} style={{ color: "var(--accent)", fontWeight: 800 }}>View</Link></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>No invoices yet — they’re generated when each billing cycle closes.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
