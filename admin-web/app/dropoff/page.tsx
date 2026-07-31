"use client";
// Sender picks their hub drop-off time. Reads ?t=<dropoff_token>, posts to kolis-dropoff
// (saves the slot + emails dispatch at marketing@concordexpress.ca).
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/kolis-dropoff";
const PINK = "#E11D6B";
const SLOTS = ["7–10 AM", "10 AM–1 PM", "1–4 PM", "4–7 PM", "7–9 PM"];

type Hub = { name: string; address?: string; hours?: string };
type Parcel = { code: string; from: string; to: string; contents?: string; recipient?: string; hub?: Hub | null; saved?: string | null };

function dayLabel(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function Form() {
  const token = useSearchParams().get("t") || "";
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [day, setDay] = useState<string>("Today · " + dayLabel(0));
  const [pickDate, setPickDate] = useState("");
  const [slot, setSlot] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    if (!token) { setLoaded(true); return; }
    fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action: "get" }) })
      .then((r) => r.json()).then((r) => { if (r.ok) setParcel(r.parcel); setLoaded(true); }).catch(() => setLoaded(true));
  }, [token]);

  async function submit() {
    if (!slot) { setState("error"); return; }
    setState("saving");
    const chosenDay = day.startsWith("Pick") ? (pickDate || "a date") : day;
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action: "submit", day: chosenDay, slot, note }) }).then((x) => x.json()).catch(() => ({}));
    setState(r.ok ? "done" : "error");
  }

  const wrap: React.CSSProperties = { fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif", maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: "#fff", color: "#12141a" };
  const lbl: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#1b1b1f", margin: "18px 0 9px" };
  const pill = (on: boolean): React.CSSProperties => ({ border: "1.5px solid " + (on ? PINK : "#dfe3ea"), background: on ? PINK : "#fff", color: on ? "#fff" : "#444", borderRadius: 20, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" });
  const dayBox = (on: boolean): React.CSSProperties => ({ flex: 1, border: "1.5px solid " + (on ? PINK : "#dfe3ea"), background: on ? "#fdeef5" : "#fff", color: on ? PINK : "#444", borderRadius: 11, padding: "10px 4px", textAlign: "center", fontSize: 12, fontWeight: 700, cursor: "pointer" });

  if (loaded && !parcel) return <div style={wrap}><div style={{ background: PINK, color: "#fff", padding: 20 }}><b>KOLIS</b></div><div style={{ padding: 18 }}><h3>Link not found</h3><p style={{ color: "#8a8f99", fontSize: 13 }}>This drop-off link is invalid or expired.</p></div></div>;

  return (
    <div style={wrap}>
      <div style={{ background: PINK, color: "#fff", padding: 20 }}>
        <span style={{ background: "#0A0A0A", fontWeight: 900, fontSize: 12, padding: "3px 8px", borderRadius: 6 }}>KOLIS</span>
        <h1 style={{ fontSize: 20, marginTop: 12 }}>When can you drop off?</h1>
        <p style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>Hub drop-off · Dépôt au point relais</p>
      </div>
      <div style={{ padding: 18 }}>
        {parcel && (
          <div style={{ background: "#faf2f6", border: "1px solid #f0d6e3", borderRadius: 12, padding: 13, fontSize: 13, lineHeight: 1.6, color: "#4a3540" }}>
            <b style={{ color: PINK }}>{parcel.code}</b> · {parcel.contents || "Parcel"} · {parcel.from} → {parcel.to}<br />
            To: {parcel.recipient || ""}{parcel.hub ? <><br />📍 <b>{parcel.hub.name}</b>{parcel.hub.address ? " — " + parcel.hub.address : ""}</> : null}
          </div>
        )}

        {state === "done" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 46, color: PINK }}>✓</div>
            <div style={{ background: "#e7f6ec", color: "#137a37", borderRadius: 10, padding: 12, fontSize: 14 }}>Thanks! Your drop-off time is sent to dispatch.</div>
          </div>
        ) : (
          <>
            <div style={lbl}>1. Which day?</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["Today · " + dayLabel(0), "Today", dayLabel(0)], ["Tomorrow · " + dayLabel(1), "Tomorrow", dayLabel(1)], ["Pick date", "Pick date", ""]].map(([val, top, sub]) => (
                <div key={val} style={dayBox(day === val)} onClick={() => setDay(val)}>{top}<div style={{ fontSize: 10, color: day === val ? PINK : "#999", marginTop: 2 }}>{sub}</div></div>
              ))}
            </div>
            {day.startsWith("Pick") && <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} style={{ width: "100%", marginTop: 8, padding: 11, border: "1.5px solid #dfe3ea", borderRadius: 11, fontSize: 15, boxSizing: "border-box" }} />}

            <div style={lbl}>2. What time?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SLOTS.map((s) => <div key={s} style={pill(slot === s)} onClick={() => setSlot(s)}>{s}</div>)}
            </div>
            <p style={{ fontSize: 11, color: "#8a8f99", marginTop: 7 }}>{parcel?.hub?.hours || "Open daily 7 AM – 9 PM"}</p>

            <div style={lbl}>3. Notes <span style={{ color: PINK, fontWeight: 700 }}>(optional)</span></div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'll come to the main entrance…"
              style={{ width: "100%", border: "1.5px solid #dfe3ea", borderRadius: 11, padding: 11, fontSize: 14, height: 62, resize: "none", boxSizing: "border-box" }} />

            <button onClick={submit} disabled={state === "saving"} style={{ width: "100%", background: PINK, color: "#fff", border: "none", fontWeight: 800, fontSize: 15, borderRadius: 13, padding: 14, marginTop: 16, cursor: "pointer", opacity: state === "saving" ? 0.6 : 1 }}>
              {state === "saving" ? "Sending…" : "Confirm drop-off time"}
            </button>
            {state === "error" && <div style={{ background: "#fdecec", color: "#b3261e", borderRadius: 9, padding: 10, fontSize: 13, marginTop: 10 }}>Please pick a day and a time.</div>}
            <p style={{ fontSize: 11, color: "#8a8f99", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>Your answer is sent to Concord Express dispatch.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Form /></Suspense>;
}
