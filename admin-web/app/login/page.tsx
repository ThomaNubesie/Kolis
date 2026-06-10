"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Staff sign in with the SAME phone login as the Kolis app, so the session maps
// to their kolis_admin_roles row.
export default function Login() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const e164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : "+1" + d.replace(/\D/g, ""); };

  const send = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({ phone: e164(phone) });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSent(true);
  };
  const verify = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const { data: staff } = await supabase.rpc("kolis_is_staff");
    if (!staff) { setErr("This account has no admin access."); await supabase.auth.signOut(); return; }
    router.replace("/");
  };

  return (
    <div className="center">
      <div className="card" style={{ width: 360, padding: 26 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--accent)" }}>Kolis</div>
        <div className="sub" style={{ marginTop: 2 }}>Admin console · staff sign in</div>
        {!sent ? (
          <>
            <div className="mono" style={{ marginTop: 10 }}>Phone number</div>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 613 555 0192" />
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send code"}</button>
          </>
        ) : (
          <>
            <div className="mono" style={{ marginTop: 10 }}>6-digit code</div>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" inputMode="numeric" />
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={verify}>{busy ? "Verifying…" : "Verify & sign in"}</button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setSent(false)}>← Wrong number</button>
          </>
        )}
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  );
}
