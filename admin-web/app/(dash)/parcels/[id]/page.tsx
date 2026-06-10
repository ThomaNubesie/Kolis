"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { cityList, regionFor } from "@/lib/cities";

const c$ = (c?: number | null) => `C$${((c ?? 0) / 100).toFixed(2)}`;

export default function ParcelDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [cands, setCands] = useState<any[] | null>(null);
  const [reroute, setReroute] = useState(false);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.parcel(id).then((d) => { setP(d); setCity(d?.to_city ?? ""); }).catch(() => {});
    api.role().then(setRole).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const canOps = role === "owner" || role === "admin" || role === "dispatcher";
  const canMoney = role === "owner" || role === "admin" || role === "finance";
  const run = async (fn: () => Promise<any>, msg = "Done") => { setBusy(true); try { await fn(); alert(msg); load(); } catch (e: any) { alert(e?.message || "Error"); } setBusy(false); };

  if (!p) return <div>Loading…</div>;

  const KV = ({ k, v }: { k: string; v: string }) => <div className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>;

  const pickDriver = (d: any) => { setCands(null); run(() => p.driver_id ? api.changeDriver(id, d.driver_id) : api.assign(id, d.driver_id), p.driver_id ? "Driver changed" : "Assigned"); };
  const doReroute = () => { setReroute(false); run(() => api.reroute(id, city, regionFor(city)), "Rerouted"); };
  const doCancel = () => { if (confirm("Refund the sender and cancel this parcel?")) run(async () => { await api.refund({ parcel_id: id, action: "cancel", method: "card" }); }, "Cancelled & refunded"); };

  return (
    <>
      <button className="btn ghost" onClick={() => router.back()}>← Back</button>
      <h1 style={{ marginTop: 12 }}>#{p.code} <span className="pill pblue" style={{ fontSize: 12 }}>{String(p.status).replace(/_/g, " ")}</span></h1>
      <div className="sub">{p.from_city} → {p.to_city} · {p.dropoff_type === "hub" ? "Hub" : "Door-to-door"} · {p.size}</div>

      <div className="cols">
        <div style={{ flex: "1 1 320px" }}>
          <div className="card"><div className="mono">Sender → Recipient</div>
            <KV k="Sender" v={p.sender_name || "—"} /><KV k="Sender email" v={p.sender_email || "—"} />
            <KV k="Recipient" v={p.recipient_name || "—"} /><KV k="Phone" v={p.recipient_phone || "—"} />
            <KV k="Destination" v={p.dropoff_addr || p.pickup_hub_name || "—"} /></div>
          <div className="card"><div className="mono">Contents & insurance</div>
            <KV k="Contents" v={p.contents_description || "—"} />
            <KV k="Declared value" v={c$(p.declared_value_cents)} />
            <KV k="Insured" v={p.insured ? `Yes (+${c$(p.insurance_premium_cents)})` : "Declined"} /></div>
        </div>
        <div style={{ flex: "1 1 280px" }}>
          <div className="card"><div className="mono">Money & driver (admin)</div>
            <KV k="Sender paid" v={c$((p.price_cents ?? 0) + (p.insurance_premium_cents ?? 0))} />
            <KV k="Courier payout" v={c$(p.driver_payout_cents)} />
            <KV k="Driver" v={p.driver_name || "unassigned"} />
            <KV k="Delivery code" v={p.delivery_code || "—"} /></div>

          {canOps && (
            <div className="card"><div className="mono">Dispatch & route</div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn blue" disabled={busy} onClick={async () => setCands(await api.candidates(id))}>{p.driver_id ? "Change driver" : "Assign driver"}</button>
                {p.driver_id && <button className="btn ghost" disabled={busy} onClick={() => run(() => api.unassign(id), "Unassigned")}>Unassign</button>}
                <button className="btn ghost" disabled={busy} onClick={() => setReroute(true)}>Reroute</button>
              </div>
              <div className="warn">Reroute changes the destination; couriers + sender are re-notified, the code stays valid.</div>
            </div>
          )}
          {canMoney && <button className="btn red" disabled={busy} onClick={doCancel}>Cancel & refund</button>}
        </div>
      </div>

      {cands !== null && (
        <div className="modalbg" onClick={() => setCands(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Pick a courier → {p.to_city}</h3>
            {(cands || []).length === 0 && <div style={{ color: "var(--t3)" }}>No candidates heading there.</div>}
            {(cands || []).map((d) => (
              <div key={d.driver_id} className="card" style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => pickDriver(d)}>
                <div style={{ flex: 1 }}><b>{d.name || "Courier"}</b><div style={{ fontSize: 12, color: "var(--t3)" }}>{d.source === "queue" ? `LoadQ #${d.queue_pos ?? "?"}` : "Off-queue member"} · carrying {d.carrying}/3</div></div>
                <span className="pill pmag">Pick</span>
              </div>
            ))}
            <button className="btn ghost" style={{ width: "100%" }} onClick={() => setCands(null)}>Close</button>
          </div>
        </div>
      )}

      {reroute && (
        <div className="modalbg" onClick={() => setReroute(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Reroute destination</h3>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              {!cityList.includes(city) && <option value={city}>{city}</option>}
              {cityList.filter((c) => c !== p.from_city).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setReroute(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1 }} onClick={doReroute}>Reroute</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
