"use client";
import { useEffect, useState } from "react";
import { useLang, LangToggle } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import AddressInput from "@/components/AddressInput";
import SelectOrCustom from "@/components/SelectOrCustom";
import { LayoutGrid, List, Rows3, CreditCard, Wallet, Landmark, CalendarDays, Lock } from "lucide-react";

const IC: React.CSSProperties = { verticalAlign: "-3px", marginRight: 6 };

// Public "request a pallet quote" page — concierge MVP for Kolis Freight (LTL).
// Posts to the kolis-freight-request edge function (saves + emails the Kolis team,
// who pull a carrier rate and quote back). No live aggregator rating yet.
const FN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/functions/v1/kolis-freight-request";
const ACC = [
  { k: "liftgate", en: "Liftgate", fr: "Hayon élévateur" },
  { k: "residential", en: "Residential", fr: "Résidentiel" },
  { k: "appointment", en: "Appointment", fr: "Rendez-vous" },
  { k: "insurance", en: "Insurance", fr: "Assurance" },
];

const RATE_FN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/functions/v1/kolis-freight-rate";
const BOOK_FN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/functions/v1/kolis-freight-book";
// HST/GST by origin province — display only; kolis-freight-book recomputes authoritatively.
const taxRateOf = (region?: string) => {
  const r = (region || "").toLowerCase().trim();
  if (["on", "ontario"].includes(r)) return 0.13;
  if (["nb", "new brunswick", "ns", "nova scotia", "pe", "prince edward island", "nl", "newfoundland and labrador", "newfoundland"].includes(r)) return 0.15;
  if (["qc", "quebec", "québec"].includes(r)) return 0.14975;
  return 0.05;
};
const m2 = (n: number) => n.toFixed(2);
type PayMethod = "card" | "onfile" | "interac" | "account";
type Parts = { postal?: string; city?: string; region?: string; country?: string; line1?: string };
type Tier = { name: string; price: number; transit_days: number; service_id?: string; residential_surcharge?: number };
type View = "shortlist" | "list" | "grouped";
type Sort = "cheapest" | "fastest";
type ResEnd = "pickup" | "delivery" | "both";
// pull the heaviest lb figure + the three dimension numbers out of the picker text
const lbOf = (s: string) => { const m = [...(s || "").matchAll(/(\d[\d,]*)\s*lb/gi)].map((x) => parseInt(x[1].replace(/,/g, ""))); return m.length ? Math.max(...m) : (parseInt((s || "").replace(/\D/g, "")) || 0); };
const dimsOf = (s: string) => { const n = (s || "").match(/\d+/g)?.map(Number) || []; return { l: n[0] || 48, w: n[1] || 40, h: n[2] || 48 }; };

