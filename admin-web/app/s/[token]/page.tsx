"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

// Public share-link landing: /s/<token>. No auth. Calls the cf-share edge fn (verify_jwt=false)
// which validates the token/password/expiry server-side and returns a short-lived signed URL.
const URL = process.env.NEXT_PUBLIC_QUORLY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_QUORLY_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const C = { paper: "#FAF8F4", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", accent: "#2F3AA3", accentSoft: "#EEEFF9" };
const kb = (n?: number | null) => n == null ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";

export default function SharePage() {
  const token = String((useParams() as any)?.token || "");
  const [state, setState] = useState<"loading" | "password" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<any>(null);

  const resolve = useCallback(async (password?: string) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${URL}/functions/v1/cf-share`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, password: password ?? null }),
      });
      const d = await r.json();
      if (d.ok) { setFile(d); setState("ok"); }
      else if (d.error === "password_required" || d.error === "bad_password") { setState("password"); if (d.error === "bad_password") setErr("Incorrect password."); }
      else if (d.error === "expired") { setErr("This link has expired."); setState("error"); }
      else { setErr("This link is no longer available."); setState("error"); }
    } catch { setErr("Something went wrong."); setState("error"); }
    setBusy(false);
  }, [token]);

  useEffect(() => { if (token) resolve(); }, [token, resolve]);

  const isPdf = file?.mime === "application/pdf" || /\.pdf$/i.test(file?.name || "");
  const isImg = /^image\//.test(file?.mime || "") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file?.name || "");
  const wrap: any = { minHeight: "100vh", background: C.paper, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif", color: C.ink, display: "flex", flexDirection: "column", alignItems: "center" };
  const brand = <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0", fontWeight: 800, fontSize: 15 }}>
    <span style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: "3px 9px" }}>Quorly</span>
    <span style={{ display: "flex", gap: 4 }}>{["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"].map((c) => <span key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}</span>
  </div>;
  const card: any = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, maxWidth: 760, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,.06)" };

  return (
    <div style={wrap}>
      {brand}
      <div style={{ padding: "0 16px 40px", width: "100%", maxWidth: 760 }}>
        {state === "loading" && <div style={{ ...card, textAlign: "center", color: C.ink2 }}>Loading…</div>}

        {state === "password" && (
          <div style={{ ...card, maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🔒</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6 }}>Password required</div>
            <div style={{ color: C.ink2, fontSize: 13, marginTop: 4 }}>Enter the password to view this file.</div>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && resolve(pw)} placeholder="Password"
              style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 14, marginTop: 14, boxSizing: "border-box" }} />
            {err && <div style={{ color: "#B4531F", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
            <button onClick={() => resolve(pw)} disabled={busy || !pw} style={{ width: "100%", background: C.accent, color: "#fff", border: 0, borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14, marginTop: 12, cursor: "pointer", opacity: busy || !pw ? .6 : 1 }}>{busy ? "…" : "View file"}</button>
          </div>
        )}

        {state === "error" && <div style={{ ...card, maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6 }}>{err || "Link unavailable"}</div>
          <div style={{ color: C.ink2, fontSize: 13, marginTop: 4 }}>Ask the person who shared it for a new link.</div>
        </div>}

        {state === "ok" && file && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                <div style={{ color: C.faint, fontSize: 12.5 }}>{kb(file.size)}{file.mime ? " · " + file.mime : ""}</div>
              </div>
              {file.allow_download && <a href={file.url} style={{ background: C.accent, color: "#fff", textDecoration: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 13.5 }}>Download</a>}
            </div>
            {isPdf && <iframe src={file.inline_url} style={{ width: "100%", height: "70vh", border: `1px solid ${C.line}`, borderRadius: 12 }} />}
            {isImg && <img src={file.inline_url} alt={file.name} style={{ width: "100%", borderRadius: 12, border: `1px solid ${C.line}` }} />}
            {!isPdf && !isImg && <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 40, textAlign: "center", color: C.ink2, fontSize: 13.5 }}>
              Preview isn't available for this file type.{file.allow_download ? " Use the Download button above." : ""}
            </div>}
            {!file.allow_download && <div style={{ color: C.faint, fontSize: 11.5, marginTop: 10, textAlign: "center" }}>Downloading is disabled for this link — view only.</div>}
          </div>
        )}
      </div>
      <div style={{ color: C.faint, fontSize: 11.5, paddingBottom: 20 }}>Shared securely via Quorly · quorly.ca</div>
    </div>
  );
}
