"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString();
const KYB: Record<string, string> = { verified: "pg", pending: "pgold", rejected: "pred" };

export default function Organizations() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", type: "shipper", billing_email: "", net_terms: "30", discount: "0", credit: "0" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const load = () => api.orgs().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr("");
    try {
      const id = await api.createOrg({
        name: f.name.trim(), type: f.type, billing_email: f.billing_email.trim() || undefined,
        net_terms: Number(f.net_terms) || 30, discount: (Number(f.discount) || 0) / 100,
        credit_limit_cents: Math.round((Number(f.credit) || 0) * 100),
      });
      setOpen(false); router.push(`/admin/orgs/${id}`);
    } catch (e: any) { setErr(e?.message || "Failed."); }
    setBusy(false);
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>Organizations</h1><div className="sub">Business accounts — shippers & carrier fleets</div></div>
        <button className="btn" onClick={() => { setOpen(true); setErr(""); }}>+ New organization</button>
      </div>

      <div className="tiles">
        <div className="tile"><div className="l">Total</div><div className="n">{rows.length}</div></div>
        <div className="tile"><div className="l">Active</div><div className="n">{rows.filter((o) => o.status === "active").length}</div></div>
        <div className="tile"><div className="l">Suspended</div><div className="n">{rows.filter((o) => o.status === "suspended").length}</div></div>
        <div className="tile"><div className="l">KYB pending</div><div className="n">{rows.filter((o) => o.kyb_status === "pending").length}</div></div>
      </div>

      <table>
        <thead><tr><th>Name</th><th>Type</th><th>KYB</th><th>Status</th><th>Credit limit</th><th>Net</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="clk" onClick={() => router.push(`/admin/orgs/${o.id}`)}>
              <td><b>{o.name}</b><br /><span style={{ fontSize: 11, color: "var(--t3)" }}>{o.billing_email || "—"}</span></td>
              <td style={{ textTransform: "capitalize" }}>{o.type}</td>
              <td><span className={"pill " + (KYB[o.kyb_status] || "pgrey")}>{o.kyb_status}</span></td>
              <td><span className={"pill " + (o.status === "active" ? "pg" : "pred")}>{o.status}</span></td>
              <td>{money(o.credit_limit_cents)}</td>
              <td>net-{o.net_terms_days}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No organizations yet — create one to onboard a business.</td></tr>}
        </tbody>
      </table>

      {open && (
        <div className="modalbg" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18 }}>New organization</h1>
            <div className="mono" style={{ marginTop: 8 }}>Business name</div>
            <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Northwind Goods Inc." />
            <div className="mono" style={{ marginTop: 10 }}>Type</div>
            <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="shipper">Shipper (sends parcels)</option>
              <option value="carrier">Carrier / fleet (provides drivers)</option>
              <option value="both">Both</option>
            </select>
            <div className="mono" style={{ marginTop: 10 }}>Billing email</div>
            <input className="input" value={f.billing_email} onChange={(e) => set("billing_email", e.target.value)} placeholder="billing@company.com" />
            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1 }}><div className="mono">Net terms (days)</div><input className="input" value={f.net_terms} onChange={(e) => set("net_terms", e.target.value)} inputMode="numeric" /></div>
              <div style={{ flex: 1 }}><div className="mono">Volume discount %</div><input className="input" value={f.discount} onChange={(e) => set("discount", e.target.value)} inputMode="decimal" /></div>
              <div style={{ flex: 1 }}><div className="mono">Credit limit $</div><input className="input" value={f.credit} onChange={(e) => set("credit", e.target.value)} inputMode="numeric" /></div>
            </div>
            {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create"}</button>
              <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
