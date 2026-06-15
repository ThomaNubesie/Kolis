"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Billing() {
  const { active } = useOrg();
  const [ov, setOv] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { org.overview(active.org_id).then(setOv).catch(() => {}); }, [active.org_id]);

  const addCard = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await org.setupCard(active.org_id);
      if (res.skipped) setMsg("Card-on-file is enabled at go-live (Stripe test key not yet configured).");
      else if (res.clientSecret) setMsg("Setup ready — secure card entry (Stripe Elements) opens here at go-live.");
      else setMsg("Unexpected response.");
    } catch (e: any) { setMsg(e?.message || "Failed."); }
    setBusy(false);
  };

  const usedPct = ov && ov.credit_limit_cents > 0 ? Math.min(100, Math.round((ov.outstanding_cents / ov.credit_limit_cents) * 100)) : 0;

  return (
    <>
      <h1>Billing</h1>
      <div className="sub">{active.name} · net terms — shipments bill on a monthly invoice. A card on file is a backstop for overdue invoices.</div>

      <div className="tiles">
        <div className="tile"><div className="l">Credit limit</div><div className="n">{ov ? money(ov.credit_limit_cents) : "—"}</div></div>
        <div className="tile"><div className="l">Outstanding</div><div className="n">{ov ? money(ov.outstanding_cents) : "—"}</div></div>
        <div className="tile"><div className="l">Available</div><div className="n" style={{ color: "var(--green)" }}>{ov ? money(ov.available_cents) : "—"}</div></div>
      </div>

      {ov && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="mono">Credit used · {usedPct}%</div>
          <div style={{ height: 10, background: "var(--cardAlt)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${usedPct}%`, height: "100%", background: usedPct > 90 ? "var(--red)" : "var(--accent)" }} />
          </div>
          {ov.org_status === "suspended" && <div className="warn" style={{ marginTop: 10 }}>⚠️ This account is suspended (over limit or overdue). New shipments are blocked until the balance is paid down.</div>}
        </div>
      )}

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="mono">Card on file (backstop)</div>
        <div className="sub" style={{ margin: "0 0 10px" }}>Charged only if an invoice goes overdue. Primary billing is the monthly invoice.</div>
        {active.role === "owner"
          ? <button className="btn" disabled={busy} onClick={addCard}>{busy ? "…" : "Add card on file"}</button>
          : <div className="sub">Only the account owner can manage billing.</div>}
        {msg ? <div className="sub" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>
    </>
  );
}
