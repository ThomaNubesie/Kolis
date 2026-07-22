"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LOGO = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png";

function Unsub() {
  const qs = useSearchParams();
  const token = qs.get("token") || "";
  const [state, setState] = useState<"working" | "done" | "error">("working");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("kolis_unsubscribe_by_token", { p_token: token });
        setState(!error && (data as any)?.ok ? "done" : "error");
      } catch { setState("error"); }
    })();
  }, [token]);

  const box: React.CSSProperties = { fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif", maxWidth: 440, margin: "60px auto", textAlign: "center", color: "#0F1A17", padding: "0 16px" };
  return (
    <div style={box}>
      <img src={LOGO} width={48} height={48} style={{ borderRadius: 12 }} />
      <h2 style={{ margin: "16px 0 6px" }}>
        {state === "working" ? "Unsubscribing…" : state === "done" ? "You've been unsubscribed." : "Link invalid or already unsubscribed."}
      </h2>
      {state === "done" && <p style={{ color: "#5A6B63", fontSize: 14 }}>You won't receive promotional emails from this sender. You can close this window.</p>}
    </div>
  );
}

export default function UnsubscribePage() {
  return <Suspense fallback={null}><Unsub /></Suspense>;
}
