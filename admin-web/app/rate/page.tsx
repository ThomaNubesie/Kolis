"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LOGO = "https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png";

function Rate() {
  const qs = useSearchParams();
  const token = qs.get("token") || "";
  const initial = Math.max(0, Math.min(5, parseInt(qs.get("stars") || "0") || 0));
  const [rating, setRating] = useState(initial);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [commented, setCommented] = useState(false);

  const save = async (stars: number, cmt?: string) => {
    if (!token) { setState("error"); return; }
    setState("saving");
    const { data, error } = await supabase.rpc("kolis_rate_by_token", { p_token: token, p_stars: stars, p_comment: cmt ?? null });
    setState(!error && (data as any)?.ok ? "saved" : "error");
  };
  // record the star from the email link on load
  useEffect(() => { if (initial) save(initial); /* eslint-disable-next-line */ }, []);

  const box: React.CSSProperties = { fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif", maxWidth: 440, margin: "48px auto", textAlign: "center", color: "#0F1A17", padding: "0 16px" };
  if (!token) return <div style={box}><img src={LOGO} width={48} height={48} style={{ borderRadius: 12 }} /><h2>Invalid rating link</h2></div>;

  return (
    <div style={box}>
      <img src={LOGO} width={48} height={48} style={{ borderRadius: 12 }} />
      <h2 style={{ margin: "16px 0 6px" }}>{state === "error" ? "Link not found" : "Thanks for your feedback!"}</h2>
      {state !== "error" && (
        <>
          <div style={{ fontSize: 38, letterSpacing: 2, margin: "8px 0 4px", cursor: "pointer" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} onClick={() => { setRating(n); save(n); }} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                style={{ color: n <= (hover || rating) ? "#E8B931" : "#ddd", padding: "0 2px" }}>★</span>
            ))}
          </div>
          <p style={{ color: "#5A6B63", fontSize: 14, margin: "0 0 18px" }}>You rated this delivery <b>{rating}/5</b>.</p>
          {!commented ? (
            <form onSubmit={(e) => { e.preventDefault(); save(rating, comment); setCommented(true); }}>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything to add? (optional)"
                style={{ width: "100%", height: 80, border: "1px solid #e7e2d8", borderRadius: 10, padding: 10, fontFamily: "inherit", fontSize: 14 }} />
              <button type="submit" style={{ marginTop: 10, background: "#E11D6B", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>Send comment</button>
            </form>
          ) : <p style={{ color: "#12805a" }}>Comment saved — thank you!</p>}
          <p style={{ color: "#8A978F", fontSize: 12, marginTop: 20 }}>Operated by Concord Express Co Inc. · support@concordexpress.ca</p>
        </>
      )}
    </div>
  );
}

export default function RatePage() {
  return <Suspense fallback={null}><Rate /></Suspense>;
}
