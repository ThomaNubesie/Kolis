"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase";

const money = (c?: number) => "C$" + Math.round((c ?? 0) / 100).toLocaleString();

export default function Revenue() {
  const [data, setData] = useState<any>(null);
  const [range, setRange] = useState<"month" | "all">("month");
  const [err, setErr] = useState("");

  const load = (r: "month" | "all") => {
    setErr(""); setData(null);
    const args: [string?, string?] = r === "all" ? ["2020-01-01", "2999-01-01"] : [undefined, undefined];
    api.revenue(args[0], args[1]).then((d) => { if (d == null) setErr("You don't have access to revenue."); else setData(d); }).catch((e) => setErr(e?.message || "Failed to load."));
  };
  useEffect(() => { load(range); }, [range]);

  const Tile = ({ l, n, tone, sub }: { l: string; n: string; tone?: string; sub?: string }) => (
    <div className="tile"><div className="l">{l}</div><div className="n" style={{ color: tone }}>{n}</div>{sub ? <div className="sub" style={{ marginTop: 2 }}>{sub}</div> : null}</div>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>Revenue</h1><div className="sub">{range === "all" ? "All time" : "This month"} · Stripe TEST mode until launch</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className={"chip" + (range === "month" ? " on" : "")} onClick={() => setRange("month")}>This month</button>
          <button className={"chip" + (range === "all" ? " on" : "")} onClick={() => setRange("all")}>All time</button>
        </div>
      </div>

      {err ? <div className="warn">{err}</div> : !data ? <div className="sub">Loading…</div> : (
        <>
          <div className="tiles">
            <Tile l="Platform fees earned" n={money(data.platform_fees_cents)} tone="#178a5e" sub="15% on fleet payouts" />
            <Tile l="Invoiced to shippers" n={money(data.invoiced_cents)} />
            <Tile l="Collected" n={money(data.collected_cents)} tone="#178a5e" />
            <Tile l="Outstanding (unpaid)" n={money(data.outstanding_cents)} tone={data.outstanding_cents ? "var(--accent)" : undefined} />
            <Tile l="Payouts owed to fleets" n={money(data.payouts_owed_cents)} tone={data.payouts_owed_cents ? "var(--red)" : undefined} />
          </div>

          <div className="mono">By organization</div>
          <table>
            <thead><tr><th>Organization</th><th>Invoiced</th><th>Outstanding</th><th>Platform fees</th></tr></thead>
            <tbody>
              {(data.by_org || []).map((o: any) => (
                <tr key={o.org_id}>
                  <td><b>{o.name}</b></td>
                  <td>{money(o.invoiced_cents)}</td>
                  <td style={{ color: o.outstanding_cents ? "var(--accent)" : "var(--t3)" }}>{money(o.outstanding_cents)}</td>
                  <td>{money(o.fees_cents)}</td>
                </tr>
              ))}
              {(data.by_org || []).length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>No organizations yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
