"use client";
// Billing, from the organisation's side.
//
// Deliberately thin. Stripe Checkout takes the card and Stripe's Billing Portal
// handles invoices, card changes and cancellation — rebuilding those screens would
// mean handling card data and getting PCI wrong. What belongs here is only what
// Stripe cannot know: which plan suits this organisation, how many members it has,
// and how close it is to its text allowance.
//
// Nothing on this screen charges anyone. "Choose" opens Checkout; the card is entered
// there, and the plan only changes when Stripe says so through the webhook.
import { useCallback, useEffect, useState } from "react";
import { cf, type CfBillingState } from "@/lib/cf";
import { Check, ExternalLink, CreditCard } from "lucide-react";

const C = { ink: "#14131A", ink2: "#6B6675", faint: "#A8A29A", line: "#E3DCCB", accent: "#2F3AA3", soft: "#F4F1FB", cream: "#FBF8F2" };
const L = (en: string, fr: string) => ({ en, fr });

// The catalogue as members read it. The authority for what is CHARGED is the Stripe
// price built by quorly-plans; this is the description beside it, and the two are
// meant to be read together — if they ever disagree, Stripe wins and this is a bug.
const PLANS = [
  { key: "starter",  name: "Starter",  price: "$49",  members: 25,  texts: 0,    gb: 10,
    blurb: L("A small condo board or committee", "Un petit syndicat ou comité"),
    lines: [L("Up to 25 members · 1 department", "Jusqu'à 25 membres · 1 département"),
            L("Meetings with video", "Réunions avec vidéo"),
            L("Email notifications", "Avis par courriel"),
            L("10 GB storage", "10 Go de stockage")] },
  { key: "board",    name: "Board",    price: "$129", members: 100, texts: 800,  gb: 50, popular: true,
    blurb: L("Everything a working board needs", "Tout pour un conseil actif"),
    lines: [L("Up to 100 members · 3 departments", "Jusqu'à 100 membres · 3 départements"),
            L("Elections, receipts, 2FA", "Élections, reçus, 2FA"),
            L("800 texts/month included", "800 SMS/mois inclus"),
            L("50 GB storage", "50 Go de stockage")] },
  { key: "business", name: "Business", price: "$299", members: 250, texts: 2500, gb: 500,
    blurb: L("Associations with staff & several boards", "Associations avec personnel"),
    lines: [L("Up to 250 members, then $1 each", "Jusqu'à 250 membres, puis 1 $ chacun"),
            L("End-to-end encryption", "Chiffrement bout en bout"),
            L("2,500 texts/month included", "2 500 SMS/mois inclus"),
            L("500 GB storage", "500 Go de stockage")] },
];

