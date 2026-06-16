"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

export default function CreateShipment() {
  const { active } = useOrg();
  const { t } = useLang();
  const router = useRouter();
  const [f, setF] = useState({
    p_dropoff_type: "door", p_size: "small", p_from_city: "Ottawa", p_to_city: "",
    p_recipient_name: "", p_recipient_phone: "", p_dropoff_addr: "", p_contents: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.p_to_city.trim()) { setErr(t("Destination city is required.", "La ville de destination est requise.")); return; }
    setBusy(true); setErr("");
    try {
      const res = await org.createShipment(active.org_id, f);
      setDone({ code: res.code });
    } catch (e: any) { setErr(e?.message || t("Failed to create shipment.", "Échec de la création de l’envoi.")); }
    setBusy(false);
  };

  if (done) return (
    <>
      <h1>{t("Shipment created", "Envoi créé")}</h1>
      <div className="card" style={{ maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>✓ {done.code}</div>
        <div className="sub" style={{ marginTop: 6 }}>{t(`Added to ${active.name}’s invoice cycle (net terms). No card charged per shipment.`, `Ajouté au cycle de facturation de ${active.name} (conditions nettes). Aucune carte n’est débitée par envoi.`)}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => { setDone(null); set("p_to_city", ""); set("p_recipient_name", ""); }}>{t("Create another", "En créer un autre")}</button>
          <button className="btn ghost" onClick={() => router.push("/shipper/shipments")}>{t("View shipments", "Voir les envois")}</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <h1>{t("New shipment", "Nouvel envoi")}</h1>
      <div className="sub">{t(`Billed to ${active.name} on invoice — no card charged per shipment.`, `Facturé à ${active.name} sur facture — aucune carte n’est débitée par envoi.`)}</div>
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
          <div style={{ flex: 1 }}><p className="mono">{t("Recipient phone", "Téléphone du destinataire")}</p><input className="input" value={f.p_recipient_phone} onChange={(e) => set("p_recipient_phone", e.target.value)} placeholder="(514) 555-0148" /></div>
        </div>
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
