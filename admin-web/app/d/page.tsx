"use client";
// External-driver custody handoff — public, no-app page.
// Reads ?t=<token>, drives the kolis-custody edge function: OTP -> pickup (GPS) -> deliver (code or photo).
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/kolis-custody";
const PINK = "#E11D6B";

type Parcel = { code: string; from: string; to: string; contents?: string; recipient?: string; hub?: { name: string } | null };
type Step = "verify" | "pickup" | "deliver" | "done";

function pos(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res({}),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

function Handoff() {
  const token = useSearchParams().get("t") || "";
  const [step, setStep] = useState<Step>("verify");
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [dcode, setDcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action, ...extra }) });
    return r.json();
  }
  const errText = (e: string) =>
    ({ expired: "Code expired — resend", wrong_code: "Wrong code", too_many: "Too many tries", need_location: "Please enable location",
       bad_code: "Wrong delivery code", need_photo: "Photo required", payment_not_captured: "Payment issue — contact support",
       completed: "This parcel is already delivered", verify_first: "Verify your phone first" } as Record<string, string>)[e] || "Something went wrong";

  async function sendCode() { setBusy(true); const r = await post("request_otp"); setBusy(false); if (r.ok) { setOtpSent(r.sent_to); setMsg({ t: "Code sent to " + r.sent_to, ok: true }); } else setMsg({ t: errText(r.error) }); }
  async function verify() { setBusy(true); const r = await post("verify_otp", { otp }); setBusy(false); if (r.ok) { setParcel(r.parcel); setStep(r.state); setMsg(null); } else setMsg({ t: errText(r.error) }); }
  async function pickup() { setBusy(true); setMsg({ t: "Checking your location…", ok: true }); const g = await pos(); const r = await post("pickup", g); setBusy(false); if (r.ok) { setStep("deliver"); setMsg({ t: "Pickup confirmed.", ok: true }); } else setMsg({ t: r.error === "too_far" ? `You're ${r.distance_m} m away — be within ${r.need_m} m of the hub` : errText(r.error) }); }
  async function deliverCode() { setBusy(true); const g = await pos(); const r = await post("deliver", { mode: "code", code: dcode, ...g }); setBusy(false); if (r.ok) { setStep("done"); setMsg(null); } else setMsg({ t: errText(r.error) }); }
  async function deliverPhoto(file: File) {
    const b64: string = await new Promise((res) => { const rd = new FileReader(); rd.onload = () => res(rd.result as string); rd.readAsDataURL(file); });
    setBusy(true); setMsg({ t: "Checking your location…", ok: true }); const g = await pos();
    const r = await post("deliver", { mode: "unattended", photo: b64, ...g }); setBusy(false);
    if (r.ok) { setStep("done"); setMsg(null); } else setMsg({ t: r.error === "too_far" ? `You're ${r.distance_m} m from the drop-off` : errText(r.error) });
  }

  const wrap: React.CSSProperties = { fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif", maxWidth: 440, margin: "0 auto", minHeight: "100vh", background: "#fff", color: "#12141a" };
  const btn: React.CSSProperties = { width: "100%", background: PINK, color: "#fff", border: "none", fontWeight: 800, fontSize: 16, borderRadius: 12, padding: 15, marginTop: 12, cursor: "pointer" };
  const btnSec: React.CSSProperties = { ...btn, background: "#fff", color: "#0A0A0A", border: "1.5px solid #0A0A0A" };
  const inp: React.CSSProperties = { width: "100%", border: "1.5px solid #d7dce4", borderRadius: 11, padding: 13, fontSize: 17, letterSpacing: 2, textAlign: "center", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", margin: "14px 0 6px" };
  const mut: React.CSSProperties = { color: "#8a8f99", fontSize: 12.5, textAlign: "center", margin: "9px 0" };

  if (!token) return <div style={wrap}><div style={{ background: PINK, color: "#fff", padding: 20 }}><b>KOLIS</b></div><div style={{ padding: 18 }}><h3>Invalid link</h3><p style={mut}>This handoff link is missing its token.</p></div></div>;

  return (
    <div style={wrap}>
      <div style={{ background: PINK, color: "#fff", padding: 20 }}>
        <span style={{ background: "#0A0A0A", fontWeight: 900, fontSize: 12, padding: "3px 8px", borderRadius: 6 }}>KOLIS</span>
        <h1 style={{ fontSize: 19, marginTop: 10 }}>{step === "done" ? "Delivered" : "Driver handoff"}</h1>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ border: "1px solid #e6eaf0", borderRadius: 12, padding: 13, fontSize: 14, lineHeight: 1.5, marginBottom: 14, background: "#faf2f6" }}>
          {parcel
            ? <><b style={{ color: PINK }}>{parcel.code}</b> · {parcel.contents || "Parcel"}<br />{parcel.from} → {parcel.to}<br />To: {parcel.recipient || ""}{parcel.hub ? <><br />📍 {parcel.hub.name}</> : null}</>
            : "Verify your phone to continue."}
        </div>

        {step === "verify" && (
          <>
            <div style={lbl}>Step 1 · Verify your phone</div>
            <button style={btn} disabled={busy} onClick={sendCode}>Text me a code</button>
            {otpSent && (
              <>
                <div style={lbl}>Enter the 6-digit code</div>
                <input style={inp} inputMode="numeric" maxLength={6} placeholder="------" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <button style={btn} disabled={busy} onClick={verify}>Verify</button>
              </>
            )}
          </>
        )}

        {step === "pickup" && (
          <>
            <div style={lbl}>Confirm pickup at the hub</div>
            <p style={mut}>Tap when you have the parcel and you're at the hub.</p>
            <button style={btn} disabled={busy} onClick={pickup}>I have the parcel — confirm pickup</button>
          </>
        )}

        {step === "deliver" && (
          <>
            <div style={lbl}>Confirm delivery</div>
            <p style={mut}>Recipient there? Enter their delivery code. No one there? Use “Left at drop-off”.</p>
            <input style={inp} inputMode="numeric" maxLength={4} placeholder="delivery code" value={dcode} onChange={(e) => setDcode(e.target.value)} />
            <button style={btn} disabled={busy} onClick={deliverCode}>Confirm with code</button>
            <div style={{ ...lbl, marginTop: 18 }}>No one there?</div>
            <label style={{ ...btnSec, display: "block", textAlign: "center" }}>
              📷 Left at drop-off (photo)
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) deliverPhoto(f); }} />
            </label>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 46, margin: "14px 0 4px", color: PINK }}>✓</div>
            <div style={{ background: "#e7f6ec", color: "#137a37", borderRadius: 10, padding: 12, fontSize: 14 }}>All done. Thank you!</div>
            <p style={{ ...mut, marginTop: 14 }}>Payment captured · recipient &amp; sender notified.</p>
          </div>
        )}

        {msg && <div style={{ fontSize: 13, marginTop: 12, padding: 11, borderRadius: 10, background: msg.ok ? "#eef2fb" : "#fdecec", color: msg.ok ? "#3352a8" : "#b3261e" }}>{msg.t}</div>}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Handoff /></Suspense>;
}
