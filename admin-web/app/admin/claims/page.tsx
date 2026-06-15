"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";

export default function Claims() {
  const [status, setStatus] = useState("open");
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"card" | "interac">("card");
  const [busy, setBusy] = useState(false);

  const load = useCallback((s = status) => { api.claims(s).then(setList).catch(() => {}); }, [status]);
  useEffect(() => { load("open"); }, []); // eslint-disable-line

  const cap = (c: any) => c.insured ? (c.declared_value_cents ?? 0) : c.price_cents;
  const open = (c: any) => { setActive(c); setAmount((cap(c) / 100).toFixed(2)); setMethod("card"); };

  const approve = async () => {
    const cents = Math.min(Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100), cap(active));
    setBusy(true);
    try { await api.refund({ parcel_id: active.parcel_id, claim_id: active.id, action: "claim", amount_cents: cents, method }); setActive(null); load(); }
    catch (e: any) { alert(e?.message || "Error"); }
    setBusy(false);
  };
  const deny = async () => { setBusy(true); try { await api.denyClaim(active.id); setActive(null); load(); } catch (e: any) { alert(e?.message); } setBusy(false); };

  return (
    <>
      <h1>Insurance claims</h1>
      <div className="toolbar">{[["open", "Open"], ["approved", "Approved"], ["denied", "Denied"]].map(([s, l]) => <button key={s} className={"chip" + (status === s ? " on" : "")} onClick={() => { setStatus(s); load(s); }}>{l}</button>)}</div>
      <table>
        <thead><tr><th>Parcel</th><th>Type</th><th>Route</th><th>Policy</th><th>Refund</th><th></th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="clk" onClick={() => status === "open" ? open(c) : null}>
              <td>#{c.code}</td><td style={{ textTransform: "capitalize" }}>{c.type}</td>
              <td>{c.from_city} → {c.to_city}</td>
              <td>{c.insured ? `🛡️ C$${Math.round((c.declared_value_cents ?? 0) / 100)}` : `⚠️ fee C$${Math.round(c.price_cents / 100)}`}</td>
              <td>{c.refund_cents != null ? `C$${(c.refund_cents / 100).toFixed(2)}` : "—"}</td>
              <td><span className={"pill " + (c.status === "approved" ? "pg" : c.status === "denied" ? "pred" : "pmag")}>{c.status}</span></td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>No {status} claims.</td></tr>}
        </tbody>
      </table>

      {active && (
        <div className="modalbg" onClick={() => setActive(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Claim #{active.code} · {active.type}</h3>
            <div className="warn">{active.insured ? `Insured → refund up to the declared value (max C$${Math.round((active.declared_value_cents ?? 0) / 100)}).` : `Declined → cap is the shipping fee (C$${Math.round(active.price_cents / 100)}).`}</div>
            <div className="mono">Refund amount</div>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="row" style={{ marginTop: 10 }}>
              {(["card", "interac"] as const).map((m) => <button key={m} className={"chip" + (method === m ? " on" : "")} onClick={() => setMethod(m)}>{m === "card" ? "Original card" : "Interac"}</button>)}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn green" style={{ width: "100%", marginBottom: 8 }} disabled={busy} onClick={approve}>Approve & refund</button>
              <div className="row"><button className="btn ghost" style={{ flex: 1 }} onClick={() => setActive(null)}>Close</button><button className="btn red" style={{ flex: 1 }} disabled={busy} onClick={deny}>Deny</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
