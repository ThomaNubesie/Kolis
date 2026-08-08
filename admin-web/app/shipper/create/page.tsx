"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { cityList } from "@/lib/cities";
import { emailOk, phoneOk, nameOk, cityOk } from "@/lib/validate";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { MapPin, Check, X, Search, CreditCard, AlertTriangle, Printer, Users, ArrowLeft, ShieldCheck } from "lucide-react";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type RRow = { size: string; to_city: string; to_address: string; email: string; phone: string; declared: string; insured: boolean | null };
type Line = { name: string; route: string; size: string; price_cents: number | null };
type Review = { lines: Line[]; subtotal: number; premium: number; tax: number; total: number; taxLabel: string; payg: boolean; has_card: boolean };

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
  const [done, setDone] = useState<{ codes: string[]; payg?: boolean; needCard?: boolean; total?: number; charged?: number } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const sizeLabel = (s: string) => (({ envelope: t("Envelope", "Enveloppe"), small: t("Small", "Petit"), large: t("Large", "Grand") } as any)[s] || s);

  // ── Insurance (manual/single flow, mirrors the mobile app) ──
  const [declared, setDeclared] = useState("");            // declared value, dollars
  const [insured, setInsured] = useState<boolean | null>(null);
  const premiumCents = () => (insured === true && parseFloat(declared) > 0 ? Math.round(parseFloat(declared) * 100 * 0.05) : 0);

  // ── Recipient mode: pick from clients (multi) vs type one manually ──
  const [mode, setMode] = useState<"manual" | "clients">("manual");
  const [modeTouched, setModeTouched] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [R, setR] = useState<Record<string, RRow>>({}); // clientId → editable recipient row
  const selectedIds = Object.keys(R);
  useEffect(() => { org.clients(active.org_id).then((c) => setClients(c || [])).catch(() => setClients([])); }, [active.org_id]);
  useEffect(() => {
    if (modeTouched) return;
    const hasPrefill = typeof window !== "undefined" && new URLSearchParams(window.location.search).toString().length > 0;
    if (clients.length > 0 && !hasPrefill) setMode("clients");
  }, [clients, modeTouched]);
  const pickMode = (m: "manual" | "clients") => { setModeTouched(true); setMode(m); setErr(""); };
  const toggleClient = (c: any) => setR((s) => { const n = { ...s }; if (n[c.id]) delete n[c.id]; else n[c.id] = { size: "small", to_city: c.city || "", to_address: c.address || "", email: c.email || "", phone: c.mobile || "", declared: "", insured: null }; return n; });
  const setRow = (id: string, k: keyof RRow, v: any) => setR((s) => ({ ...s, [id]: { ...s[id], [k]: v } }));
  const removeRow = (id: string) => setR((s) => { const n = { ...s }; delete n[id]; return n; });
  const matches = useMemo(() => clients.filter((c) => !R[c.id] && (!search || `${c.full_name} ${c.email} ${c.city}`.toLowerCase().includes(search.toLowerCase()))).slice(0, 6), [clients, R, search]);

  // ── LoadQ zone pickup picker (unchanged) ──
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
    const Rk = 6371, toR = (d: number) => (d * Math.PI) / 180;
    const dLat = toR(z.latitude - a.lat), dLng = toR(z.longitude - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(z.latitude)) * Math.sin(dLng / 2) ** 2;
    return Rk * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
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
  useEffect(() => { setF((s) => ({ ...s, p_recipient_lang: lang })); }, [lang]);
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

  const pickup = () => ({ dropoff_type: f.p_dropoff_type, hub_id: "", pickup_addr: f.p_pickup_addr, from_city: f.p_from_city });
  const shipRows = () => selectedIds.map((id) => {
    const c = clients.find((x) => x.id === id); const o = R[id];
    const ins = o.insured === true && parseFloat(o.declared) > 0;
    return { client_id: id, to_name: c?.full_name, to_email: o.email, to_phone: o.phone, to_address: o.to_address, to_city: o.to_city, size: o.size, contents: f.p_contents, lang, insured: ins, declared_value_cents: ins ? Math.round(parseFloat(o.declared) * 100) : null };
  });

  // ── Step 1: validate + price, then open the review modal (nothing created yet) ──
  const [review, setReview] = useState<Review | null>(null);
  const openReview = async () => {
    setErr("");
    if (f.p_dropoff_type === "zone" && !zoneId) { setErr(t("Pick a LoadQ zone (choose a city, then a zone).", "Choisissez une zone LoadQ (choisissez une ville, puis une zone).")); return; }
    if (!f.p_contents.trim()) { setErr(t("Contents are required.", "Le contenu est requis.")); return; }
    let rowsForQuote: { size: string; to_city: string }[] = [];
    let lines: Line[] = [];
    if (mode === "manual") {
      if (!nameOk(f.p_recipient_name)) { setErr(t("Enter the recipient's full name.", "Entrez le nom complet du destinataire.")); return; }
      if (!emailOk(f.p_recipient_email)) { setErr(t("A valid recipient email is required.", "Un courriel valide du destinataire est requis.")); return; }
      if (!phoneOk(f.p_recipient_phone)) { setErr(t("Enter a valid 10-digit phone number.", "Entrez un numéro de téléphone valide (10 chiffres).")); return; }
      if (!f.p_dropoff_addr.trim()) { setErr(t("Delivery address is required.", "L’adresse de livraison est requise.")); return; }
      if (!cityOk(f.p_to_city)) { setErr(t("Choose a served destination city from the list.", "Choisissez une ville de destination desservie dans la liste.")); return; }
      if (!(parseFloat(declared) > 0)) { setErr(t("Enter the parcel’s declared value.", "Indiquez la valeur déclarée du colis.")); return; }
      if (insured === null) { setErr(t("Choose insurance — insure or decline.", "Choisissez l’assurance — assurer ou refuser.")); return; }
      rowsForQuote = [{ size: f.p_size, to_city: f.p_to_city }];
      lines = [{ name: f.p_recipient_name.trim(), route: `${f.p_from_city} → ${f.p_to_city}`, size: f.p_size, price_cents: null }];
    } else {
      if (selectedIds.length === 0) { setErr(t("Select at least one client as a recipient.", "Sélectionnez au moins un client comme destinataire.")); return; }
      const bad = selectedIds.find((id) => { const r = R[id]; return !cityOk(r.to_city) || !r.to_address.trim() || !emailOk(r.email) || !phoneOk(r.phone) || (r.insured === true && !(parseFloat(r.declared) > 0)); });
      if (bad) { const c = clients.find((x) => x.id === bad); setErr(t(`Check the recipient details for ${c?.full_name || "each recipient"}: a served city, delivery address, valid email and 10-digit phone (and declared value if insuring).`, `Vérifiez les infos du destinataire ${c?.full_name || ""} : une ville desservie, l’adresse, un courriel valide et un téléphone à 10 chiffres (et la valeur déclarée si assuré).`)); return; }
      rowsForQuote = selectedIds.map((id) => ({ size: R[id].size, to_city: R[id].to_city }));
      lines = selectedIds.map((id) => { const c = clients.find((x) => x.id === id); return { name: c?.full_name || "—", route: `${f.p_from_city} → ${R[id].to_city}`, size: R[id].size, price_cents: null }; });
    }
    setBusy(true);
    try {
      const [q, bill] = await Promise.all([
        org.bulkQuote(active.org_id, pickup(), rowsForQuote),
        org.overview(active.org_id).catch(() => ({} as any)),
      ]);
      lines = lines.map((ln, i) => ({ ...ln, price_cents: (q.rows || []).find((qq: any) => qq.index === i + 1)?.price_cents ?? null }));
      // Per-line so mixed-province batches and per-recipient premiums total exactly
      // (each parcel is charged individually: tax on shipping + its own premium).
      const per = lines.map((_, i) => {
        const row = (q.rows || []).find((qq: any) => qq.index === i + 1) || {};
        const shipping = row.price_cents ?? 0;
        const rate = row.tax_rate ?? 0;
        let premium = 0;
        if (mode === "manual") premium = premiumCents();
        else { const rr = R[selectedIds[i]]; premium = rr && rr.insured === true && parseFloat(rr.declared) > 0 ? Math.round(parseFloat(rr.declared) * 100 * 0.05) : 0; }
        return { shipping, premium, tax: Math.round((shipping + premium) * rate) };
      });
      const subtotal = per.reduce((a, x) => a + x.shipping, 0);
      const premium = per.reduce((a, x) => a + x.premium, 0);
      const tax = per.reduce((a, x) => a + x.tax, 0);
      const total = subtotal + premium + tax;
      const taxLabel = q.tax_rate ? `${t("Tax", "Taxe")} · ${(q.tax_rate * 100).toFixed(3).replace(/\.?0+$/, "")}%` : t("Tax", "Taxe");
      setReview({ lines, subtotal, premium, tax, total, taxLabel, payg: (bill as any)?.payg !== false, has_card: !!(bill as any)?.has_card });
    } catch (e: any) { setErr(e?.message || t("Couldn't price this shipment.", "Impossible de calculer le prix.")); }
    setBusy(false);
  };

  // ── Step 2: user validated → actually create (+ charge PAYG) ──
  const confirmCreate = async () => {
    setBusy(true); setErr("");
    try {
      if (mode === "manual") {
        const args = { ...f, p_declared_value_cents: Math.round((parseFloat(declared) || 0) * 100) || null, p_insured: insured === true };
        const res = await org.createShipment(active.org_id, args);
        if (saveClient && f.p_recipient_name.trim()) org.clientSave(active.org_id, { full_name: f.p_recipient_name, email: f.p_recipient_email, mobile: f.p_recipient_phone, address: f.p_dropoff_addr, city: f.p_to_city }).catch(() => {});
        let needCard = false, charged: number | undefined;
        if (res.payg) {
          if (!res.has_card) needCard = true;
          else { const c = await org.chargeShipment(active.org_id, res.id); if (c?.error === "no_card") needCard = true; else charged = c?.total_cents ?? c?.charged_cents; }
        }
        setDone({ codes: [res.code].filter(Boolean), payg: res.payg, needCard, total: review?.total, charged });
      } else {
        const res = await org.bulkShip(active.org_id, pickup(), shipRows());
        const created = (res.results || []).filter((x: any) => x.ok);
        if (res.payg) await Promise.all(created.map((x: any) => org.chargeShipment(active.org_id, x.id).catch(() => {})));
        setDone({ codes: created.map((x: any) => x.code).filter(Boolean), payg: res.payg, needCard: res.payg && !review?.has_card, total: review?.total });
      }
      setReview(null);
    } catch (e: any) { setErr(e?.message || t("Failed to create shipment.", "Échec de la création de l’envoi.")); }
    setBusy(false);
  };

  const addCard = async () => {
    setBusy(true); setErr("");
    try {
      const rr = await org.setupCard(active.org_id);
      if (rr?.url) window.location.href = rr.url;
      else setErr(rr?.skipped || rr?.error || t("Card setup isn't available yet.", "L’ajout de carte n’est pas encore disponible."));
    } catch (e: any) { setErr(e?.message || t("Couldn't open card setup.", "Impossible d’ouvrir l’ajout de carte.")); }
    setBusy(false);
  };
  const printLabels = () => {
    if (!done?.codes?.length) return;
    // A single send → the rich label page (print + download + email); a batch → the print-all page.
    if (done.codes.length === 1) router.push(`/shipper/label/${encodeURIComponent(done.codes[0])}`);
    else router.push(`/shipper/labels?codes=${encodeURIComponent(done.codes.join(","))}`);
  };

  if (done) return (
    <>
      <h1>{done.codes.length > 1 ? t(`${done.codes.length} shipments created`, `${done.codes.length} envois créés`) : t("Shipment created", "Envoi créé")}</h1>
      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>✓ {done.codes.join(", ") || "—"}</div>
        <div className="sub" style={{ marginTop: 6 }}>
          {done.needCard
            ? t("Created — but no card is on file yet. Add a card to pay for these shipments.", "Créé — mais aucune carte n’est enregistrée. Ajoutez une carte pour payer ces envois.")
            : done.charged != null
              ? t(`Paid ${money(done.charged)} to the card on file.`, `Payé ${money(done.charged)} sur la carte enregistrée.`)
              : done.payg
                ? t("Charged to the card on file.", "Débité sur la carte enregistrée.")
                : t(`Added to ${active.name}’s invoice cycle (net terms).`, `Ajouté au cycle de facturation de ${active.name} (conditions nettes).`)}
        </div>
        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        <div className="row" style={{ marginTop: 14, flexWrap: "wrap" }}>
          {done.needCard
            ? <button className="btn" disabled={busy} onClick={addCard}>{busy ? t("Opening…", "Ouverture…") : t("Add a card", "Ajouter une carte")}</button>
            : <button className="btn" onClick={() => { setDone(null); setErr(""); setR({}); setDeclared(""); setInsured(null); set("p_to_city", ""); set("p_recipient_name", ""); set("p_recipient_email", ""); set("p_recipient_phone", ""); set("p_dropoff_addr", ""); set("p_contents", ""); }}>{t("Create another", "En créer un autre")}</button>}
          {done.codes.length ? <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={printLabels}><Printer size={15} strokeWidth={2} />{done.codes.length > 1 ? t("Print labels", "Imprimer les étiquettes") : t("Print label", "Imprimer l’étiquette")}</button> : null}
          <button className="btn ghost" onClick={() => router.push("/shipper/shipments")}>{t("View shipments", "Voir les envois")}</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <h1>{t("New shipment", "Nouvel envoi")}</h1>
      <div className="sub">{t(`Billed to ${active.name}.`, `Facturé à ${active.name}.`)}</div>
      <div className="card" style={{ maxWidth: 620 }}>
        {/* Pickup + from city */}
        <div className="row" style={{ gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p className="mono">{t("Pickup type", "Type de ramassage")}</p>
            <select className="input" value={f.p_dropoff_type} onChange={(e) => setPickupType(e.target.value)}>
              <option value="door">{t("Door pickup", "Ramassage à domicile")}</option><option value="hub">{t("Drop at hub", "Dépôt au point relais")}</option><option value="zone">{t("LoadQ zone", "Zone LoadQ")}</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <p className="mono">{t("From city", "Ville de départ")}</p>
            <input className="input" list="net-cities" value={f.p_from_city} onChange={(e) => set("p_from_city", e.target.value)} />
            <datalist id="net-cities">{cityList.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
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

        {/* Recipients — mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 4px" }}>
          <p className="mono" style={{ margin: 0 }}>{t("Recipients", "Destinataires")}</p>
          <div style={{ marginLeft: "auto", display: "inline-flex", background: "var(--cardAlt,#F0ECE2)", border: "1px solid #E7E3D9", borderRadius: 10, padding: 3 }}>
            {(["clients", "manual"] as const).map((m) => (
              <button key={m} onClick={() => pickMode(m)} style={{ border: 0, background: mode === m ? "#E11D6B" : "transparent", color: mode === m ? "#fff" : "#5A6B63", padding: "7px 13px", borderRadius: 8, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
                {m === "clients" ? t("From my clients", "Depuis mes clients") : t("Enter manually", "Saisir manuellement")}
              </button>
            ))}
          </div>
        </div>

        {mode === "clients" ? (
          <>
            <div style={{ position: "relative" }}>
              <Search size={16} strokeWidth={2.2} style={{ position: "absolute", left: 11, top: 11, color: "#8A978F" }} />
              <input className="input" style={{ paddingLeft: 34 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Add a client — search name, email or city…", "Ajouter un client — nom, courriel ou ville…")} />
              {search && matches.length > 0 && (
                <div style={{ position: "absolute", top: 44, left: 0, right: 0, background: "#fff", border: "1px solid #E7E3D9", borderRadius: 11, boxShadow: "0 12px 30px rgba(20,10,15,.14)", padding: 6, zIndex: 5 }}>
                  {matches.map((c) => (
                    <div key={c.id} onClick={() => { toggleClient(c); setSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: 8, cursor: "pointer" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#5A6B63", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flex: "none" }}>{(c.full_name || "?").slice(0, 2).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 12.5 }}>{c.full_name}</div><div className="sub" style={{ fontSize: 11 }}>{c.email}{c.city ? ` · ${c.city}` : ""}</div></div>
                      <span className="chip" style={{ padding: "3px 9px" }}>{t("Add", "Ajouter")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedIds.length === 0 ? (
              <div className="sub" style={{ fontSize: 12.5, margin: "12px 2px", display: "flex", alignItems: "center", gap: 7 }}><Users size={15} strokeWidth={2} />{t("Search above to add one or more clients as recipients.", "Recherchez ci-dessus pour ajouter un ou plusieurs clients comme destinataires.")}</div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 2px" }}>{t(`Selected recipients (${selectedIds.length})`, `Destinataires sélectionnés (${selectedIds.length})`)} <span className="sub" style={{ fontWeight: 600 }}>· {t("prefilled from each client — all fields required", "préremplis depuis chaque client — tous les champs requis")}</span></div>
                {selectedIds.map((id) => {
                  const c = clients.find((x) => x.id === id); const o = R[id];
                  const incomplete = !o.to_city.trim() || !o.to_address.trim() || !emailOk(o.email) || !o.phone.trim() || (o.insured === true && !(parseFloat(o.declared) > 0));
                  return (
                    <div key={id} style={{ border: `1px solid ${incomplete ? "#E0A32E" : "#E7E3D9"}`, background: incomplete ? "#FDF8EE" : "#fff", borderRadius: 13, padding: "12px 13px", marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#B81558", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flex: "none" }}>{(c?.full_name || "?").slice(0, 2).toUpperCase()}</div>
                        <div style={{ fontWeight: 800, fontSize: 13.5 }}>{c?.full_name}</div>
                        {incomplete && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: "#9a6a12", background: "#F6E2B8", borderRadius: 20, padding: "2px 8px" }}><AlertTriangle size={11} strokeWidth={2.4} />{t("Missing details", "Détails manquants")}</span>}
                        <button onClick={() => removeRow(id)} title={t("Remove", "Retirer")} style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: "50%", background: "var(--bg,#F7F5EF)", border: "1px solid #E7E3D9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={11} strokeWidth={3} color="#8A978F" /></button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .9fr", gap: 9 }}>
                        <div><div className="mono" style={{ fontSize: 10 }}>{t("To city *", "Ville *")}</div><input className="input" list="net-cities" style={{ padding: "8px 10px", fontSize: 12.5 }} value={o.to_city} onChange={(e) => setRow(id, "to_city", e.target.value)} placeholder="Montréal" /></div>
                        <div><div className="mono" style={{ fontSize: 10 }}>{t("Size", "Taille")}</div>
                          <select className="input" style={{ padding: "8px 10px", fontSize: 12.5 }} value={o.size} onChange={(e) => setRow(id, "size", e.target.value)}>
                            <option value="envelope">{t("Envelope", "Enveloppe")}</option><option value="small">{t("Small", "Petit")}</option><option value="large">{t("Large", "Grand")}</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: 9 }}><div className="mono" style={{ fontSize: 10 }}>{t("Delivery address *", "Adresse de livraison *")}</div>
                        <input className="input" style={{ padding: "8px 10px", fontSize: 12.5 }} value={o.to_address} onChange={(e) => setRow(id, "to_address", e.target.value)} placeholder={t("Street, unit, postal code", "Rue, unité, code postal")} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 9 }}>
                        <div><div className="mono" style={{ fontSize: 10 }}>{t("Email *", "Courriel *")}</div><input className="input" type="email" style={{ padding: "8px 10px", fontSize: 12.5 }} value={o.email} onChange={(e) => setRow(id, "email", e.target.value)} placeholder="name@email.com" /></div>
                        <div><div className="mono" style={{ fontSize: 10 }}>{t("Phone *", "Téléphone *")}</div><input className="input" style={{ padding: "8px 10px", fontSize: 12.5 }} value={o.phone} onChange={(e) => setRow(id, "phone", e.target.value)} placeholder="(514) 555-0148" /></div>
                      </div>
                      <div style={{ marginTop: 9 }}>
                        <label className="row" style={{ gap: 7, alignItems: "center", cursor: "pointer" }}>
                          <input type="checkbox" checked={o.insured === true} onChange={(e) => setRow(id, "insured", e.target.checked)} />
                          <span className="mono" style={{ fontSize: 10, margin: 0, display: "inline-flex", alignItems: "center", gap: 5 }}><ShieldCheck size={12} strokeWidth={2} />{t("Insure this parcel (+5% of value)", "Assurer ce colis (+5 % de la valeur)")}</span>
                        </label>
                        {o.insured === true && (
                          <input className="input" type="number" min={0} step="0.01" style={{ padding: "8px 10px", fontSize: 12.5, marginTop: 6, borderColor: parseFloat(o.declared) > 0 ? undefined : "#E0A32E" }} value={o.declared} onChange={(e) => setRow(id, "declared", e.target.value)} placeholder={t("Declared value (C$) *", "Valeur déclarée (C$) *")} />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="sub" style={{ fontSize: 11.5, marginTop: 10, display: "flex", gap: 7, alignItems: "center" }}><Check size={14} strokeWidth={2.4} />{t("One shipment per recipient. Pickup & contents below apply to all.", "Un envoi par destinataire. Le ramassage et le contenu ci-dessous s’appliquent à tous.")}</div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="mono">{t("Recipient name *", "Nom du destinataire *")}</p>
            <input className="input" value={f.p_recipient_name} onChange={(e) => set("p_recipient_name", e.target.value)} placeholder={t("Name", "Nom")} />
            <div className="row" style={{ gap: 16, marginTop: 12 }}>
              <div style={{ flex: 1 }}><p className="mono">{t("Recipient email *", "Courriel du destinataire *")}</p><input className="input" type="email" value={f.p_recipient_email} onChange={(e) => set("p_recipient_email", e.target.value)} placeholder="name@email.com" /></div>
              <div style={{ flex: 1 }}><p className="mono">{t("Recipient phone *", "Téléphone du destinataire *")}</p><input className="input" value={f.p_recipient_phone} onChange={(e) => set("p_recipient_phone", e.target.value)} placeholder="(514) 555-0148" /></div>
            </div>
            <div className="row" style={{ gap: 16, marginTop: 12 }}>
              <div style={{ flex: 1 }}><p className="mono">{t("To city *", "Ville de destination *")}</p><input className="input" list="net-cities" value={f.p_to_city} onChange={(e) => set("p_to_city", e.target.value)} placeholder="Montréal" /></div>
              <div style={{ flex: 1 }}><p className="mono">{t("Size", "Taille")}</p>
                <select className="input" value={f.p_size} onChange={(e) => set("p_size", e.target.value)}>
                  <option value="envelope">{t("Envelope (≤1kg)", "Enveloppe (≤1 kg)")}</option><option value="small">{t("Small (≤5kg)", "Petit (≤5 kg)")}</option><option value="large">{t("Large (≤20kg)", "Grand (≤20 kg)")}</option>
                </select>
              </div>
            </div>
            <p className="mono" style={{ marginTop: 12 }}>{t("Delivery address *", "Adresse de livraison *")}</p>
            <input className="input" value={f.p_dropoff_addr} onChange={(e) => set("p_dropoff_addr", e.target.value)} placeholder={t("Street, unit, postal code", "Rue, unité, code postal")} />
            <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} />
              <span className="mono">{t("Save this recipient to my clients", "Enregistrer ce destinataire dans mes clients")}</span>
            </label>
          </>
        )}

        {/* Notify language + contents (shared, required) */}
        <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 14 }}>
          <span className="mono">{t("Notify recipient in", "Informer le destinataire en")}</span>
          {["en", "fr"].map((l) => (
            <button key={l} className={"chip" + (f.p_recipient_lang === l ? " on" : "")} onClick={() => set("p_recipient_lang", l)}>{l.toUpperCase()}</button>
          ))}
        </div>
        <p className="mono" style={{ marginTop: 12 }}>{t("Contents *", "Contenu *")}</p>
        <input className="input" value={f.p_contents} onChange={(e) => set("p_contents", e.target.value)} placeholder={t("What's inside", "Ce qu’il y a à l’intérieur")} />

        {/* Insurance (manual/single flow — mirrors the app) */}
        {mode === "manual" && (
          <>
            <div className="row" style={{ gap: 16, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <p className="mono">{t("Declared value (C$) *", "Valeur déclarée (C$) *")}</p>
                <input className="input" type="number" min={0} step="0.01" value={declared} onChange={(e) => setDeclared(e.target.value)} placeholder="0.00" />
              </div>
              <div style={{ flex: 1 }}>
                <p className="mono">{t("Insurance *", "Assurance *")}</p>
                <div className="row" style={{ gap: 8 }}>
                  <button className={"chip" + (insured === true ? " on" : "")} onClick={() => setInsured(true)}>{t("Insure (+5%)", "Assurer (+5 %)")}</button>
                  <button className={"chip" + (insured === false ? " on" : "")} onClick={() => setInsured(false)}>{t("Decline", "Refuser")}</button>
                </div>
              </div>
            </div>
            {insured !== null && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-start" }}>
                {insured ? <ShieldCheck size={15} strokeWidth={2.2} color="#178a5e" style={{ marginTop: 1, flex: "none" }} /> : <AlertTriangle size={15} strokeWidth={2.2} color="var(--red)" style={{ marginTop: 1, flex: "none" }} />}
                <span style={{ fontSize: 11.5, color: insured ? "#178a5e" : "var(--red)", lineHeight: 1.4 }}>
                  {insured
                    ? t(`Covered up to the declared value. Premium ${money(premiumCents())} (5%) is added to the total.`, `Couvert jusqu’à la valeur déclarée. Prime ${money(premiumCents())} (5 %) ajoutée au total.`)
                    : t("Declined — any claim is capped at the shipping fee, not the parcel's value.", "Refusée — toute réclamation est plafonnée aux frais d’expédition, non à la valeur du colis.")}
                </span>
              </div>
            )}
          </>
        )}

        {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
        <button className="btn" style={{ marginTop: 14, width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 7 }} disabled={busy} onClick={openReview}>
          {busy ? t("Pricing…", "Calcul…") : mode === "clients" && selectedIds.length > 1
            ? t(`Review charges → ${selectedIds.length} shipments`, `Voir les frais → ${selectedIds.length} envois`)
            : t("Review charges", "Voir les frais")}
        </button>
      </div>

      {/* ── Review charges modal ── */}
      {review && (
        <div onClick={() => !busy && setReview(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,15,20,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 24px 60px rgba(20,10,15,.3)" }}>
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E7E3D9" }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t("Review charges", "Voir les frais")}</h3>
              <div className="sub" style={{ marginTop: 3 }}>{t(`${review.lines.length} shipment${review.lines.length > 1 ? "s" : ""} · billed to ${active.name}`, `${review.lines.length} envoi${review.lines.length > 1 ? "s" : ""} · facturé à ${active.name}`)}</div>
            </div>
            <div style={{ padding: "8px 20px 16px" }}>
              {review.lines.map((ln, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid #F1EEE7" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#B81558", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flex: "none" }}>{(ln.name || "?").slice(0, 2).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ln.name}</div><div style={{ fontSize: 11.5, color: "#8A978F", fontWeight: 700 }}>{ln.route} · {sizeLabel(ln.size)}</div></div>
                  <div style={{ marginLeft: "auto", fontWeight: 800, fontSize: 13.5 }}>{ln.price_cents != null ? money(ln.price_cents) : "—"}</div>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}><span className="sub">{t("Subtotal", "Sous-total")}</span><span>{money(review.subtotal)}</span></div>
                {review.premium > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}><span className="sub" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><ShieldCheck size={13} strokeWidth={2} color="#178a5e" />{t("Insurance · 5%", "Assurance · 5 %")}</span><span>{money(review.premium)}</span></div>}
                {review.tax > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}><span className="sub">{review.taxLabel}</span><span>{money(review.tax)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, paddingTop: 9, marginTop: 5, borderTop: "1px solid #E7E3D9" }}><span>{t("Total", "Total")}</span><span>{money(review.total)}</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg,#F7F5EF)", border: "1px solid #E7E3D9", borderRadius: 11, padding: "11px 13px", marginTop: 14, fontSize: 12.5, fontWeight: 700 }}>
                <CreditCard size={17} strokeWidth={2} color="#5A6B63" />
                {review.payg
                  ? (review.has_card ? t("Card on file · charged on confirm", "Carte enregistrée · débitée à la confirmation") : t("No card on file — you'll be asked to add one", "Aucune carte — on vous demandera d’en ajouter une"))
                  : t(`Added to ${active.name}'s invoice (net terms)`, `Ajouté à la facture de ${active.name} (conditions nettes)`)}
              </div>
              <div className="sub" style={{ fontSize: 11.5, marginTop: 10, textAlign: "center" }}>{t("You won't be charged until you press confirm.", "Vous ne serez débité qu’après confirmation.")}</div>
              {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10, textAlign: "center" }}>{err}</div> : null}
            </div>
            <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid #E7E3D9", background: "#FBFAF7" }}>
              <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} disabled={busy} onClick={() => setReview(null)}><ArrowLeft size={15} strokeWidth={2} />{t("Back", "Retour")}</button>
              <button className="btn" style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 7 }} disabled={busy} onClick={confirmCreate}>
                <Check size={16} strokeWidth={2.6} />{busy ? t("Creating…", "Création…") : t(`Confirm & create · ${money(review.total)}`, `Confirmer · ${money(review.total)}`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
