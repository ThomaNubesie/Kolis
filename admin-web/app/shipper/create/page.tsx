"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { MapPin, Check } from "lucide-react";

export default function CreateShipment() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const router = useRouter();
  const [f, setF] = useState({
    p_dropoff_type: "door", p_size: "small", p_from_city: "Ottawa", p_to_city: "",
    p_recipient_name: "", p_recipient_phone: "", p_recipient_email: "", p_dropoff_addr: "", p_contents: "",
    p_recipient_lang: "en", p_pickup_addr: "",
  });
  const [busy, setBusy] = useState(false);
  const [saveClient, setSaveClient] = useState(false);
  const [done, setDone] = useState<{ code: string; payg?: boolean; charged?: number; needCard?: boolean; subtotal?: number; tax?: number; total?: number } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  // ── LoadQ zone pickup picker (city → zones with distance from me) ──
  const [zones, setZones] = useState<any[]>([]);
  const [zoneCity, setZoneCity] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState("");
  useEffect(() => { org.pickupZones().then((z) => setZones(z || [])).catch(() => setZones([])); }, []);
  const titleCity = (s: string) => (s || "").split(/[\s-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const zoneCities = Array.from(new Set(zones.map((z) => z.region).filter(Boolean))).sort();
  const km = (a: { lat: number; lng: number }, z: any) => {
    const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
    const dLat = toR(z.latitude - a.lat), dLng = toR(z.longitude - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(z.latitude)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };
  const cityZones = (() => { const l = zones.filter((z) => z.region === zoneCity); return myPos ? [...l].sort((a, b) => km(myPos, a) - km(myPos, b)) : l; })();
  const useMyLocation = () => {
    setGeoErr("");
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoErr(t("Location isn't available on this device.", "La localisation n’est pas disponible sur cet appareil.")); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoBusy(false); },
      () => { setGeoErr(t("Couldn’t get your location — allow location access to see distances.", "Localisation impossible — autorisez l’accès pour voir les distances.")); setGeoBusy(false); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };
  const selectZone = (z: any) => { setZoneId(z.id); setF((s) => ({ ...s, p_pickup_addr: `${z.name} · ${z.address || ""}`.trim(), p_from_city: titleCity(z.region) })); };
  const setPickupType = (v: string) => { setF((s) => ({ ...s, p_dropoff_type: v, ...(v === "zone" ? {} : { p_pickup_addr: "" }) })); if (v !== "zone") { setZoneId(""); setZoneCity(""); } };
  // Default the recipient's notification language to the sender's current language.
  useEffect(() => { setF((s) => ({ ...s, p_recipient_lang: lang })); }, [lang]);
  // Prefill when "resending" a past shipment (from a client's package history).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (![...sp.keys()].length) return;
    const g = (k: string) => sp.get(k);
    setF((s) => ({ ...s,
      p_recipient_name: g("name") ?? s.p_recipient_name, p_recipient_phone: g("phone") ?? s.p_recipient_phone,
      p_recipient_email: g("email") ?? s.p_recipient_email, p_to_city: g("city") ?? s.p_to_city,
      p_dropoff_addr: g("addr") ?? s.p_dropoff_addr, p_size: g("size") ?? s.p_size,
      p_dropoff_type: g("type") ?? s.p_dropoff_type, p_contents: g("contents") ?? s.p_contents,
    }));
  }, []);

  const submit = async () => {
    if (!f.p_to_city.trim()) { setErr(t("Destination city is required.", "La ville de destination est requise.")); return; }
    if (f.p_dropoff_type === "zone" && !zoneId) { setErr(t("Pick a LoadQ zone (choose a city, then a zone).", "Choisissez une zone LoadQ (choisissez une ville, puis une zone).")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.p_recipient_email.trim())) { setErr(t("A valid recipient email is required — we use it to notify them about the shipment.", "Un courriel valide du destinataire est requis — il sert à l’informer de l’envoi.")); return; }
    setBusy(true); setErr("");
    try {
      const res = await org.createShipment(active.org_id, f);
      // Optionally save this recipient to the org's client database.
      if (saveClient && f.p_recipient_name.trim()) {
        org.clientSave(active.org_id, { full_name: f.p_recipient_name, email: f.p_recipient_email, mobile: f.p_recipient_phone, address: f.p_dropoff_addr, city: f.p_to_city }).catch(() => {});
      }
      // Pay-as-you-go: charge the org's saved card now. If none on file, the shipment
      // is created but unpaid — prompt to add a card.
      if (res.payg) {
        if (!res.has_card) { setDone({ code: res.code, payg: true, needCard: true }); }
        else {
          const c = await org.chargeShipment(active.org_id, res.id);
          if (c?.error === "no_card") setDone({ code: res.code, payg: true, needCard: true });
          else if (c?.error) { setDone({ code: res.code, payg: true }); setErr(t("Shipment created, but the card charge failed: ", "Envoi créé, mais le débit de la carte a échoué : ") + (c.detail || c.error)); }
          else setDone({ code: res.code, payg: true, charged: c?.charged_cents, subtotal: c?.subtotal_cents, tax: c?.tax_cents, total: c?.total_cents });
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
        {done.total != null && (done.tax ?? 0) > 0 ? (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line,#eee)", paddingTop: 10, fontSize: 13 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="sub">{t("Subtotal", "Sous-total")}</span><span>${((done.subtotal ?? 0) / 100).toFixed(2)}</span></div>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="sub">{t("Tax", "Taxe")}</span><span>${((done.tax ?? 0) / 100).toFixed(2)}</span></div>
            <div className="row" style={{ justifyContent: "space-between", fontWeight: 800, marginTop: 3 }}><span>{t("Total", "Total")}</span><span>${((done.total ?? 0) / 100).toFixed(2)}</span></div>
          </div>
        ) : null}
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
            <select className="input" value={f.p_dropoff_type} onChange={(e) => setPickupType(e.target.value)}>
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

        {f.p_dropoff_type === "zone" && (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid #E4E0D8", borderRadius: 12, background: "#FBF9F6" }}>
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <p className="mono" style={{ marginTop: 0 }}>{t("LoadQ zone — which city?", "Zone LoadQ — quelle ville ?")}</p>
                <select className="input" value={zoneCity} onChange={(e) => { setZoneCity(e.target.value); setZoneId(""); }}>
                  <option value="">{t("Select a city…", "Choisir une ville…")}</option>
                  {zoneCities.map((c) => <option key={c} value={c}>{titleCity(c)}</option>)}
                </select>
              </div>
              <button type="button" className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} disabled={geoBusy} onClick={useMyLocation}>
                <MapPin size={15} strokeWidth={2} /> {myPos ? t("Location on", "Localisation activée") : geoBusy ? t("Locating…", "Localisation…") : t("Show distance from me", "Distance depuis moi")}
              </button>
            </div>
            {geoErr ? <div className="sub" style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{geoErr}</div> : null}
            {zoneCity && (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {cityZones.length === 0 ? <div className="sub" style={{ fontSize: 12.5 }}>{t("No active LoadQ zones in this city yet.", "Aucune zone LoadQ active dans cette ville.")}</div> : null}
                {cityZones.map((z) => {
                  const on = zoneId === z.id; const dist = myPos ? km(myPos, z) : null;
                  return (
                    <button key={z.id} type="button" onClick={() => selectZone(z)} style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 11, cursor: "pointer", background: on ? "rgba(225,29,107,0.06)" : "#fff", border: on ? "1.5px solid #E11D6B" : "1px solid #E4E0D8" }}>
                      <MapPin size={16} strokeWidth={2} style={{ flex: "none", color: on ? "#E11D6B" : "#8a8594" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800 }}>{z.name}</div>
                        <div className="sub" style={{ fontSize: 12 }}>{z.address}</div>
                      </div>
                      {dist != null ? <div style={{ textAlign: "right", flex: "none" }}><div style={{ fontWeight: 800, color: "#178a5e" }}>{dist < 10 ? dist.toFixed(1) : Math.round(dist)} km</div><div className="sub" style={{ fontSize: 11 }}>{t("away", "de vous")}</div></div> : null}
                      {on ? <Check size={18} strokeWidth={2.6} style={{ flex: "none", color: "#E11D6B" }} /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
        <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} />
          <span className="mono">{t("Save this recipient to my clients", "Enregistrer ce destinataire dans mes clients")}</span>
        </label>
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
