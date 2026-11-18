"use client";
// Admin control of a parcel's journey: pickup → stops along the way → delivery.
//
// Every step becomes a kolis_parcel_events row and gets its own card
// (/card/<scan_token>/<event id>): Card 4 for pickup and stops, Card 1 for delivery.
// The sweep (kolis_event_card_sweep, every minute) sends each card to the recipient
// once; "Resend" queues it again.
//
// Codes can be overridden: a parcel with no label, a sender who's unreachable, a
// recipient who left the code at home — the admin vouches for it instead, and the
// event records that the code was skipped.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { cityList } from "@/lib/cities";
import { Check } from "lucide-react";

const c$ = (c?: number | null) => `C$${((c ?? 0) / 100).toFixed(2)}`;
const PRE_PICKUP = ["requested", "received_at_hub", "matched", "dispatched"];

type Ev = { id: string; kind: "picked_up" | "checkpoint" | "delivered"; city: string | null; note: string | null; photo: string | null;
  by: string; override: boolean; at: string; sent: string | null; shared: string | null };
type Track = { pickup_code: string | null; delivery_code: string | null; scan_token: string | null; events: Ev[]; landmarks: { city: string; photo: string }[] };

const CodeInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <input className="input" style={{ width: 120, letterSpacing: 4, fontWeight: 800 }} value={value} placeholder="••••" inputMode="numeric"
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))} />
);

const PhotoPick = ({ file, onPick, label }: { file: File | null; onPick: (f: File | null) => void; label: string }) => (
  <label className="inlineAct-c" style={{ marginTop: 8 }}>
    <input type="file" accept="image/*" capture="environment" style={{ maxWidth: 220 }}
      onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{file ? <><Check size={13} strokeWidth={2.6} color="#178a5e" />{file.name}</> : label}</span>
  </label>
);

