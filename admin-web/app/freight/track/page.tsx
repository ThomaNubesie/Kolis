"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";

// Kolis-branded freight tracking. Looks up kolis_freight_track(number) — only
// returns booked shipments (that have a tracking number). Shows the Kolis lane +
// status, then hands off to the carrier's live tracking link.
const STAGES = ["booked", "in_transit", "delivered"];

function TrackInner() {
  const search = useSearchParams();
  const { t, lang, setLang } = useLang();
  const [num, setNum] = useState("");
  const [res, setRes] = useState<any | undefined>(undefined); // undefined=idle, null=not found
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = search.get("lang"); if (q === "fr" || q === "en") setLang(q);
    const n = search.get("n"); if (n) { setNum(n); lookup(n); }
  }, [search]); // eslint-disable-line

  async function lookup(n: string) {
    const v = (n || "").trim(); if (!v) return;
    setLoading(true); setRes(undefined);
    const { data } = await supabase.rpc("kolis_freight_track", { p_tracking: v });
    setRes((Array.isArray(data) ? data[0] : data) ?? null);
    setLoading(false);
  }
  const day = (s?: string) => (s ? new Date(s).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" }) : "");
  // booked shipments read as "in transit" on the Kolis side; carrier link has live detail
  const stageIdx = res ? (res.status === "delivered" ? 2 : 1) : 0;
  const slabel = (s: string) => ({ booked: t("Booked", "Réservé"), in_transit: t("In transit", "En transit"), delivered: t("Delivered", "Livré") } as Record<string, string>)[s] || s;

  return (
    <div className="ft">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ft-top">
        <div className="brand"><div className="lg">Ko</div>Kolis <span className="biz">· Freight</span></div>
        <LangToggle />
      </div>
      <div className="ft-wrap">
        <h1>{t("Track your freight", "Suivez votre fret")}</h1>
        <div className="findrow">
          <input className="inp" value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup(num)} placeholder={t("Tracking / PRO number", "N° de suivi / PRO")} />
          <button className="go" onClick={() => lookup(num)}>{t("Track", "Suivre")}</button>
        </div>

        {loading && <div className="card muted">{t("Looking up…", "Recherche…")}</div>}
        {res === null && <div className="card muted">{t("No shipment found for that number. Check it and try again, or call (613) 862-2639.", "Aucun envoi trouvé pour ce numéro. Vérifiez-le ou appelez le (613) 862-2639.")}</div>}

        {res && (
          <div className="card">
            <div className="lane">{res.origin} <span className="arw">→</span> {res.destination}</div>
            <div className="meta">{res.pallets} {t("pallet(s)", "palette(s)")}{res.booked_at ? ` · ${t("booked", "réservé")} ${day(res.booked_at)}` : ""}</div>

            <div className="stages">
              {STAGES.map((s, i) => (
                <div key={s} className={"st" + (i <= stageIdx ? " on" : "") + (i === stageIdx ? " cur" : "")}>
                  <div className="dot">{i < stageIdx ? "✓" : i === stageIdx ? "●" : ""}</div>
                  <div className="lb">{slabel(s)}</div>
                </div>
              ))}
              <div className="bar"><div className="fill" style={{ width: `${(stageIdx / (STAGES.length - 1)) * 100}%` }} /></div>
            </div>

            {res.carrier && <div className="carrier">{t("Carrier", "Transporteur")}: <b>{res.carrier}</b></div>}
            {res.tracking_url
              ? <a className="go wide" href={res.tracking_url} target="_blank" rel="noreferrer">{t("Live tracking with carrier ↗", "Suivi en direct chez le transporteur ↗")}</a>
              : <div className="muted small">{t("Live carrier tracking will appear here once available.", "Le suivi en direct du transporteur apparaîtra ici dès qu'il sera disponible.")}</div>}
          </div>
        )}

        <div className="foot">{t("Kolis Freight · operated by Concord Express Co Inc.", "Kolis Fret · exploité par Concord Express Co Inc.")}</div>
      </div>
    </div>
  );
}

export default function FreightTrack() {
  return <Suspense fallback={null}><TrackInner /></Suspense>;
}

const CSS = `
.ft{min-height:100vh;background:#F1F0F4;color:#1a1722;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
.ft-top{background:#fff;border-bottom:1px solid #ECECF2;display:flex;align-items:center;justify-content:space-between;padding:14px 24px}
.ft .brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:18px}
.ft .lg{width:34px;height:34px;border-radius:10px;background:#E11D6B;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.ft .biz{color:#E11D6B}
.ft-wrap{max-width:520px;margin:0 auto;padding:30px 20px 60px}
.ft h1{font-size:24px;margin-bottom:16px}
.findrow{display:flex;gap:8px;margin-bottom:18px}
.ft .inp{flex:1;border:1.5px solid #ECECF2;border-radius:11px;padding:12px 14px;font-size:15px;background:#fff}
.ft .inp:focus{outline:none;border-color:#E11D6B}
.ft .go{background:#E11D6B;color:#fff;font-weight:800;border:none;border-radius:11px;padding:12px 20px;font-size:15px;cursor:pointer}
.ft .go.wide{display:block;width:100%;text-align:center;text-decoration:none;margin-top:16px;padding:14px}
.ft .card{background:#fff;border:1px solid #ECECF2;border-radius:16px;padding:22px}
.ft .card.muted{color:#6B6675;font-size:14px}
.ft .lane{font-size:20px;font-weight:900;letter-spacing:-.3px}.ft .arw{color:#E11D6B}
.ft .meta{color:#6B6675;font-size:13px;margin:4px 0 22px}
.stages{position:relative;display:flex;justify-content:space-between;margin:0 6px 8px}
.stages .bar{position:absolute;left:16px;right:16px;top:11px;height:3px;background:#ECECF2;border-radius:3px;z-index:0}
.stages .bar .fill{height:100%;background:#E11D6B;border-radius:3px;transition:width .4s}
.st{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;flex:1}
.st .dot{width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid #ECECF2;color:#c9c6cf;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.st.on .dot{border-color:#E11D6B;color:#E11D6B}
.st.cur .dot{background:#E11D6B;color:#fff}
.st .lb{font-size:11.5px;color:#9b97a6;margin-top:7px;font-weight:600}
.st.on .lb{color:#1a1722}
.carrier{margin-top:18px;font-size:14px;color:#6B6675}
.ft .small{font-size:12.5px;margin-top:14px}
.foot{text-align:center;color:#9b97a6;font-size:11.5px;margin-top:26px}
`;
