"use client";
// Sender's one-tap handover confirmation (e-label option 5), opened from the SMS /
// email link: business.kolis.ca/h/<token>. No sign-in — the 32-hex token is the
// key and expires 15 minutes after the courier asked. Confirming flips the parcel
// to picked_up exactly as if the courier had typed the pickup code.
//
// One of several independent ways through pickup (label scan, e-label, proximity
// scan, this, typed code, admin override) — if this fails the courier just uses
// another.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang, LangToggle } from "@/lib/i18n";

type H = { code: string; from_city: string; to_city: string; courier: string | null; status: string; lang: string };

export default function Handover() {
  const { token } = useParams<{ token: string }>();
  const { t, setLang } = useLang();
  const [h, setH] = useState<H | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("kolis_handover_by_token", { p_token: token }).then(({ data }) => {
      const d = (data as H | null) ?? null;
      setH(d);
      if (d?.lang === "en" || d?.lang === "fr") setLang(d.lang as "en" | "fr");
    });
  }, [token, setLang]);

  const decide = async (ok: boolean) => {
    setBusy(true);
    const { data } = await supabase.rpc("kolis_handover_decide", { p_token: token, p_ok: ok });
    setH((cur) => (cur ? { ...cur, status: String(data ?? cur.status) } : cur));
    setBusy(false);
  };

  const who = h?.courier || t("your courier", "votre livreur");
  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "#F7F5EF", display: "flex", justifyContent: "center", padding: "32px 16px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <img src="https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png" width={42} height={42} alt="Kolis" style={{ borderRadius: 10 }} />
          <LangToggle />
        </div>
        {children}
        <p style={{ color: "#8A978F", fontSize: 12, marginTop: 24 }}>Operated by Concord Express Co Inc. · support@concordexpress.ca</p>
      </div>
    </div>
  );

  if (h === undefined) return wrap(<p style={{ color: "#5A6B63" }}>{t("Loading…", "Chargement…")}</p>);
  if (h === null) return wrap(<h1 style={{ fontSize: 22 }}>{t("This link isn't valid.", "Ce lien n'est pas valide.")}</h1>);

  const done = h.status === "confirmed", declined = h.status === "declined", expired = h.status === "expired";
  return wrap(
    <div style={{ background: "#fff", border: "1px solid #E7E3D9", borderRadius: 18, padding: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: "#E11D6B" }}>{h.code} · {h.from_city} → {h.to_city}</div>
      {done ? (
        <>
          <h1 style={{ fontSize: 24, margin: "10px 0 6px" }}>✓ {t("Handover confirmed", "Remise confirmée")}</h1>
          <p style={{ color: "#5A6B63", lineHeight: 1.5 }}>{t(`${who} has your parcel. You'll get a card with the photo shortly.`, `${who} a votre colis. Vous recevrez bientôt une carte avec la photo.`)}</p>
        </>
      ) : declined ? (
        <>
          <h1 style={{ fontSize: 24, margin: "10px 0 6px" }}>{t("Handover refused", "Remise refusée")}</h1>
          <p style={{ color: "#5A6B63", lineHeight: 1.5 }}>{t("The parcel stays with you. If this wasn't expected, contact us.", "Le colis reste avec vous. Si ce n'était pas prévu, contactez-nous.")}</p>
        </>
      ) : expired ? (
        <>
          <h1 style={{ fontSize: 24, margin: "10px 0 6px" }}>{t("This request has expired", "Cette demande a expiré")}</h1>
          <p style={{ color: "#5A6B63", lineHeight: 1.5 }}>{t("Ask the courier to send a new one, or give them your pickup code.", "Demandez au livreur d'en envoyer une nouvelle, ou donnez-lui votre code de ramassage.")}</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 24, margin: "10px 0 6px" }}>{t(`${who} is here for your parcel`, `${who} est là pour votre colis`)}</h1>
          <p style={{ color: "#5A6B63", lineHeight: 1.5 }}>{t("Hand the parcel over, then confirm. This replaces the pickup code.", "Remettez le colis, puis confirmez. Cela remplace le code de ramassage.")}</p>
          <button disabled={busy} onClick={() => decide(true)} style={{ width: "100%", marginTop: 16, background: "#E11D6B", color: "#fff", border: 0, borderRadius: 12, padding: 15, fontWeight: 800, fontSize: 16, opacity: busy ? 0.6 : 1 }}>
            {t("Confirm handover", "Confirmer la remise")}
          </button>
          <button disabled={busy} onClick={() => decide(false)} style={{ width: "100%", marginTop: 10, background: "#fff", color: "#B81558", border: "1.5px solid #E11D6B", borderRadius: 12, padding: 13, fontWeight: 800, fontSize: 14 }}>
            {t("This isn't me / not handed over", "Ce n'est pas moi / pas remis")}
          </button>
        </>
      )}
    </div>
  );
}