export default function Freight() {
  const { t, lang } = useLang();
  const [state, setState] = useState<"form" | "sending" | "quote" | "checkout" | "booked" | "done">("form");
  const [err, setErr] = useState("");
  const [acc, setAcc] = useState<string[]>(["liftgate"]);
  const [f, setF] = useState({ business: "", contact: "", phone: "", email: "", origin: "", destination: "", pallets: "1", weight: "", dims: "", note: "", website: "" });
  const [oParts, setOParts] = useState<Parts>({});
  const [dParts, setDParts] = useState<Parts>({});
  const [tiers, setTiers] = useState<Tier[]>([]);
  // Results view preferences (remembered per device; surfaced as the default view).
  const [view, setView] = useState<View>("shortlist");
  const [sort, setSort] = useState<Sort>("cheapest");
  const [maxTransit, setMaxTransit] = useState<number>(0); // 0 = any
  const [resEnd, setResEnd] = useState<ResEnd>("delivery");
  const [showAll, setShowAll] = useState(false);
  // Checkout / pay-per-shipment.
  const [sel, setSel] = useState<Tier | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [interacInfo, setInteracInfo] = useState<{ pay_ref: string; interac_to: string; total_cents: number } | null>(null);
  const [booked, setBooked] = useState<{ tracking: string; method: string } | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (k: string) => setAcc(acc.includes(k) ? acc.filter((x) => x !== k) : [...acc, k]);

  // Load saved view/sort/residential-end preferences.
  useEffect(() => {
    try {
      const v = localStorage.getItem("kolis_freight_view"); if (v === "shortlist" || v === "list" || v === "grouped") setView(v);
      const s = localStorage.getItem("kolis_freight_sort"); if (s === "cheapest" || s === "fastest") setSort(s);
      const re = localStorage.getItem("kolis_freight_res_end"); if (re === "pickup" || re === "delivery" || re === "both") setResEnd(re);
    } catch { /* ignore */ }
  }, []);
  // Returning from hosted Stripe Checkout (?booked=<id>) → verify the hold + confirm booking.
  useEffect(() => {
    let id: string | null = null;
    try { id = new URLSearchParams(window.location.search).get("booked"); } catch { /* ignore */ }
    if (!id) return;
    setState("sending");
    (async () => {
      const r = await fetch(BOOK_FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" }, body: JSON.stringify({ action: "confirm", request_id: id }) }).then((x) => x.json()).catch(() => ({}));
      if (r?.ok && r.booked) { setBooked({ tracking: r.tracking_number || "", method: "card" }); setState("booked"); }
      else { setErr(t("We couldn't confirm the payment. If you were charged, please contact us.", "Nous n'avons pas pu confirmer le paiement. Si vous avez été débité, contactez-nous.")); setState("form"); }
      try { window.history.replaceState({}, "", "/freight"); } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chooseView = (v: View) => { setView(v); try { localStorage.setItem("kolis_freight_view", v); } catch { /* ignore */ } };
  const chooseSort = (s: Sort) => { setSort(s); try { localStorage.setItem("kolis_freight_sort", s); } catch { /* ignore */ } };
  const chooseResEnd = (re: ResEnd) => { setResEnd(re); try { localStorage.setItem("kolis_freight_res_end", re); } catch { /* ignore */ } };

  // Prefill merchant details when a signed-in business opens the form.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: { user } } = await supabase.auth.getUser();
      let biz = "";
      try { const { data: orgs } = await supabase.rpc("kolis_my_orgs"); if (Array.isArray(orgs) && orgs[0]) { biz = orgs[0].name || ""; if (orgs[0].id) setOrgId(orgs[0].id as string); } } catch { /* ignore */ }
      const meta = (user?.user_metadata || {}) as { full_name?: string };
      setF((prev) => ({
        ...prev,
        business: prev.business || biz,
        contact: prev.contact || meta.full_name || "",
        email: prev.email || user?.email || "",
        phone: prev.phone || user?.phone || "",
      }));
    })();
  }, []);

  const anon = { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" };

  // Concierge fallback: save the request + email the team.
  async function sendConcierge(quoted?: Tier) {
    const note = quoted ? `${f.note ? f.note + " · " : ""}Chose ${quoted.name} $${quoted.price} (${quoted.transit_days}d)` : f.note;
    const r = await fetch(FN, { method: "POST", headers: anon, body: JSON.stringify({ ...f, note, accessorials: acc, lang }) });
    const d = await r.json().catch(() => ({}));
    return !!(d && d.ok);
  }

  async function submit(e: React.FormEvent) { e.preventDefault(); runQuote(); }
  async function runQuote() {
    setErr("");
    if (!f.origin.trim() || !f.destination.trim()) { setErr(t("Origin and destination are required.", "L'origine et la destination sont requises.")); return; }
    if (!f.contact.trim() || !f.phone.trim()) { setErr(t("Name and phone are required.", "Le nom et le téléphone sont requis.")); return; }
    setState("sending");
    try {
      // 1) try a live Freightcom rate (needs postal codes from the address picker)
      const rate = await fetch(RATE_FN, { method: "POST", headers: anon, body: JSON.stringify({
        origin: { ...oParts, name: f.business }, destination: dParts,
        pallets: Number(f.pallets) || 1, weight_lb: lbOf(f.weight), ...dimsOf(f.dims),
        accessorials: acc, residential_end: resEnd,
      }) }).then((r) => r.json()).catch(() => ({ concierge: true }));

      if (rate?.ok && Array.isArray(rate.tiers) && rate.tiers.length) {
        setTiers(rate.tiers); setShowAll(false); setState("quote"); return;   // live price populated
      }
      // 2) fall back to concierge (no aggregator key, or missing postal, or API down)
      if (await sendConcierge()) { setState("done"); return; }
      setErr(t("Couldn't send — please call (613) 862-2639.", "Envoi impossible — appelez le (613) 862-2639.")); setState("form");
    } catch { setErr(t("Network error — please call (613) 862-2639.", "Erreur réseau — appelez le (613) 862-2639.")); setState("form"); }
  }

  function accept(tier: Tier) {
    setSel(tier); setErr(""); setInteracInfo(null); setPayMethod("card"); setState("checkout");
  }
  async function payNow() {
    if (!sel) return;
    setErr("");
    const region = oParts.region || dParts.region || "";
    const body = {
      action: "book", method: payMethod === "onfile" ? "card" : payMethod, use_saved_card: payMethod === "onfile",
      business: f.business, contact: f.contact, email: f.email, phone: f.phone,
      origin: f.origin, destination: f.destination, pallets: Number(f.pallets) || 1, weight: f.weight, dims: f.dims,
      accessorials: acc, note: f.note, lang, residential_end: resEnd,
      carrier: sel.name, amount_cents: Math.round(sel.price * 100), transit_days: sel.transit_days,
      service_id: sel.service_id, surcharge_cents: sel.residential_surcharge ? Math.round(sel.residential_surcharge * 100) : null,
      region, org_id: orgId,
    };
    setState("sending");
    try {
      const r = await fetch(BOOK_FN, { method: "POST", headers: anon, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({}));
      if (payMethod === "card" && r?.url) { window.location.href = r.url; return; }
      if (payMethod === "interac" && r?.ok) { setInteracInfo({ pay_ref: r.pay_ref, interac_to: r.interac_to, total_cents: r.total_cents }); setState("checkout"); return; }
      if ((payMethod === "onfile" || payMethod === "account") && r?.ok && r.tracking_number) { setBooked({ tracking: r.tracking_number, method: payMethod }); setState("booked"); return; }
      setErr(r?.error === "no_card" ? t("No card on file — choose Card to pay.", "Aucune carte enregistrée — choisissez Carte.") : (r?.detail || t("Couldn't start payment — please try again.", "Impossible de démarrer le paiement — réessayez.")));
      setState("checkout");
    } catch { setErr(t("Network error — please try again.", "Erreur réseau — réessayez.")); setState("checkout"); }
  }

  const palletOpts = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  const weightOpts = [
    { value: "Up to 250 lb / 115 kg", label: t("Up to 250 lb (115 kg)", "Jusqu'à 250 lb (115 kg)") },
    { value: "250–500 lb / 115–225 kg", label: "250–500 lb (115–225 kg)" },
    { value: "500–750 lb / 225–340 kg", label: "500–750 lb (225–340 kg)" },
    { value: "750–1000 lb / 340–450 kg", label: "750–1,000 lb (340–450 kg)" },
    { value: "1000–1500 lb / 450–680 kg", label: "1,000–1,500 lb (450–680 kg)" },
    { value: "Over 1500 lb / 680 kg+", label: t("Over 1,500 lb (680 kg+)", "Plus de 1 500 lb (680 kg+)") },
  ];
  const dimOpts = [
    { value: "48 × 40 × 48 in", label: t("48 × 40 × 48 in — standard pallet", "48 × 40 × 48 po — palette standard") },
    { value: "48 × 40 × 60 in", label: "48 × 40 × 60 in" },
    { value: "48 × 40 × 72 in", label: "48 × 40 × 72 in" },
    { value: "48 × 48 × 48 in", label: "48 × 48 × 48 in" },
    { value: "42 × 42 × 48 in", label: "42 × 42 × 48 in" },
  ];
  // ── Derived views over the live carrier tiers ──────────────────────────────
  const byPrice = [...tiers].sort((a, b) => a.price - b.price);
  const byFast = [...tiers].sort((a, b) => a.transit_days - b.transit_days || a.price - b.price);
  const cheapest = byPrice[0];
  const fastest = byFast[0];
  const transits = tiers.map((x) => x.transit_days).sort((a, b) => a - b);
  const medianTransit = transits.length ? transits[Math.floor(transits.length / 2)] : 99;
  const bestValue = byPrice.find((x) => x.transit_days <= medianTransit && x !== cheapest && x !== fastest)
    || byPrice.find((x) => x !== cheapest && x !== fastest);
  const heroes = [
    cheapest && { key: "cheap", label: t("Cheapest", "Le moins cher"), tier: cheapest },
    bestValue && { key: "value", label: t("Best value", "Meilleur rapport"), tier: bestValue },
    fastest && fastest !== cheapest ? { key: "fast", label: t("Fastest", "Le plus rapide"), tier: fastest } : null,
  ].filter(Boolean) as { key: string; label: string; tier: Tier }[];
  const ranked = [...tiers].sort((a, b) => sort === "cheapest" ? a.price - b.price : (a.transit_days - b.transit_days || a.price - b.price));
  const filtered = maxTransit ? ranked.filter((x) => x.transit_days <= maxTransit) : ranked;
  const groups = [
    { key: "exp", label: t("⚡ Express", "⚡ Express"), hint: t("1 day", "1 jour"), rows: filtered.filter((x) => x.transit_days <= 1) },
    { key: "std", label: t("🚚 Standard", "🚚 Standard"), hint: t("2–3 days", "2–3 jours"), rows: filtered.filter((x) => x.transit_days >= 2 && x.transit_days <= 3) },
    { key: "econ", label: t("🐢 Economy", "🐢 Économique"), hint: t("4+ days", "4+ jours"), rows: filtered.filter((x) => x.transit_days >= 4) },
  ];
  const surLine = (tr: Tier) => tr.residential_surcharge
    ? <> · <span className="sur">{t("incl. residential", "incl. résidentiel")} +${tr.residential_surcharge}</span></> : null;
  const rowJsx = (tr: Tier, i: number) => (
    <div key={tr.name} className="tier">
      <div className="rk2">{i + 1}</div>
      <div style={{ flex: 1 }}>
        <div className="tn">{tr.name}
          {tr === cheapest && <span className="badge b-cheap">{t("Cheapest", "Moins cher")}</span>}
          {tr === fastest && tr !== cheapest && <span className="badge b-fast">{t("Fastest", "Rapide")}</span>}
        </div>
        <div className="td">{tr.transit_days} {t("business day(s)", "jour(s) ouvrable(s)")}{surLine(tr)}</div>
      </div>
      <div className="tp">${tr.price} <small>CAD</small></div>
      <button className="go tbtn" onClick={() => accept(tr)}>{t("Book", "Réserver")}</button>
    </div>
  );
  const reLabel = (re: ResEnd) => re === "pickup" ? t("Pickup", "Ramassage") : re === "delivery" ? t("Delivery", "Livraison") : t("Both", "Les deux");

  return (
    <div className="fp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="fp-top">
        <div className="brand"><div className="lg">Ko</div>Kolis <span className="biz">· Business</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/freight/track" style={{ color: "#6B6675", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>{t("Track a shipment", "Suivre un envoi")} →</a>
          <LangToggle />
        </div>
      </div>
      <div className="fp-wrap">
        {state === "quote" ? (
          <>
            <span className="pill">● {t("Your Kolis price", "Votre prix Kolis")}</span>
            <h1>{f.origin.split(",")[0]} → {f.destination.split(",")[0]}</h1>
            <p className="sub">{t("All-in Kolis price — billed to your monthly account.", "Prix Kolis tout compris — facturé sur votre compte mensuel.")}</p>
            <div className="card">
              <div className="qhead">
                <span className="sub2">{tiers.length} {t("carriers compared", "transporteurs comparés")}</span>
                <div className="vswitch">
                  <button className={view === "shortlist" ? "on" : ""} onClick={() => chooseView("shortlist")}><LayoutGrid size={14} style={IC} />{t("Shortlist", "Sélection")}</button>
                  <button className={view === "list" ? "on" : ""} onClick={() => chooseView("list")}><List size={14} style={IC} />{t("List", "Liste")}</button>
                  <button className={view === "grouped" ? "on" : ""} onClick={() => chooseView("grouped")}><Rows3 size={14} style={IC} />{t("Grouped", "Groupé")}</button>
                </div>
              </div>

              {acc.includes("residential") && (
                <div className="accbar2">
                  <b>{t("Residential at", "Résidentiel à")}:</b>
                  <div className="seg2">
                    {(["pickup", "delivery", "both"] as ResEnd[]).map((re) => (
                      <span key={re} className={resEnd === re ? "on" : ""} onClick={() => chooseResEnd(re)}>{reLabel(re)}</span>
                    ))}
                  </div>
                  <button className="reapply" onClick={() => runQuote()}>↻ {t("Re-quote", "Re-devis")}</button>
                </div>
              )}

              {view !== "shortlist" && (
                <div className="custrow2">
                  <label>{t("Sort", "Trier")}</label>
                  <select value={sort} onChange={(e) => chooseSort(e.target.value as Sort)}>
                    <option value="cheapest">{t("Cheapest first", "Moins cher d'abord")}</option>
                    <option value="fastest">{t("Fastest first", "Plus rapide d'abord")}</option>
                  </select>
                  <label>{t("Max transit", "Transit max")}</label>
                  <select value={String(maxTransit)} onChange={(e) => setMaxTransit(Number(e.target.value))}>
                    <option value="0">{t("Any", "Tous")}</option>
                    <option value="1">≤ 1</option><option value="2">≤ 2</option><option value="3">≤ 3</option>
                  </select>
                  <span className="cnt">{filtered.length}/{tiers.length}</span>
                </div>
              )}

              {view === "shortlist" ? (
                <>
                  <div className="heroes">
                    {heroes.map((h) => (
                      <div key={h.key} className={"hero" + (h.key === "cheap" ? " pick" : "")}>
                        <div className="cap">{h.label}</div>
                        <div className="hn">{h.tier.name}</div>
                        <div className="hp">${h.tier.price}</div>
                        <div className="ht">{h.tier.transit_days} {t("business day(s)", "jour(s) ouvrable(s)")}{h.tier.residential_surcharge ? <><br /><span className="sur">{t("incl. residential", "incl. résidentiel")} +${h.tier.residential_surcharge}</span></> : null}</div>
                        <button className="hbk" onClick={() => accept(h.tier)}>{t("Book", "Réserver")}</button>
                      </div>
                    ))}
                  </div>
                  {!showAll ? (
                    tiers.length > heroes.length && <div className="expand" onClick={() => setShowAll(true)}>{t("Show all", "Voir les")} {tiers.length} {t("carriers", "transporteurs")} ▾</div>
                  ) : (
                    <div className="alllist">
                      {ranked.map((tr, i) => rowJsx(tr, i))}
                      <div className="expand" onClick={() => setShowAll(false)}>{t("Show less", "Réduire")} ▴</div>
                    </div>
                  )}
                </>
              ) : view === "list" ? (
                <div className="alllist">
                  {filtered.length ? filtered.map((tr, i) => rowJsx(tr, i)) : <div className="empty2">{t("No carriers match — widen the filter.", "Aucun transporteur — élargissez le filtre.")}</div>}
                </div>
              ) : (
                <div className="alllist">
                  {groups.some((g) => g.rows.length) ? groups.map((g) => g.rows.length ? (
                    <div key={g.key}>
                      <div className="ghead"><span>{g.label}</span><span className="gt">{g.hint}</span><span className="gline" /></div>
                      {g.rows.map((tr, i) => rowJsx(tr, i))}
                    </div>
                  ) : null) : <div className="empty2">{t("No carriers match — widen the filter.", "Aucun transporteur — élargissez le filtre.")}</div>}
                </div>
              )}

              <div className="fine" style={{ textAlign: "left", marginTop: 10 }}>⚠ {t("Estimate — subject to carrier reweigh & inspection.", "Estimation — sujette à la repesée et à l'inspection du transporteur.")}</div>
              <button className="go" style={{ background: "#fff", color: "#6B6675", border: "1.5px solid #ECECF2", marginTop: 12 }} onClick={() => setState("form")}>← {t("Edit shipment", "Modifier l'envoi")}</button>
            </div>
          </>
        ) : state === "checkout" && sel ? (
          <>
            <span className="pill">● {t("Confirm & pay", "Confirmer & payer")}</span>
            <h1>{f.origin.split(",")[0]} → {f.destination.split(",")[0]}</h1>
            <p className="sub">{f.pallets} {t("pallet(s)", "palette(s)")} · {sel.name} · {sel.transit_days} {t("business day(s)", "jour(s) ouvrable(s)")}</p>
            <div className="card">
              <div className="selrow">
                <div style={{ flex: 1 }}><div className="tn">{sel.name}</div><div className="td">{sel.transit_days} {t("business day(s)", "jour(s) ouvrable(s)")}</div></div>
                <div className="tp">${sel.price} <small>CAD</small></div>
                <span className="chg" onClick={() => setState("quote")}>{t("Change", "Changer")}</span>
              </div>
              {(() => {
                const rate = taxRateOf(oParts.region || dParts.region);
                const taxD = sel.price * rate, totalD = sel.price + taxD;
                return (
                  <div className="brk">
                    <div className="bl"><span>{t("Shipment (all-in carrier price)", "Envoi (prix transporteur tout compris)")}</span><b>${m2(sel.price)}</b></div>
                    {sel.residential_surcharge ? <div className="bl"><span>{t("Residential surcharge (incl.)", "Supplément résidentiel (incl.)")}</span><b className="sur">+${sel.residential_surcharge}</b></div> : null}
                    <div className="bl"><span>{t("Tax", "Taxe")} ({Math.round(rate * 10000) / 100}%)</span><b>${m2(taxD)}</b></div>
                    <div className="bl tot"><span>{t("Total due now", "Total à payer")}</span><b>${m2(totalD)} CAD</b></div>
                  </div>
                );
              })()}
              <div className="methods2">
                <div className={"m2" + (payMethod === "card" ? " on" : "")} onClick={() => { setPayMethod("card"); setInteracInfo(null); }}><CreditCard size={15} style={IC} />{t("Card", "Carte")}</div>
                {orgId && <div className={"m2" + (payMethod === "onfile" ? " on" : "")} onClick={() => { setPayMethod("onfile"); setInteracInfo(null); }}><Wallet size={15} style={IC} />{t("Saved card", "Carte enreg.")}</div>}
                <div className={"m2" + (payMethod === "interac" ? " on" : "")} onClick={() => { setPayMethod("interac"); setInteracInfo(null); }}><Landmark size={15} style={IC} />Interac</div>
                {orgId && <div className={"m2" + (payMethod === "account" ? " on" : "")} onClick={() => { setPayMethod("account"); setInteracInfo(null); }}><CalendarDays size={15} style={IC} />{t("Account", "Compte")}</div>}
              </div>
              {interacInfo ? (
                <div className="interac2">{t("Send an Interac e-Transfer of", "Envoyez un virement Interac de")} <b>${m2(interacInfo.total_cents / 100)}</b> {t("to", "à")} <span className="mono">{interacInfo.interac_to}</span> {t("with reference", "avec la référence")} <span className="mono">{interacInfo.pay_ref}</span>. {t("Your shipment books automatically once it clears.", "Votre envoi est réservé automatiquement une fois le paiement reçu.")}</div>
              ) : (
                <>
                  <p className="mhint">
                    {payMethod === "card" && t("You'll go to our secure Stripe checkout. Your card is authorized now and charged when the carrier picks up.", "Vous serez redirigé vers le paiement sécurisé Stripe. Votre carte est autorisée maintenant et débitée au ramassage.")}
                    {payMethod === "onfile" && t("We'll authorize your saved card now and charge it on pickup.", "Nous autorisons votre carte enregistrée maintenant et la débitons au ramassage.")}
                    {payMethod === "interac" && t("We'll show Interac e-Transfer instructions to complete the booking.", "Nous afficherons les instructions de virement Interac pour finaliser.")}
                    {payMethod === "account" && t("Billed to your monthly Kolis account.", "Facturé sur votre compte mensuel Kolis.")}
                  </p>
                  {err && <div className="err">{err}</div>}
                  <button className="go" onClick={payNow}>
                    {payMethod === "card" && t("Pay & book →", "Payer & réserver →")}
                    {payMethod === "onfile" && t("Authorize & book →", "Autoriser & réserver →")}
                    {payMethod === "interac" && t("Get Interac instructions →", "Obtenir les instructions Interac →")}
                    {payMethod === "account" && t("Book on account →", "Réserver sur compte →")}
                  </button>
                </>
              )}
              <div className="fine" style={{ textAlign: "left", marginTop: 10 }}><Lock size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />{t("Secured by Stripe · confirmation emailed now, receipt when picked up.", "Sécurisé par Stripe · confirmation maintenant, reçu au ramassage.")}</div>
              <button className="go" style={{ background: "#fff", color: "#6B6675", border: "1.5px solid #ECECF2", marginTop: 12 }} onClick={() => setState("quote")}>← {t("Back to quotes", "Retour aux prix")}</button>
            </div>
          </>
        ) : state === "booked" ? (
          <div className="card ok">
            <div className="ic">✓</div>
            <h1>{t("Shipment booked!", "Envoi réservé !")}</h1>
            <p>{booked?.method === "account"
              ? t("Invoiced to your monthly account — we've emailed your invoice. Your Bill of Lading / label follows once dispatched.", "Facturé sur votre compte mensuel — facture envoyée. Le connaissement / l'étiquette suit après la répartition.")
              : t("Booking confirmed — your card is authorized and charged only when the carrier picks up. Confirmation emailed; your receipt follows on pickup.", "Réservation confirmée — votre carte est autorisée et débitée seulement au ramassage. Confirmation envoyée ; le reçu suit au ramassage.")}</p>
            {booked?.tracking && <div className="trk2">{t("Tracking", "Suivi")} · {booked.tracking}</div>}
            <button className="go" style={{ marginTop: 18 }} onClick={() => { setState("form"); setSel(null); setBooked(null); }}>{t("Book another shipment", "Réserver un autre envoi")}</button>
          </div>
        ) : state === "done" ? (
          <div className="card ok">
            <div className="ic">✓</div>
            <h1>{t("Request received!", "Demande reçue !")}</h1>
            <p>{t("Our team will price it with the best carrier and send you a Kolis quote within one business day.", "Notre équipe trouvera le meilleur tarif et vous enverra un prix Kolis en un jour ouvrable.")}</p>
          </div>
        ) : (
          <>
            <span className="pill">● {t("Freight & pallets", "Fret & palettes")}</span>
            <h1>{t("Ship a pallet — get a Kolis quote", "Expédiez une palette — recevez un prix Kolis")}</h1>
            <p className="sub">{t("One all-in Kolis price — we compare the carriers for you. Billed to your monthly account.", "Un seul prix Kolis, tout compris — nous comparons les transporteurs pour vous. Facturé sur votre compte mensuel.")}</p>
            <form className="card" onSubmit={submit}>
              <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
              <div className="rw">
                <div className="fld"><label>{t("Business", "Entreprise")}</label><input className="inp" value={f.business} onChange={set("business")} placeholder={t("Business name", "Nom de l'entreprise")} /></div>
                <div className="fld"><label>{t("Contact name", "Nom du contact")} <span>*</span></label><input className="inp" value={f.contact} onChange={set("contact")} /></div>
              </div>
              <div className="rw">
                <div className="fld"><label>{t("Phone", "Téléphone")} <span>*</span></label><input className="inp" value={f.phone} onChange={set("phone")} placeholder="(613) 000-0000" /></div>
                <div className="fld"><label>Email</label><input className="inp" value={f.email} onChange={set("email")} placeholder="you@business.ca" /></div>
              </div>
              <div className="rw">
                <div className="fld"><label>{t("Pickup address / Origin", "Adresse de ramassage / Origine")} <span>*</span></label><AddressInput className="inp" value={f.origin} onChange={(v) => setF((p) => ({ ...p, origin: v }))} onPlace={(p) => setOParts({ postal: p.postal, city: p.city, region: p.region, country: p.country, line1: p.line1 })} placeholder={t("Start typing the address…", "Commencez à taper l'adresse…")} /></div>
                <div className="fld"><label>{t("Delivery address / Destination", "Adresse de livraison / Destination")} <span>*</span></label><AddressInput className="inp" value={f.destination} onChange={(v) => setF((p) => ({ ...p, destination: v }))} onPlace={(p) => setDParts({ postal: p.postal, city: p.city, region: p.region, country: p.country, line1: p.line1 })} placeholder={t("Start typing the address…", "Commencez à taper l'adresse…")} /></div>
              </div>
              <div className="rw">
                <div className="fld sm"><label>{t("Pallets", "Palettes")}</label><SelectOrCustom className="inp" value={f.pallets} onChange={(v) => setF((p) => ({ ...p, pallets: v }))} options={palletOpts} /></div>
                <div className="fld"><label>{t("Weight (per pallet)", "Poids (par palette)")}</label><SelectOrCustom className="inp" value={f.weight} onChange={(v) => setF((p) => ({ ...p, weight: v }))} options={weightOpts} placeholder={t("Select weight…", "Choisir le poids…")} /></div>
                <div className="fld"><label>{t("Dimensions (L×W×H)", "Dimensions (L×l×H)")}</label><SelectOrCustom className="inp" value={f.dims} onChange={(v) => setF((p) => ({ ...p, dims: v }))} options={dimOpts} placeholder={t("Select size…", "Choisir la taille…")} /></div>
              </div>
              <label>{t("Additional services", "Services additionnels")}</label>
              <div className="seg">{ACC.map((a) => <span key={a.k} className={"chk" + (acc.includes(a.k) ? " on" : "")} onClick={() => toggle(a.k)}>{lang === "fr" ? a.fr : a.en}</span>)}</div>
              <div className="fld" style={{ marginTop: 12 }}><label>{t("Anything else?", "Autre chose ?")}</label><textarea className="inp" value={f.note} onChange={set("note")} placeholder={t("Optional — dock/curbside, commodity, deadline…", "Facultatif — quai/rue, marchandise, échéance…")} /></div>
              {err && <div className="err">{err}</div>}
              <button className="go" disabled={state === "sending"}>{state === "sending" ? t("Sending…", "Envoi…") : t("Request my Kolis quote →", "Obtenir mon prix Kolis →")}</button>
              <div className="fine">{t("We reply with one all-in price within a business day. No obligation.", "Nous répondons avec un prix tout compris en un jour ouvrable. Sans obligation.")}</div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.fp{min-height:100vh;background:#F1F0F4;color:#1a1722;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
.fp-top{background:#fff;border-bottom:1px solid #ECECF2;display:flex;align-items:center;justify-content:space-between;padding:14px 24px}
.fp .brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:18px}
.fp .lg{width:34px;height:34px;border-radius:10px;background:#E11D6B;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.fp .biz{color:#E11D6B}
.fp-wrap{max-width:680px;margin:0 auto;padding:26px 20px 60px}
.fp .pill{display:inline-block;background:#FBF3F7;color:#b3145e;font-weight:700;font-size:12px;padding:6px 12px;border-radius:99px}
.fp h1{font-size:26px;margin:12px 0 4px;letter-spacing:-.4px}
.fp .sub{color:#6B6675;font-size:15px;margin-bottom:20px}
.fp .card{background:#fff;border:1px solid #ECECF2;border-radius:16px;padding:20px 22px}
.fp .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.fp .rw{display:flex;gap:12px}.fp .rw .fld{flex:1}.fp .rw .fld.sm{flex:.5}
.fp .fld{margin-bottom:12px}
.fp label{display:block;font-size:11.5px;font-weight:700;color:#6B6675;margin-bottom:5px}
.fp label span{color:#E11D6B}
.fp .inp{width:100%;border:1.5px solid #ECECF2;border-radius:10px;padding:10px 12px;font-size:14px;color:#1a1722;background:#fff;font-family:inherit}
.fp .inp:focus{outline:none;border-color:#E11D6B}
.fp textarea.inp{resize:none;height:60px}
.fp .seg{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px}
.fp .chk{border:1.5px solid #ECECF2;border-radius:10px;padding:9px 13px;font-size:13px;font-weight:600;color:#6B6675;cursor:pointer}
.fp .chk.on{border-color:#E11D6B;background:#FBF3F7;color:#b3145e}
.fp .chk.on::before{content:"✓ ";font-weight:800}
.fp .go{width:100%;background:#E11D6B;color:#fff;font-weight:800;border:none;border-radius:12px;padding:14px;font-size:15px;margin-top:14px;cursor:pointer}
.fp .go:disabled{opacity:.6}
.fp .err{background:#fdecf3;color:#9c1048;border:1px solid #f3cfe0;border-radius:9px;padding:9px 12px;font-size:13px;margin-top:12px}
.fp .fine{text-align:center;font-size:11.5px;color:#9b97a6;margin-top:10px}
.fp .ok{text-align:center;padding:40px 24px}
.fp .ok .ic{width:64px;height:64px;border-radius:50%;background:#eafaf5;border:2px solid #178a5e;color:#178a5e;font-size:32px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.fp .ok p{color:#6B6675;max-width:340px;margin:8px auto 0;line-height:1.55}
.fp .tier{display:flex;align-items:center;gap:14px;border:1.5px solid #ECECF2;border-radius:13px;padding:14px 16px;margin-bottom:10px}
.fp .tier .tn{font-weight:800;font-size:15px}.fp .tier .td{color:#6B6675;font-size:12px;margin-top:2px}
.fp .tier .tp{font-size:22px;font-weight:900;margin-left:auto}.fp .tier .tp small{font-size:12px;color:#6B6675;font-weight:600}
.fp .tbtn{width:auto;padding:10px 20px;margin:0}
.fp .tier .rk2{width:20px;color:#b6b2bf;font-weight:800;font-size:13px;text-align:center;margin-right:2px}
.fp .qhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.fp .sub2{color:#6B6675;font-size:12.5px;font-weight:600}
.fp .vswitch{margin-left:auto;display:inline-flex;border:1.5px solid #ECECF2;border-radius:10px;overflow:hidden}
.fp .vswitch button{border:none;background:#fff;color:#6B6675;font-weight:700;font-size:12px;padding:7px 11px;cursor:pointer;border-left:1px solid #ECECF2}
.fp .vswitch button:first-child{border-left:none}
.fp .vswitch button.on{background:#E11D6B;color:#fff}
.fp .accbar2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#faf7fb;border:1px solid #f0e6ee;border-radius:12px;padding:9px 12px;margin-bottom:12px;font-size:12.5px}
.fp .seg2{display:inline-flex;border:1.5px solid #ECECF2;border-radius:9px;overflow:hidden}
.fp .seg2 span{padding:6px 11px;font-size:12px;font-weight:700;color:#6B6675;cursor:pointer;background:#fff;border-left:1px solid #ECECF2}
.fp .seg2 span:first-child{border-left:none}
.fp .seg2 span.on{background:#E11D6B;color:#fff}
.fp .reapply{margin-left:auto;background:#fff;border:1.5px solid #E11D6B;color:#b3145e;font-weight:800;font-size:12px;border-radius:9px;padding:6px 12px;cursor:pointer}
.fp .custrow2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:12px;color:#6B6675}
.fp .custrow2 label{margin:0;font-size:11.5px}
.fp .custrow2 select{border:1.5px solid #ECECF2;border-radius:8px;padding:6px 9px;font-size:12px;font-weight:700;color:#1a1722;background:#fff;font-family:inherit}
.fp .custrow2 .cnt{margin-left:auto;font-weight:700}
.fp .heroes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}
.fp .hero{border:2px solid #ECECF2;border-radius:14px;padding:12px;text-align:center}
.fp .hero.pick{border-color:#E11D6B}
.fp .hero .cap{font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6B6675}
.fp .hero.pick .cap{color:#b3145e}
.fp .hero .hn{font-weight:800;font-size:13.5px;margin:6px 0 2px}
.fp .hero .hp{font-size:20px;font-weight:900}
.fp .hero .ht{font-size:11px;color:#6B6675;margin-top:2px;min-height:14px}
.fp .hero .hbk{margin-top:8px;width:100%;background:#E11D6B;color:#fff;border:none;border-radius:9px;padding:8px;font-weight:800;font-size:12.5px;cursor:pointer}
.fp .expand{margin-top:4px;text-align:center;color:#b3145e;font-weight:800;font-size:13px;cursor:pointer;padding:9px;border:1.5px dashed #e6d5e0;border-radius:10px}
.fp .alllist{margin-top:2px}
.fp .sur{color:#b3145e;font-weight:700}
.fp .badge{display:inline-block;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:6px;vertical-align:middle}
.fp .b-cheap{background:#eafaf3;color:#127a52}
.fp .b-fast{background:#eef3fe;color:#2b5fd0}
.fp .ghead{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:#1a1722;margin:12px 2px 6px}
.fp .ghead .gt{color:#6B6675;font-weight:600;font-size:11.5px}
.fp .ghead .gline{height:1px;background:#ECECF2;flex:1;margin-left:4px}
.fp .empty2{color:#6B6675;font-size:13px;text-align:center;padding:18px}
.fp .selrow{display:flex;align-items:center;gap:12px;border:1.5px solid #E11D6B;background:#FBF3F7;border-radius:12px;padding:12px 14px;margin-bottom:14px}
.fp .selrow .chg{font-size:11.5px;color:#b3145e;font-weight:800;cursor:pointer;margin-left:6px}
.fp .brk{margin-bottom:14px}
.fp .bl{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;color:#6B6675}
.fp .bl b{color:#1a1722;font-weight:700}
.fp .bl.tot{border-top:1px solid #ECECF2;margin-top:6px;padding-top:10px;font-size:15px}
.fp .bl.tot b{font-size:18px;font-weight:900}
.fp .methods2{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.fp .m2{flex:1;min-width:90px;border:1.5px solid #ECECF2;border-radius:12px;padding:11px;text-align:center;font-weight:800;font-size:13px;color:#6B6675;cursor:pointer}
.fp .m2.on{border-color:#E11D6B;background:#FBF3F7;color:#b3145e}
.fp .mhint{font-size:12.5px;color:#6B6675;line-height:1.5;margin:0 0 6px}
.fp .interac2{background:#fffdf5;border:1px solid #f2ead0;border-radius:10px;padding:12px;font-size:13px;color:#6b5d32;line-height:1.55}
.fp .interac2 b{color:#1a1722}
.fp .mono{font-family:ui-monospace,Menlo,monospace;background:#fff;border:1px dashed #d8cfa8;border-radius:7px;padding:2px 7px;font-weight:800;color:#1a1722}
.fp .trk2{display:inline-block;margin-top:12px;background:#FBF3F7;color:#b3145e;font-weight:800;border-radius:99px;padding:8px 16px;font-size:14px}
@media(max-width:640px){ .fp .rw{flex-direction:column;gap:0} .fp .tier{flex-wrap:wrap} .fp .tier .tp{margin-left:0} .fp .tbtn{width:100%} .fp .heroes{grid-template-columns:1fr} }
`;