export default function BillingPanel({ orgId, tr, lang }: { orgId: string; tr: (o: any) => string; lang: string }) {
  const [st, setSt] = useState<CfBillingState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    cf.billingState(orgId)
      .then((r) => { if (r?.error) setErr(r.error); else setSt(r.state ?? null); })
      .catch((e) => setErr(e?.message || "failed"));
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  // Returning from Checkout, the webhook may not have landed yet — re-read shortly
  // after so the screen does not sit on a stale plan.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("billing") !== "ok") return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [load]);

  const go = async (fn: () => Promise<{ url?: string; error?: string }>, tag: string) => {
    setBusy(tag); setErr(null);
    try {
      const r = await fn();
      if (r?.url) window.location.href = r.url;
      else setErr(r?.error || "failed");
    } catch (e: any) { setErr(e?.message || "failed"); }
    setBusy(null);
  };

  // Stripe not configured yet reads as an ordinary "not set up" rather than a crash.
  if (err === "stripe_not_configured") return (
    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.7, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
      <b>{tr(L("Billing isn't switched on yet.", "La facturation n'est pas encore activée."))}</b><br />
      {tr(L("Plans are published but no payments are being taken. Nothing is owed.",
            "Les forfaits sont publiés mais aucun paiement n'est prélevé. Rien n'est dû."))}
    </div>
  );

  const current = st?.plan ?? "free";
  const paying = !!st?.stripe_subscription_id;
  const plan = PLANS.find((p) => p.key === current);
  const overMembers = plan ? Math.max(0, (st?.members ?? 0) - plan.members) : 0;
  const texts = st?.texts_this_month ?? 0;
  const pct = plan?.texts ? Math.min(100, Math.round(texts / plan.texts * 100)) : 0;

  const statusWord = st?.plan_status === "trialing" ? tr(L("free trial", "essai gratuit"))
    : st?.plan_status === "past_due" ? tr(L("payment failed", "paiement échoué"))
    : st?.plan_status === "canceled" ? tr(L("cancelled", "annulé"))
    : st?.plan_status === "active" ? tr(L("active", "actif")) : null;

  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 };
  const btn = (primary: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%",
    background: primary ? C.accent : "#fff", color: primary ? "#fff" : C.accent,
    border: `1.5px solid ${C.accent}`, borderRadius: 10, padding: "10px 14px",
    fontSize: 13, fontWeight: 800, cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ---- where this organisation stands ---- */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .6, textTransform: "uppercase", color: C.faint }}>
            {tr(L("Current plan", "Forfait actuel"))}
          </div>
          <div style={{ fontSize: 19, fontWeight: 900 }}>{plan?.name ?? tr(L("Free", "Gratuit"))}</div>
          {statusWord && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 20,
            background: st?.plan_status === "past_due" ? "#FBEFE7" : C.soft,
            color: st?.plan_status === "past_due" ? "#B4531F" : C.accent }}>{statusWord}</span>}
          {st?.plan_renews_at && <span style={{ fontSize: 11.5, color: C.faint, marginLeft: "auto" }}>
            {tr(L("renews", "renouvelle"))} {new Date(st.plan_renews_at).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "long" })}
          </span>}
        </div>

        <div style={{ display: "flex", gap: 22, marginTop: 13, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>{tr(L("Members", "Membres"))}</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {st?.members ?? 0}{plan ? <span style={{ color: C.faint, fontWeight: 600 }}> / {plan.members}</span> : null}
            </div>
            {overMembers > 0 && current === "business" && (
              <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>
                +{overMembers} × $1 = ${overMembers}.00{tr(L("/mo", "/mois"))}
              </div>
            )}
          </div>
          {!!plan?.texts && (
            <div style={{ minWidth: 170 }}>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 700 }}>{tr(L("Texts this month", "SMS ce mois-ci"))}</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {texts.toLocaleString()}<span style={{ color: C.faint, fontWeight: 600 }}> / {plan.texts.toLocaleString()}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#EDEAE3", marginTop: 5, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#B4531F" : C.accent }} />
              </div>
              {texts > plan.texts && (
                <div style={{ fontSize: 11, color: "#B4531F", fontWeight: 700, marginTop: 3 }}>
                  {(texts - plan.texts).toLocaleString()} {tr(L("over — billed at $0.06 each", "en excédent — 0,06 $ chacun"))}
                </div>
              )}
            </div>
          )}
        </div>

        {paying && (
          <div style={{ marginTop: 14 }}>
            <span onClick={() => go(() => cf.billingPortal(orgId), "portal")} style={{ ...btn(false), width: "auto", padding: "8px 13px" }}>
              <CreditCard size={14} />
              {busy === "portal" ? tr(L("Opening…", "Ouverture…")) : tr(L("Manage billing, card & invoices", "Gérer la facturation, la carte et les factures"))}
              <ExternalLink size={12} />
            </span>
          </div>
        )}
      </div>

      {err && err !== "stripe_not_configured" && (
        <div style={{ background: "#FBEFE7", border: "1px solid #EBD3A1", color: "#7a4a10", borderRadius: 11, padding: "10px 13px", fontSize: 12.5 }}>{err}</div>
      )}

      {/* ---- choosing / changing plan ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 12 }}>
        {PLANS.map((p) => {
          const on = current === p.key;
          return (
            <div key={p.key} style={{ ...card, border: `${on || p.popular ? 2 : 1}px solid ${on ? "#1F9D6B" : p.popular ? C.accent : C.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{p.name}</div>
                {on && <span style={{ fontSize: 10, fontWeight: 800, color: "#1F7A4D", background: "#EAF7F0", padding: "2px 8px", borderRadius: 20 }}>{tr(L("current", "actuel"))}</span>}
                {!on && p.popular && <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, background: C.soft, padding: "2px 8px", borderRadius: 20 }}>{tr(L("most boards", "populaire"))}</span>}
              </div>
              <div><span style={{ fontSize: 22, fontWeight: 900 }}>{p.price}</span><span style={{ fontSize: 12, color: C.faint, fontWeight: 700 }}> CAD{tr(L("/mo", "/mois"))}</span></div>
              <div style={{ fontSize: 12, color: C.ink2 }}>{tr(p.blurb)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "2px 0 6px" }}>
                {p.lines.map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 7, fontSize: 12.3, lineHeight: 1.45 }}>
                    <Check size={13} style={{ color: "#1F9D6B", flex: "none", marginTop: 2 }} />{tr(l)}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "auto" }}>
                {on ? (
                  <div style={{ ...btn(false), cursor: "default", opacity: .55 }}>{tr(L("Your plan", "Votre forfait"))}</div>
                ) : (
                  <div onClick={() => go(() => cf.billingCheckout(orgId, p.key), p.key)} style={btn(!!p.popular)}>
                    {busy === p.key ? tr(L("Opening…", "Ouverture…"))
                      : paying ? tr(L("Switch to this", "Passer à ce forfait"))
                      : tr(L("Choose", "Choisir"))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.65 }}>
        {tr(L("Prices in Canadian dollars, per organization. The first 7 days are free — you are not charged until the trial ends, and you can cancel before then. Payment is handled by Stripe; Quorly never sees your card.",
              "Prix en dollars canadiens, par organisation. Les 7 premiers jours sont gratuits — aucun prélèvement avant la fin de l'essai, et vous pouvez annuler avant. Le paiement est traité par Stripe ; Quorly ne voit jamais votre carte."))}
      </div>
    </div>
  );
}
