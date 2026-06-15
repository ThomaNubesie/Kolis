"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";

const c$ = (c?: number) => `C$${Math.round((c ?? 0) / 100)}`;

export default function Overview() {
  const router = useRouter();
  const [ov, setOv] = useState<any>(null);
  const [attention, setAttention] = useState<any[]>([]);

  useEffect(() => {
    api.overview().then(setOv).catch(() => {});
    Promise.all([api.parcels("awaiting"), api.parcels("issues")])
      .then(([a, b]) => setAttention([...(a || []), ...(b || [])].slice(0, 8))).catch(() => {});
  }, []);

  const Tile = ({ l, n, tone }: { l: string; n: string; tone?: string }) => (
    <div className="tile"><div className="l">{l}</div><div className="n" style={{ color: tone }}>{n}</div></div>
  );

  return (
    <>
      <h1>Overview</h1>
      <div className="sub">Today · all cities</div>
      <div className="tiles">
        <Tile l="In transit" n={String(ov?.in_transit ?? 0)} />
        <Tile l="Awaiting driver" n={String(ov?.awaiting ?? 0)} tone="var(--accent)" />
        <Tile l="Delivered today" n={String(ov?.delivered_today ?? 0)} tone="#178a5e" />
        <Tile l="Revenue today" n={c$(ov?.revenue_today_cents)} />
        <Tile l="Pending payouts" n={c$(ov?.pending_payout_cents)} />
        <Tile l="Open claims" n={String(ov?.open_claims ?? 0)} tone={ov?.open_claims ? "var(--red)" : undefined} />
      </div>

      <div className="mono">Needs attention</div>
      <table>
        <thead><tr><th>Parcel</th><th>Route</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {attention.map((p) => (
            <tr key={p.id} className="clk" onClick={() => router.push(`/admin/parcels/${p.id}`)}>
              <td>#{p.code}</td>
              <td>{p.from_city} → {p.to_city}</td>
              <td><span className={"pill " + (p.has_open_claim ? "pred" : "pmag")}>{p.has_open_claim ? "Claim" : "Awaiting"}</span></td>
              <td>›</td>
            </tr>
          ))}
          {attention.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>Nothing needs attention 🎉</td></tr>}
        </tbody>
      </table>
    </>
  );
}
