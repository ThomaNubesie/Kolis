"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

export default function CreateShipment() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const router = useRouter();
  const [f, setF] = useState({
    p_dropoff_type: "door", p_size: "small", p_from_city: "Ottawa", p_to_city: "",
    p_recipient_name: "", p_recipient_phone: "", p_recipient_email: "", p_dropoff_addr: "", p_contents: "",
    p_recipient_lang: "en",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; payg?: boolean; charged?: number; needCard?: boolean } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  // Default the recipient's notification language to the sender's current language.
  useEffect(() => { setF((s) => ({ ...s, p_recipient_lang: lang })); }, [lang]);

  const submit = async () => {
    if (!f.p_to_city.trim()) { setErr(t("Destination city is required.", "La ville de destination est requise.")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.p_recipient_email.trim())) { setErr(t("A valid recipient email is required — we use it to notify them about the shipment.", "Un courriel valide du destinataire est requis — il sert à l’informer de l’envoi.")); return; }
    setBusy(true); setErr("");
    try {
      const res = await org.createShipment(active.org_id, f);
      // Pay-as-you-go: charge the org's saved card now. If none on file, the shipment
      // is created but unpaid — prompt to add a card.
      if (res.payg) {
        if (!res.has_card) { setDone({ code: res.code, payg: true, needCard: true }); }
        else {
          const c = await org.chargeShipment(active.org_id, res.id);
          if (c?.error === "no_card") setDone({ code: res.code, payg: true, needCard: true });
          else if (c?.error) { setDone({ code: res.code, payg: true }); setErr(t("Shipment created, but the card charge failed: ", "Envoi créé, mais le débit de la carte a échoué : ") + (c.detail || c.error)); }
          else setDone({ code: res.code, payg: true, charged: c?.charged_cents });
        }
      } else setDone({ code: res.code });
    } catch (e: any) { setErr(e?.message || t("Failed to create shipment.", "Échec de la création de l’envoi.")); }
    setBusy(false);
  };

  const addCard = async () => {
    setBusy(true); setErr("");
    try {
      const r = await org.setupCard(active.org_id);
      if (r?.url) window.location.href = r.url;
      else setErr(r?.skipped || r?.error || t("Card setup isn't available yet.", "L’ajout de carte n’est pas encore disponible."));
    } catch (e: any) { setErr(e?.message || t("Couldn't open card setup.", "Impossible d’ouvrir l’ajout de carte.")); }
    setBusy(false);
  };

  if (done) return (
    <>
      <h1>{t("Shipment created", "Envoi créé")}</h1>
      <div className="card" style={{ maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>✓ {done.code}</div>
        <div className="sub" style={{ marginTop: 6 }}>
          {done.needCard
            ? t(`Created — but no card is on file yet. Add a card to pay for this shipment (and future ones).`, `Créé — mais aucune carte n’est enregistrée. Ajoutez une carte pour payer cet envoi (et les suivants).`)
            : done.charged != null
              ? t(`Paid $${(done.charged / 100).toFixed(2)} to the card on file.`, `Payé ${(done.charged / 100).toFixed(2)} $ sur la carte enregistrée.`)
              : done.payg
                ? t(`Charged to the card on file.`, `Débité sur la carte enregistrée.`)
                : t(`Added to ${active.name}’s invoice cycle (net terms).`, `Ajouté au cycle de facturation de ${active.name} (conditions nettes).`)}
        </div>
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        <div className="row" style={{ marginTop: 12 }}>
          {done.needCard
            ? <button className="btn" disabled={busy} onClick={addCard}>{busy ? t("Opening…", "Ouverture…") : t("Add a card", "Ajouter une carte")}</button>
            : <button className="btn" onClick={() => { setDone(null); setErr(""); set("p_to_city", ""); set("p_recipient_name", ""); }}>{t("Create another", "En créer un autre")}</button>}
          <button className="btn ghost" onClick={() => router.push("/shipper/shipments")}>{t("View shipments", "Voir les envois")}</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <h1>{t("New shipment", "Nouvel envoi")}</h1>
      <div className="sub">{t(`Billed to ${active.name}.`, `Facturé à ${active.name}.`)}</div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="row" style={{ gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p className="mono">{t("Pickup type", "Type de ramassage")}</p>
            <select className="input" value={f.p_dropoff_type} onChange={(e) => set("p_dropoff_type", e.target.value)}>
              <option value="door">{t("Door pickup", "Ramassage à domicile")}</option><option value="hub">{t("Drop at hub", "Dépôt au point relais")}</option><option value="zone">{t("LoadQ zone", "Zone LoadQ")}</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <p className="mono">{t("Size", "Taille")}</p>
            <select className="input" value={f.p_size} onChange={(e) => set("p_size", e.target.value)}>
              <option value="envelope">{t("Envelope (≤1kg)", "Enveloppe (≤1 kg)")}</option><option value="small">{t("Small (≤5kg)", "Petit (≤5 kg)")}</option><option value="large">{t("Large (≤20kg)", "Grand (≤20 kg)")}</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ gap: 16, marginTop: 12 }}>
          <div style={{ flex: 1 }}><p className="mono">{t("From city", "Ville de départ")}</p><input className="input" value={f.p_from_city} onChange={(e) => set("p_from_city", e.target.value)} /></div>
          <div style={{ flex: 1 }}><p className="mono">{t("To city", "Ville de destination")}</p><input className="input" value={f.p_to_city} onChange={(e) => set("p_to_city", e.target.value)} placeholder="Montréal" /></div>
        </div>
        <p className="mono" style={{ marginTop: 12 }}>{t("Recipient", "Destinataire")}</p>
        <input className="input" value={f.p_recipient_name} onChange={(e) => set("p_recipient_name", e.target.value)} placeholder={t("Name", "Nom")} />
        <div className="row" style={{ gap: 16, marginTop: 12 }}>
          <div style={{ flex: 1 }}><p className="mono">{t("Recipient email *", "Courriel du destinataire *")}</p><input className="input" type="email" value={f.p_recipient_email} onChange={(e) => set("p_recipient_email", e.target.value)} placeholder="name@email.com" /></div>
          <div style={{ flex: 1 }}><p className="mono">{t("Recipient phone", "Téléphone du destinataire")}</p><input className="input" value={f.p_recipient_phone} onChange={(e) => set("p_recipient_phone", e.target.value)} placeholder="(514) 555-0148" /></div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
          <span className="mono">{t("Notify recipient in", "Informer le destinataire en")}</span>
          {["en", "fr"].map((l) => (
            <button key={l} className={"chip" + (f.p_recipient_lang === l ? " on" : "")} onClick={() => set("p_recipient_lang", l)}>{l.toUpperCase()}</button>
          ))}
        </div>
        <p className="sub" style={{ fontSize: 11.5, marginTop: 4 }}>{t("We email & text the recipient (in this language) when the shipment is created and as it progresses. They can switch language on the tracking page.", "Nous informons le destinataire par courriel et texto (dans cette langue) à la création et à chaque étape. Il peut changer de langue sur la page de suivi.")}</p>
        <p className="mono" style={{ marginTop: 12 }}>{t("Delivery address", "Adresse de livraison")}</p>
        <input className="input" value={f.p_dropoff_addr} onChange={(e) => set("p_dropoff_addr", e.target.value)} placeholder={t("Street, unit, postal code", "Rue, unité, code postal")} />
        <p className="mono" style={{ marginTop: 12 }}>{t("Contents", "Contenu")}</p>
        <input className="input" value={f.p_contents} onChange={(e) => set("p_contents", e.target.value)} placeholder={t("What's inside", "Ce qu’il y a à l’intérieur")} />
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>{busy ? t("Creating…", "Création…") : t("Create shipment", "Créer l’envoi")}</button>
      </div>
    </>
  );
}
