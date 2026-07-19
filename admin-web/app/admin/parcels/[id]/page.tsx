"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { cityList, regionFor } from "@/lib/cities";
import { useLang } from "@/lib/i18n";
import { LiveTracking, useTracking } from "@/components/LiveTracking";

const c$ = (c?: number | null) => `C$${((c ?? 0) / 100).toFixed(2)}`;

export default function ParcelDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang } = useLang();
  const [p, setP] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [cands, setCands] = useState<any[] | null>(null);
  const [reroute, setReroute] = useState(false);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [direct, setDirect] = useState(false);

  const load = useCallback(() => {
    api.parcel(id).then((d) => { setP(d); setCity(d?.to_city ?? ""); }).catch(() => {});
    api.role().then(setRole).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const canOps = role === "owner" || role === "admin" || role === "dispatcher";
  const canMoney = role === "owner" || role === "admin" || role === "finance";
  const run = async (fn: () => Promise<any>, msg = t("Done", "Terminé")) => { setBusy(true); try { await fn(); alert(msg); load(); } catch (e: any) { alert(e?.message || t("Error", "Erreur")); } setBusy(false); };

  // Live driver position + ETA (safe RPC, same as the public track page), refreshed every 45s.
  const live = useTracking(p?.code ?? null);

  if (!p) return <div>{t("Loading…", "Chargement…")}</div>;

  const KV = ({ k, v }: { k: string; v: string }) => <div className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>;

  // Status display label + colour (backend status keys unchanged).
  const statusLabel = (s: string) => lang === "fr" ? (({ requested: "demandé", received_at_hub: "reçu au relais", matched: "jumelé", dispatched: "réparti", picked_up: "ramassé", in_transit: "en transit", delivered: "livré", cancelled: "annulé" } as Record<string, string>)[s] || String(s).replace(/_/g, " ")) : String(s).replace(/_/g, " ");
  const tone = (s: string) => (({ requested: "pmag", received_at_hub: "pgrey", matched: "pblue", dispatched: "pblue", picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred" } as Record<string, string>)[s] || "pgrey");

  const openCands = async () => setCands(await api.candidates(id));
  const pickDriver = (d: any) => {
    setCands(null);
    if (direct) { run(() => api.assignDirect(id, d.driver_id), t("Assigned directly", "Assigné directement")); return; }
    run(() => p.driver_id ? api.changeDriver(id, d.driver_id) : api.assign(id, d.driver_id), p.driver_id ? t("Driver changed", "Chauffeur changé") : t("Offer sent", "Offre envoyée"));
  };
  const doReroute = () => { setReroute(false); run(() => api.reroute(id, city, regionFor(city)), t("Rerouted", "Réacheminé")); };
  // Cancel + refund → return to the parcels list (the parcel is now closed).
  const doCancel = () => {
    if (!confirm(t("Refund the sender and cancel this parcel?", "Rembourser l’expéditeur et annuler ce colis ?"))) return;
    setBusy(true);
    api.refund({ parcel_id: id, action: "cancel", method: "card" })
      .then(() => router.push("/admin/parcels"))
      .catch((e: any) => { alert(e?.message || t("Error", "Erreur")); setBusy(false); });
  };

  return (
    <>
      <button className="btn ghost" onClick={() => router.back()}>← {t("Back", "Retour")}</button>
      <h1 style={{ marginTop: 12 }}>#{p.code} <span className={"pill " + tone(String(p.status))} style={{ fontSize: 12 }}>{statusLabel(String(p.status))}</span></h1>
      <div className="sub">{p.from_city} → {p.to_city} · {p.dropoff_type === "hub" ? t("Hub", "Point relais") : t("Door-to-door", "Porte-à-porte")} · {p.size}</div>

      <div className="cols">
        <div style={{ flex: "1 1 320px" }}>
          <div className="card"><div className="mono">{t("Sender → Recipient", "Expéditeur → Destinataire")}</div>
            <KV k={t("Sender", "Expéditeur")} v={p.sender_name || "—"} /><KV k={t("Sender email", "Courriel expéditeur")} v={p.sender_email || "—"} />
            <KV k={t("Recipient", "Destinataire")} v={p.recipient_name || "—"} /><KV k={t("Phone", "Téléphone")} v={p.recipient_phone || "—"} />
            <KV k={t("Destination", "Destination")} v={p.dropoff_addr || p.pickup_hub_name || "—"} /></div>
          <div className="card"><div className="mono">{t("Contents & insurance", "Contenu et assurance")}</div>
            <KV k={t("Contents", "Contenu")} v={p.contents_description || "—"} />
            <KV k={t("Declared value", "Valeur déclarée")} v={c$(p.declared_value_cents)} />
            <KV k={t("Insured", "Assuré")} v={p.insured ? t(`Yes (+${c$(p.insurance_premium_cents)})`, `Oui (+${c$(p.insurance_premium_cents)})`) : t("Declined", "Refusée")} /></div>
        </div>
        <div style={{ flex: "1 1 280px" }}>
          <div className="card"><div className="mono">{t("Money & driver (admin)", "Argent et chauffeur (admin)")}</div>
            <KV k={t("Sender paid", "Payé par l’expéditeur")} v={c$((p.price_cents ?? 0) + (p.insurance_premium_cents ?? 0))} />
            <KV k={t("Courier payout", "Versement au chauffeur")} v={c$(p.driver_payout_cents)} />
            <KV k={t("Driver", "Chauffeur")} v={p.driver_name || t("unassigned", "non assigné")} />
            <KV k={t("Delivery code", "Code de livraison")} v={p.delivery_code || "—"} /></div>

          {canOps && (
            <div className="card"><div className="mono">{t("Dispatch & route", "Répartition et trajet")}</div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {p.driver_id ? (
                  <>
                    <button className="btn green" disabled>✓ {t("Accepted", "Accepté")} · {p.driver_name || t("driver", "chauffeur")}</button>
                    <button className="btn blue" disabled={busy} onClick={openCands}>{t("Change", "Changer")}</button>
                    <button className="btn ghost" disabled={busy} onClick={() => run(() => api.unassign(id), t("Unassigned", "Désassigné"))}>{t("Unassign", "Désassigner")}</button>
                  </>
                ) : p.preferred_driver_id ? (
                  <>
                    <button className="btn blue" disabled={busy} onClick={openCands}>{t("Offered", "Offert")} · {p.preferred_driver_name || t("driver", "chauffeur")} · {t("awaiting", "en attente")}</button>
                    <button className="btn ghost" disabled={busy} onClick={() => run(() => api.unassign(id), t("Request cancelled", "Demande annulée"))}>{t("Cancel offer", "Annuler l'offre")}</button>
                  </>
                ) : (
                  <button className="btn blue" disabled={busy} onClick={openCands}>{t("Assign driver", "Assigner un chauffeur")}</button>
                )}
                <button className="btn ghost" disabled={busy} onClick={() => setReroute(true)}>{t("Reroute", "Réacheminer")}</button>
              </div>
              {p.preferred_driver_id && !p.driver_id
                ? <div className="sub" style={{ marginTop: 8 }}>⏳ {t(`Request sent — awaiting ${p.preferred_driver_name || "the driver"} to accept.`, `Demande envoyée — en attente de l’acceptation de ${p.preferred_driver_name || "du chauffeur"}.`)}</div>
                : <div className="warn">{t("Reroute changes the destination; couriers + sender are re-notified, the code stays valid.", "Le réacheminement change la destination ; les chauffeurs et l’expéditeur sont avisés à nouveau, le code reste valide.")}</div>}
            </div>
          )}
          {/* Cancel & refund only up until pickup — once picked up/in transit/delivered it's locked. */}
          {canMoney && !["picked_up", "in_transit", "delivered", "cancelled"].includes(String(p.status)) &&
            <button className="btn red" disabled={busy} onClick={doCancel}>{t("Cancel & refund", "Annuler et rembourser")}</button>}
        </div>
      </div>

      <div className="card">
        <div className="mono">{t("Live tracking", "Suivi en direct")}</div>
        {live === undefined ? (
          <div className="sub" style={{ margin: 0 }}>{t("Loading…", "Chargement…")}</div>
        ) : live === null ? (
          <div className="sub" style={{ margin: 0 }}>{t("No live tracking available for this parcel.", "Aucun suivi en direct disponible pour ce colis.")}</div>
        ) : (
          <LiveTracking data={live} t={t} />
        )}
      </div>

      {cands !== null && (
        <div className="modalbg" onClick={() => setCands(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t(`Pick a courier → ${p.to_city}`, `Choisir un chauffeur → ${p.to_city}`)}</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--t2)", background: direct ? "#fdecf3" : "var(--bg)", border: "1px solid " + (direct ? "#E11D6B" : "var(--line)"), borderRadius: 10, padding: "9px 12px", marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
              <span>⚡ {t("Assign directly", "Assigner directement")} — <span style={{ color: "var(--t3)" }}>{direct ? t("driver is assigned now, no acceptance needed", "chauffeur assigné maintenant, sans acceptation") : t("otherwise the driver must accept the offer", "sinon le chauffeur doit accepter l'offre")}</span></span>
            </label>
            {(cands || []).length === 0 && <div style={{ color: "var(--t3)" }}>{t("No candidates heading there.", "Aucun candidat n’y va.")}</div>}
            {(cands || []).map((d) => (
              <div key={d.driver_id} className="card" style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => pickDriver(d)}>
                <div style={{ flex: 1 }}><b>{d.name || t("Courier", "Chauffeur")}</b><div style={{ fontSize: 12, color: "var(--t3)" }}>{d.source === "queue" ? `LoadQ #${d.queue_pos ?? "?"}` : t("Off-queue member", "Membre hors file")} · {t("carrying", "transporte")} {d.carrying}/3</div></div>
                <span className={"pill " + (direct ? "pblue" : "pmag")}>{direct ? t("Assign", "Assigner") : t("Offer", "Offrir")}</span>
              </div>
            ))}
            <button className="btn ghost" style={{ width: "100%" }} onClick={() => setCands(null)}>{t("Close", "Fermer")}</button>
          </div>
        </div>
      )}

      {reroute && (
        <div className="modalbg" onClick={() => setReroute(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t("Reroute destination", "Réacheminer la destination")}</h3>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
              {!cityList.includes(city) && <option value={city}>{city}</option>}
              {cityList.filter((c) => c !== p.from_city).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setReroute(false)}>{t("Cancel", "Annuler")}</button>
              <button className="btn" style={{ flex: 1 }} onClick={doReroute}>{t("Reroute", "Réacheminer")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
