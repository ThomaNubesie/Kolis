"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

type PlanDef = { key: string; name: string; price: number; fee: string; features: [string, string][] };

export default function Plans() {
  const { t, lang } = useLang();
  const { active } = useOrg();
  const search = useSearchParams();
  const [cur, setCur] = useState<{ plan: string; plan_status?: string; fee_rate: number; renews_at?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [needsPlan, setNeedsPlan] = useState(false); // org not yet activated — must pick a plan first

  const startFree = async () => {
    if (!active?.org_id) return;
    setBusy("free"); setMsg("");
    try { await org.chooseFree(active.org_id); window.location.href = "/shipper"; }
    catch (e: any) { setMsg(e?.message || "Error"); setBusy(null); }
  };

  const PLANS: PlanDef[] = [
    { key: "free", name: t("Basic", "De base"), price: 0, fee: "20%", features: [
      [t("Dashboard & live tracking", "Tableau de bord & suivi en direct"), ""],
      [t("Create, track & manage shipments", "Créer, suivre et gérer les envois"), ""],
      [t("No monthly fee — pay per shipment", "Aucuns frais mensuels — payez à l'envoi"), ""],
    ] },
    { key: "business", name: "Business", price: 124.99, fee: "15%", features: [
      [t("Everything in Basic", "Tout de Basic"), ""],
      [t("Better delivery rates", "Meilleurs tarifs de livraison"), ""],
      [t("Branded tracking & emails", "Suivi et courriels à votre marque"), ""],
      [t("Bulk import & analytics", "Import en lot & statistiques"), ""],
      [t("Up to 3 team seats · freight quoting", "Jusqu'à 3 sièges · cotation de fret"), ""],
    ] },
    { key: "pro", name: "Pro", price: 199.99, fee: "12%", features: [
      [t("Everything in Business", "Tout de Business"), ""],
      [t("Best delivery rates", "Les meilleurs tarifs de livraison"), ""],
      [t("API access & multi-location", "Accès API & multi-emplacements"), ""],
      [t("Priority dispatch", "Répartition prioritaire"), ""],
      [t("Dedicated support", "Soutien dédié"), ""],
    ] },
  ];

  const load = useCallback(() => {
    if (!active?.org_id) return;
    supabase.rpc("kolis_org_plan", { p_org: active.org_id }).then(({ data }) => setCur(Array.isArray(data) ? data[0] : data));
    org.needsPlan(active.org_id).then(setNeedsPlan).catch(() => {});
  }, [active?.org_id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const s = search.get("sub");
    if (s === "ok") setMsg(t("Subscription active — welcome aboard!", "Abonnement actif — bienvenue !"));
    else if (s === "cancel") setMsg(t("Checkout cancelled.", "Paiement annulé."));
  }, [search]); // eslint-disable-line

  const choose = async (plan: string) => {
    if (!active?.org_id) return;
    setBusy(plan); setMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("kolis-plans", { body: { action: "checkout", org_id: active.org_id, plan } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) { setMsg(e?.message || "Error"); setBusy(null); }
  };
  const manage = async () => {
    if (!active?.org_id) return;
    setBusy("portal"); setMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("kolis-plans", { body: { action: "portal", org_id: active.org_id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) { setMsg(e?.message || "Error"); setBusy(null); }
  };

  const curPlan = cur?.plan || "free";
  const day = (s?: string) => (s ? new Date(s).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");

  return (
    <>
      <h1>{t("Plans & pricing", "Forfaits & tarifs")}</h1>
      <div className="sub" style={{ marginBottom: 6 }}>{t(
        "Pick the plan that fits your volume. Higher plans unlock more tools and better rates.",
        "Choisissez le forfait selon votre volume. Les forfaits supérieurs débloquent plus d'outils et de meilleurs tarifs.")}</div>
      {needsPlan && <div className="card" style={{ marginBottom: 14, borderColor: "#E11D6B", background: "#fdeef4", color: "#9c1048", fontWeight: 600 }}>{t(
        "Choose a subscription to activate your account. The portal stays locked until you select a plan.",
        "Choisissez un abonnement pour activer votre compte. Le portail reste verrouillé tant qu'aucun forfait n'est sélectionné.")}</div>}
      {!needsPlan && (
        <div style={{ marginBottom: 18, fontSize: 13, color: "var(--t2)" }}>
          {t("Current plan", "Forfait actuel")}: <b style={{ color: "#E11D6B" }}>{PLANS.find((p) => p.key === curPlan)?.name || curPlan}</b>
          {cur?.renews_at && curPlan !== "free" ? ` · ${t("renews", "renouvellement")} ${day(cur.renews_at)}` : ""}
          {curPlan !== "free" && <> · <a onClick={manage} style={{ color: "#E11D6B", cursor: "pointer", fontWeight: 700 }}>{busy === "portal" ? "…" : t("Manage billing", "Gérer la facturation")}</a></>}
        </div>
      )}
      {msg && <div className="card" style={{ marginBottom: 14, borderColor: "#E11D6B", color: "#9c1048" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        {PLANS.map((p) => {
          const isCur = !needsPlan && p.key === curPlan;
          return (
            <div key={p.key} className="card" style={{ borderColor: isCur ? "#E11D6B" : undefined, borderWidth: isCur ? 2 : undefined, position: "relative" }}>
              {p.key === "business" && <div style={{ position: "absolute", top: -10, right: 16, background: "#E11D6B", color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20 }}>{t("Most popular", "Le plus populaire")}</div>}
              <div style={{ fontSize: 18, fontWeight: 800 }}>{p.name}</div>
              <div style={{ margin: "8px 0 2px" }}><span style={{ fontSize: 30, fontWeight: 900 }}>${p.price}</span><span style={{ color: "var(--t3)", fontSize: 13 }}>{p.price ? t("/mo", "/mois") : ""}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                {p.features.map((f, i) => <div key={i} style={{ fontSize: 13, color: "var(--t2)", display: "flex", gap: 8 }}><span style={{ color: "#178a5e", fontWeight: 800 }}>✓</span>{f[0]}</div>)}
              </div>
              {isCur ? (
                <button className="btn ghost" disabled style={{ width: "100%" }}>{t("Current plan", "Forfait actuel")}</button>
              ) : p.key === "free" ? (
                needsPlan ? (
                  <button className="btn" onClick={startFree} disabled={!!busy} style={{ width: "100%" }}>{busy === "free" ? "…" : t("Start with Basic", "Commencer avec Basic")}</button>
                ) : (
                  <button className="btn ghost" onClick={manage} disabled={busy === "portal"} style={{ width: "100%" }}>{t("Downgrade", "Rétrograder")}</button>
                )
              ) : (
                <button className="btn" onClick={() => choose(p.key)} disabled={!!busy} style={{ width: "100%" }}>{busy === p.key ? "…" : t("Choose", "Choisir")}</button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 20, fontSize: 12, color: "var(--t3)" }}>{t(
        "Freight (LTL pallets) is priced per shipment on any plan. Cancel or change anytime. Prices in CAD, plus tax.",
        "Le fret (palettes LTL) est facturé par envoi sur tout forfait. Annulez ou changez à tout moment. Prix en CAD, taxes en sus.")}</div>
    </>
  );
}
