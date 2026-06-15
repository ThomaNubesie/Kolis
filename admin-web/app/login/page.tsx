"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Staff sign in. Email + password (e.g. the owner) or phone OTP (Kolis members).
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const e164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : "+1" + d.replace(/\D/g, ""); };

  const afterAuth = async () => {
    // Staff → admin console. Otherwise route to whichever business portal the
    // account belongs to (accepting any pending org invites first).
    const { data: staff } = await supabase.rpc("kolis_is_staff");
    if (staff) { router.replace("/"); return true; }
    try { await supabase.rpc("kolis_accept_org_invite"); } catch {}
    const { data: orgs } = await supabase.rpc("kolis_my_orgs");
    const list = (orgs ?? []) as { type: string }[];
    if (list.some((o) => o.type === "shipper" || o.type === "both")) { router.replace("/shipper"); return true; }
    if (list.some((o) => o.type === "carrier")) { router.replace("/carrier"); return true; }
    setErr("This account has no console access."); await supabase.auth.signOut(); return false;
  };

  const signInEmail = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setErr(error.message); return; }
    await afterAuth(); setBusy(false);
  };
  const sendPhone = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({ phone: e164(phone) });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSent(true);
  };
  const verifyPhone = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: "sms" });
    if (error) { setBusy(false); setErr(error.message); return; }
    await afterAuth(); setBusy(false);
  };

  return (
    <div className="center">
      <div className="card" style={{ width: 360, padding: 26 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--accent)" }}>Kolis</div>
        <div className="sub" style={{ marginTop: 2 }}>Admin console · staff sign in</div>

        <div className="row" style={{ marginBottom: 14, marginTop: 6 }}>
          <button className={"chip" + (mode === "email" ? " on" : "")} onClick={() => { setMode("email"); setErr(""); }}>Email</button>
          <button className={"chip" + (mode === "phone" ? " on" : "")} onClick={() => { setMode("phone"); setErr(""); setSent(false); }}>Phone</button>
        </div>

        {mode === "email" ? (
          <>
            <div className="mono">Email</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@concordexpress.ca" autoComplete="username" />
            <div className="mono" style={{ marginTop: 10 }}>Password</div>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signInEmail()} autoComplete="current-password" />
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={signInEmail}>{busy ? "Signing in…" : "Sign in"}</button>
          </>
        ) : !sent ? (
          <>
            <div className="mono">Phone number</div>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 613 555 0192" />
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={sendPhone}>{busy ? "Sending…" : "Send code"}</button>
          </>
        ) : (
          <>
            <div className="mono">6-digit code</div>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" inputMode="numeric" />
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={verifyPhone}>{busy ? "Verifying…" : "Verify & sign in"}</button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setSent(false)}>← Wrong number</button>
          </>
        )}
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  );
}
