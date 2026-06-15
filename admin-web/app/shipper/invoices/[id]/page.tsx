"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");
const STATUS: Record<string, string> = { draft: "pgrey", open: "pgold", paid: "pg", void: "pgrey", uncollectible: "pred" };

export default function InvoiceDetail() {
  const { active } = useOrg();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<any>(null);
  useEffect(() => { org.invoice(active.org_id, id).then(setD).catch(() => {}); }, [active.org_id, id]);

  if (!d) return <div className="sub">Loading…</div>;
  const inv = d.invoice;
  return (
    <>
      <div className="sub" style={{ cursor: "pointer" }} onClick={() => router.push("/shipper/invoices")}>← Invoices</div>
      <h1>Invoice — {fmt(inv.period_start)} to {fmt(inv.period_end)}</h1>
      <div className="sub"><span className={"pill " + (STATUS[inv.status] || "pgrey")}>{inv.status}</span>{inv.status !== "draft" ? ` · due ${fmt(inv.due_at)}` : ""}</div>
      <div className="card" style={{ maxWidth: 640 }}>
        <table style={{ border: 0 }}>
          <thead><tr><th>Description</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {(d.lines || []).map((l: any) => (
              <tr key={l.id}><td>{l.description}</td><td style={{ textAlign: "right" }}>{money(l.amount_cents)}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginLeft: "auto", width: 280, marginTop: 14 }}>
          <div className="kv"><span className="k">Subtotal</span><span className="v">{money(inv.subtotal_cents)}</span></div>
          {inv.discount_cents > 0 && <div className="kv"><span className="k">Volume discount</span><span className="v">−{money(inv.discount_cents)}</span></div>}
          <div className="kv"><span className="k">Tax ({d.org?.province})</span><span className="v">{money(inv.tax_cents)}</span></div>
          <div className="kv" style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 8, fontSize: 15 }}>
            <span className="k" style={{ fontWeight: 800, color: "var(--ink)" }}>Total due</span><span className="v" style={{ color: "var(--accent)" }}>{money(inv.total_cents)}</span>
          </div>
        </div>
        {inv.status === "open" && inv.hosted_url && (
          <button className="btn" style={{ marginTop: 14 }} onClick={() => window.open(inv.hosted_url, "_blank")}>Pay now</button>
        )}
        {inv.status === "draft" && <div className="warn" style={{ marginTop: 14 }}>This cycle is still open — the invoice is issued when the period closes.</div>}
        {inv.status === "paid" && <div className="sub" style={{ marginTop: 14, color: "var(--green)", fontWeight: 700 }}>✓ Paid {fmt(inv.paid_at)}</div>}
      </div>
    </>
  );
}
