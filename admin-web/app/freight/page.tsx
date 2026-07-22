"use client";
import { useEffect, useState } from "react";
import { useLang, LangToggle } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import AddressInput from "@/components/AddressInput";
import SelectOrCustom from "@/components/SelectOrCustom";

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
type Parts = { postal?: string; city?: string; region?: string; country?: string; line1?: string };
type Tier = { name: string; price: number; transit_days: number };
// pull the heaviest lb figure + the three dimension numbers out of the picker text
const lbOf = (s: string) => { const m = [...(s || "").matchAll(/(\d[\d,]*)\s*lb/gi)].map((x) => parseInt(x[1].replace(/,/g, ""))); return m.length ? Math.max(...m) : (parseInt((s || "").replace(/\D/g, "")) || 0); };
const dimsOf = (s: string) => { const n = (s || "").match(/\d+/g)?.map(Number) || []; return { l: n[0] || 48, w: n[1] || 40, h: n[2] || 48 }; };

export default function Freight() {
  const { t, lang } = useLang();
  const [state, setState] = useState<"form" | "sending" | "quote" | "done">("form");
  const [err, setErr] = useState("");
  const [acc, setAcc] = useState<string[]>(["liftgate"]);
  const [f, setF] = useState({ business: "", contact: "", phone: "", email: "", origin: "", destination: "", pallets: "1", weight: "", dims: "", note: "", website: "" });
  const [oParts, setOParts] = useState<Parts>({});
  const [dParts, setDParts] = useState<Parts>({});
  const [tiers, setTiers] = useState<Tier[]>([]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (k: string) => setAcc(acc.includes(k) ? acc.filter((x) => x !== k) : [...acc, k]);

  // Prefill merchant details when a signed-in business opens the form.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: { user } } = await supabase.auth.getUser();
      let biz = "";
      try { const { data: orgs } = await supabase.rpc("kolis_my_orgs"); if (Array.isArray(orgs) && orgs[0]?.name) biz = orgs[0].name; } catch { /* ignore */ }
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

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.origin.trim() || !f.destination.trim()) { setErr(t("Origin and destination are required.", "L'origine et la destination sont requises.")); return; }
    if (!f.contact.trim() || !f.phone.trim()) { setErr(t("Name and phone are required.", "Le nom et le téléphone sont requis.")); return; }
    setState("sending");
    try {
      // 1) try a live Freightcom rate (needs postal codes from the address picker)
      const rate = await fetch(RATE_FN, { method: "POST", headers: anon, body: JSON.stringify({
        origin: { ...oParts, name: f.business }, destination: dParts,
        pallets: Number(f.pallets) || 1, weight_lb: lbOf(f.weight), ...dimsOf(f.dims),
      }) }).then((r) => r.json()).catch(() => ({ concierge: true }));

      if (rate?.ok && Array.isArray(rate.tiers) && rate.tiers.length) {
        setTiers(rate.tiers); setState("quote"); return;   // live price populated
      }
      // 2) fall back to concierge (no aggregator key, or missing postal, or API down)
      if (await sendConcierge()) { setState("done"); return; }
      setErr(t("Couldn't send — please call (613) 862-2639.", "Envoi impossible — appelez le (613) 862-2639.")); setState("form");
    } catch { setErr(t("Network error — please call (613) 862-2639.", "Erreur réseau — appelez le (613) 862-2639.")); setState("form"); }
  }

  async function accept(tier: Tier) {
    setState("sending");
    try { await sendConcierge(tier); setState("done"); }
    catch { setState("done"); }
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
              {tiers.map((tr) => (
                <div key={tr.name} className="tier">
                  <div><div className="tn">{tr.name}</div><div className="td">{tr.transit_days} {t("business day(s)", "jour(s) ouvrable(s)")}</div></div>
                  <div className="tp">${tr.price} <small>CAD</small></div>
                  <button className="go tbtn" onClick={() => accept(tr)}>{t("Book", "Réserver")}</button>
                </div>
              ))}
              <div className="fine" style={{ textAlign: "left", marginTop: 10 }}>⚠ {t("Estimate — subject to carrier reweigh & inspection.", "Estimation — sujette à la repesée et à l'inspection du transporteur.")}</div>
              <button className="go" style={{ background: "#fff", color: "#6B6675", border: "1.5px solid #ECECF2", marginTop: 12 }} onClick={() => setState("form")}>← {t("Edit shipment", "Modifier l'envoi")}</button>
            </div>
          </>
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
@media(max-width:640px){ .fp .rw{flex-direction:column;gap:0} .fp .tier{flex-wrap:wrap} .fp .tier .tp{margin-left:0} .fp .tbtn{width:100%} }
`;
