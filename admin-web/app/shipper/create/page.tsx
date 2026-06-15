"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";

export default function CreateShipment() {
  const { active } = useOrg();
  const router = useRouter();
  const [f, setF] = useState({
    p_dropoff_type: "door", p_size: "small", p_from_city: "Ottawa", p_to_city: "",
    p_recipient_name: "", p_recipient_phone: "", p_dropoff_addr: "", p_contents: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.p_to_city.trim()) { setErr("Destination city is required."); return; }
    setBusy(true); setErr("");
    try {
      const res = await org.createShipment(active.org_id, f);
      setDone({ code: res.code });
    } catch (e: any) { setErr(e?.message || "Failed to create shipment."); }
    setBusy(false);
  };

  if (done) return (
    <>
      <h1>Shipment created</h1>
      <div className="card" style={{ maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>✓ {done.code}</div>
        <div className="sub" style={{ marginTop: 6 }}>Added to {active.name}’s invoice cycle (net terms). No card charged per shipment.</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => { setDone(null); set("p_to_city", ""); set("p_recipient_name", ""); }}>Create another</button>
          <button className="btn ghost" onClick={() => router.push("/shipper/shipments")}>View shipments</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <h1>New shipment</h1>
      <div className="sub">Billed to {active.name} on invoice — no card charged per shipment.</div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="row" style={{ gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p className="mono">Pickup type</p>
            <select className="input" value={f.p_dropoff_type} onChange={(e) => set("p_dropoff_type", e.target.value)}>
              <option value="door">Door pickup</option><option value="hub">Drop at hub</option><option value="zone">LoadQ zone</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <p className="mono">Size</p>
            <select className="input" value={f.p_size} onChange={(e) => set("p_size", e.target.value)}>
              <option value="envelope">Envelope (≤1kg)</option><option value="small">Small (≤5kg)</option><option value="large">Large (≤20kg)</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ gap: 16, marginTop: 12 }}>
          <div style={{ flex: 1 }}><p className="mono">From city</p><input className="input" value={f.p_from_city} onChange={(e) => set("p_from_city", e.target.value)} /></div>
          <div style={{ flex: 1 }}><p className="mono">To city</p><input className="input" value={f.p_to_city} onChange={(e) => set("p_to_city", e.target.value)} placeholder="Montréal" /></div>
        </div>
        <p className="mono" style={{ marginTop: 12 }}>Recipient</p>
        <input className="input" value={f.p_recipient_name} onChange={(e) => set("p_recipient_name", e.target.value)} placeholder="Name" />
        <div className="row" style={{ gap: 16, marginTop: 12 }}>
          <div style={{ flex: 1 }}><p className="mono">Recipient phone</p><input className="input" value={f.p_recipient_phone} onChange={(e) => set("p_recipient_phone", e.target.value)} placeholder="(514) 555-0148" /></div>
        </div>
        <p className="mono" style={{ marginTop: 12 }}>Delivery address</p>
        <input className="input" value={f.p_dropoff_addr} onChange={(e) => set("p_dropoff_addr", e.target.value)} placeholder="Street, unit, postal code" />
        <p className="mono" style={{ marginTop: 12 }}>Contents</p>
        <input className="input" value={f.p_contents} onChange={(e) => set("p_contents", e.target.value)} placeholder="What's inside" />
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create shipment"}</button>
      </div>
    </>
  );
}
