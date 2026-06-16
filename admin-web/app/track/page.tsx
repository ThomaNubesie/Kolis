"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang, LangToggle } from "@/lib/i18n";

// Public tracking entry — type a code, go to /track/[code].
export default function TrackEntry() {
  const router = useRouter();
  const { t } = useLang();
  const [code, setCode] = useState("");
  const go = () => { const c = code.trim(); if (c) router.push(`/track/${encodeURIComponent(c)}`); };
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFC", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460, padding: "60px 22px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontWeight: 900, fontSize: 24, color: "#E11D6B" }}>Kolis</div>
          <LangToggle />
        </div>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>{t("Track a parcel", "Suivre un colis")}</h1>
          <div className="sub" style={{ marginBottom: 12 }}>{t("Enter your tracking code (e.g. KL-3527).", "Entrez votre code de suivi (ex. KL-3527).")}</div>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KL-0000" onKeyDown={(e) => e.key === "Enter" && go()} />
          <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={go}>{t("Track", "Suivre")}</button>
        </div>
      </div>
    </div>
  );
}