export default function ParcelTracking({ p, canOps, canMoney, t, lang, onChanged }: {
  p: any; canOps: boolean; canMoney: boolean; t: (en: string, fr: string) => string; lang: string; onChanged: () => void;
}) {
  const [tr, setTr] = useState<Track | null>(null);
  const [busy, setBusy] = useState(false);
  // pickup
  const [pcode, setPcode] = useState(""); const [pOverride, setPOverride] = useState(false); const [pPhoto, setPPhoto] = useState<File | null>(null);
  // stop
  const [city, setCity] = useState(""); const [note, setNote] = useState(""); const [sPhoto, setSPhoto] = useState<File | null>(null); const [replaceLm, setReplaceLm] = useState(false);
  // delivery
  const [dcode, setDcode] = useState(""); const [dOverride, setDOverride] = useState(false); const [offPlatform, setOffPlatform] = useState(false); const [dPhoto, setDPhoto] = useState<File | null>(null);

  const load = useCallback(() => { api.track(p.id).then(setTr).catch(() => setTr(null)); }, [p.id]);
  useEffect(() => { load(); }, [load]);

  const status = String(p.status);
  const amount = (p.price_cents ?? 0) + (p.insurance_premium_cents ?? 0);
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const cardUrl = (ev: Ev) => tr?.scan_token ? `/card/${tr.scan_token}/${ev.id}` : null;
  const landmark = (name: string) => tr?.landmarks.find((l) => l.city.toLowerCase() === name.trim().toLowerCase())?.photo ?? null;
  const kindLabel = (k: Ev["kind"]) => k === "picked_up" ? t("Picked up", "Ramassé") : k === "delivered" ? t("Delivered", "Livré") : t("Stop", "Étape");

  const go = async (fn: () => Promise<any>, msg: string, reset?: () => void) => {
    setBusy(true);
    try { await fn(); reset?.(); alert(msg); load(); onChanged(); }
    catch (e: any) { alert(e?.message || t("Error", "Erreur")); }
    setBusy(false);
  };
  const upload = async (f: File | null) => (f ? api.uploadPhoto(p.code, f) : null);

  const doPickup = () => go(async () => {
    const url = await upload(pPhoto);
    await api.pickUp(p.id, pcode, pOverride, url);
  }, t("Marked picked up — card queued", "Marqué ramassé — carte en file"), () => { setPcode(""); setPOverride(false); setPPhoto(null); });

  const doStop = () => go(async () => {
    const url = await upload(sPhoto);
    await api.checkpoint(p.id, city.trim(), note.trim() || null, url, replaceLm);
  }, t("Stop added — card queued", "Étape ajoutée — carte en file"), () => { setCity(""); setNote(""); setSPhoto(null); setReplaceLm(false); });

  const doDeliver = () => {
    if (!confirm(offPlatform
      ? t(`Close ${p.code} without capturing? The payment must already be settled off-platform.`, `Fermer ${p.code} sans encaisser ? Le paiement doit déjà être réglé hors plateforme.`)
      : t(`Capture ${c$(amount)} from the sender and mark ${p.code} delivered?`, `Encaisser ${c$(amount)} de l'expéditeur et marquer ${p.code} comme livré ?`))) return;
    go(async () => {
      const url = await upload(dPhoto);
      await api.captureDeliver(p.id, offPlatform);
      // The delivered event now exists (status trigger); tag it with the photo / override.
      const fresh: Track = await api.track(p.id);
      const ev = fresh?.events.find((e) => e.kind === "delivered");
      if (ev && (url || dOverride)) await api.eventUpdate(ev.id, { photo: url, override: dOverride || null });
    }, t("Delivered — card queued", "Livré — carte en file"), () => { setDcode(""); setDOverride(false); setOffPlatform(false); setDPhoto(null); });
  };

  const pickupOk = pOverride || (!!tr?.pickup_code && pcode === String(tr.pickup_code).trim());
  const deliverOk = dOverride || (!!tr?.delivery_code && dcode === String(tr.delivery_code).trim());
  const lm = city.trim() ? landmark(city) : null;

  return (
    <div className="card">
      <div className="mono">{t("Tracking & cards", "Suivi et cartes")}</div>

      <div className="codes">
        <div><div className="inlineAct-l">{t("Pickup code", "Code de ramassage")}</div><b>{tr?.pickup_code ?? "—"}</b><span>{t("sender", "expéditeur")}</span></div>
        <div><div className="inlineAct-l">{t("Delivery code", "Code de livraison")}</div><b>{tr?.delivery_code ?? p.delivery_code ?? "—"}</b><span>{t("recipient", "destinataire")}</span></div>
      </div>

      {/* Timeline */}
      {tr && tr.events.length > 0 ? (
        <div className="tl">
          {tr.events.map((ev) => (
            <div key={ev.id} className="tl-row">
              {ev.photo ? <img src={ev.photo} alt="" className="tl-img" /> : <div className="tl-img tl-none">{t("no photo", "sans photo")}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tl-h">{kindLabel(ev.kind)}{ev.city ? ` · ${ev.city}` : ""}
                  {ev.override && <span className="pill pred" style={{ marginLeft: 6, fontSize: 10 }}>{t("code overridden", "code contourné")}</span>}</div>
                <div className="tl-s">{fmt(ev.at)} · {ev.by === "admin" ? "admin" : ev.by === "courier" ? t("courier", "livreur") : t("system", "système")}
                  {" · "}{ev.shared ? t("shared by courier", "partagée par le livreur") : ev.sent ? t("card sent", "carte envoyée") : t("card pending", "carte en attente")}</div>
                {ev.note && <div className="tl-s">“{ev.note}”</div>}
                <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {cardUrl(ev) && <a className="btn ghost sm" href={cardUrl(ev)!} target="_blank" rel="noreferrer">{t("View card", "Voir la carte")}</a>}
                  {canOps && <button className="btn ghost sm" disabled={busy} onClick={() => go(() => api.eventUpdate(ev.id, { resend: true }), t("Card queued again", "Carte remise en file"))}>{t("Resend", "Renvoyer")}</button>}
                  {canOps && (
                    <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                      {ev.photo ? t("Replace photo", "Changer la photo") : t("Add photo", "Ajouter une photo")}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                        const f = e.target.files?.[0]; if (!f) return;
                        go(async () => { const url = await api.uploadPhoto(p.code, f); await api.eventUpdate(ev.id, { photo: url }); }, t("Photo attached", "Photo ajoutée"));
                      }} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sub" style={{ margin: "8px 0 0" }}>{t("No tracking events yet.", "Aucune étape pour l’instant.")}</div>
      )}

      {/* 1. Pickup */}
      {canOps && PRE_PICKUP.includes(status) && (
        <div className="inlineAct">
          <div className="inlineAct-h">{t("Mark picked up", "Marquer comme ramassé")}</div>
          <div className="inlineAct-l">{t("Sender's pickup code", "Code de ramassage de l'expéditeur")}</div>
          <div className="row">
            <CodeInput value={pcode} onChange={setPcode} />
            <button className="btn green" disabled={busy || !pickupOk} onClick={doPickup}>{t("Confirm pickup", "Confirmer le ramassage")}</button>
          </div>
          <label className="inlineAct-c"><input type="checkbox" checked={pOverride} onChange={(e) => setPOverride(e.target.checked)} />
            <span>{t("Override — no code (no label, scan failed, sender unreachable)", "Contourner — sans code (pas d'étiquette, scan raté, expéditeur injoignable)")}</span></label>
          <PhotoPick file={pPhoto} onPick={setPPhoto} label={t("Pickup photo (goes on the card)", "Photo du ramassage (sur la carte)")} />
        </div>
      )}

      {/* 2. Stops along the way */}
      {canOps && ["picked_up", "in_transit"].includes(status) && (
        <div className="inlineAct">
          <div className="inlineAct-h">{t("Add a stop", "Ajouter une étape")}</div>
          <div className="inlineAct-l">{t("City (e.g. Kingston)", "Ville (ex. Kingston)")}</div>
          <div className="row">
            <input className="input" style={{ width: 200 }} list="kolis-stop-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kingston" />
            <datalist id="kolis-stop-cities">
              {Array.from(new Set([...(tr?.landmarks.map((l) => l.city) ?? []), ...cityList])).map((c) => <option key={c} value={c} />)}
            </datalist>
            <input className="input" style={{ flex: "1 1 180px" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional) — e.g. handed to Leo", "Note (facultatif) — ex. remis à Leo")} />
          </div>
          {lm && <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
            <img src={lm} alt="" className="tl-img" /><span className="sub" style={{ margin: 0 }}>{t(`Saved landmark for ${city.trim()} — used unless you add a photo`, `Repère enregistré pour ${city.trim()} — utilisé sauf si vous ajoutez une photo`)}</span></div>}
          <PhotoPick file={sPhoto} onPick={setSPhoto} label={lm ? t("Different photo (optional)", "Autre photo (facultatif)") : t("Landmark photo — saved for this city", "Photo d'un repère — enregistrée pour cette ville")} />
          {lm && sPhoto && <label className="inlineAct-c"><input type="checkbox" checked={replaceLm} onChange={(e) => setReplaceLm(e.target.checked)} />
            <span>{t(`Also make it ${city.trim()}'s saved landmark`, `En faire aussi le repère enregistré de ${city.trim()}`)}</span></label>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn blue" disabled={busy || !city.trim()} onClick={doStop}>{t("Add stop & send card", "Ajouter l'étape et envoyer la carte")}</button>
          </div>
        </div>
      )}

      {/* 3. Delivery */}
      {canMoney && !["delivered", "cancelled"].includes(status) && (
        <div className="inlineAct">
          <div className="inlineAct-h">{t("Mark delivered", "Marquer comme livré")}</div>
          <div className="inlineAct-l">{t("Recipient's delivery code", "Code de livraison du destinataire")}</div>
          <div className="row">
            <CodeInput value={dcode} onChange={setDcode} />
            <button className="btn green" disabled={busy || !deliverOk} onClick={doDeliver}>
              {offPlatform ? t("Close parcel", "Fermer le colis") : t("Capture & deliver", "Encaisser et livrer")}
            </button>
            <span className="sub" style={{ margin: 0 }}>{offPlatform ? t("no money moves", "aucun mouvement d'argent") : t(`captures ${c$(amount)}`, `encaisse ${c$(amount)}`)}</span>
          </div>
          <label className="inlineAct-c"><input type="checkbox" checked={dOverride} onChange={(e) => setDOverride(e.target.checked)} />
            <span>{t("Override — no code (recipient doesn't have it, left at the door)", "Contourner — sans code (destinataire sans code, laissé à la porte)")}</span></label>
          <label className="inlineAct-c"><input type="checkbox" checked={offPlatform} onChange={(e) => setOffPlatform(e.target.checked)} />
            <span>{t("Already paid off-platform (Interac, cash) — skip the capture", "Déjà payé hors plateforme (Interac, comptant) — ne pas encaisser")}</span></label>
          <PhotoPick file={dPhoto} onPick={setDPhoto} label={t("Drop-off photo (goes on the card)", "Photo de la livraison (sur la carte)")} />
        </div>
      )}
    </div>
  );
}
