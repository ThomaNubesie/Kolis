"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Passwordless sign-in. Email code (businesses + staff) or phone code (Kolis
// members). A 6-digit code is emailed/texted; no passwords.
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const e164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : "+1" + d.replace(/\D/g, ""); };

  const afterAuth = async () => {
    // Staff → admin console. Otherwise the business portal they belong to
    // (accepting any pending email/profile invites first).
    const { data: staff } = await supabase.rpc("kolis_is_staff");
    if (staff) { router.replace("/admin"); return; }
    try { await supabase.rpc("kolis_accept_org_invite"); } catch { /* ignore */ }
    const { data: orgs } = await supabase.rpc("kolis_my_orgs");
    const list = (orgs ?? []) as { type: string }[];
    if (list.some((o) => o.type === "shipper" || o.type === "both")) { router.replace("/shipper"); return; }
    if (list.some((o) => o.type === "carrier")) { router.replace("/carrier"); return; }
    setErr("This account isn't a member of any business yet. Ask your administrator for an invite.");
    await supabase.auth.signOut();
  };

  const send = async () => {
    setBusy(true); setErr("");
    const { error } = mode === "email"
      ? await supabase.auth.signInWithOtp({ email: email.trim() })
      : await supabase.auth.signInWithOtp({ phone: e164(phone) });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSent(true); setCode("");
  };

  const verify = async () => {
    setBusy(true); setErr("");
    const { error } = mode === "email"
      ? await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })
      : await supabase.auth.verifyOtp({ phone: e164(phone), token: code.trim(), type: "sms" });
    if (error) { setBusy(false); setErr(error.message); return; }
    await afterAuth(); setBusy(false);
  };

  const switchMode = (m: "email" | "phone") => { setMode(m); setErr(""); setSent(false); setCode(""); };

  return (
    <div className="center">
      <div className="card" style={{ width: 360, padding: 26 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--accent)" }}>Kolis</div>
        <div className="sub" style={{ marginTop: 2 }}>Sign in to your console</div>

        <div className="row" style={{ marginBottom: 14, marginTop: 6 }}>
          <button className={"chip" + (mode === "email" ? " on" : "")} onClick={() => switchMode("email")}>Email</button>
          <button className={"chip" + (mode === "phone" ? " on" : "")} onClick={() => switchMode("phone")}>Phone</button>
        </div>

        {!sent ? (
          <>
            {mode === "email" ? (
              <>
                <div className="mono">Work email</div>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" onKeyDown={(e) => e.key === "Enter" && send()} />
              </>
            ) : (
              <>
                <div className="mono">Phone number</div>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 613 555 0192" inputMode="tel" onKeyDown={(e) => e.key === "Enter" && send()} />
              </>
            )}
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={send}>
              {busy ? "Sending…" : mode === "email" ? "Email me a code" : "Text me a code"}
            </button>
          </>
        ) : (
          <>
            <div className="mono">6-digit code sent to {mode === "email" ? email.trim() : phone}</div>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" inputMode="numeric" onKeyDown={(e) => e.key === "Enter" && verify()} />
            <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={verify}>{busy ? "Verifying…" : "Verify & sign in"}</button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => { setSent(false); setCode(""); setErr(""); }}>← Back</button>
          </>
        )}
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  );
}
