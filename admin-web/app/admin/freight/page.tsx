"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Concierge freight desk: incoming pallet-quote requests. Staff pull the LTL rate
// from the aggregator (link buttons), add the Kolis margin, and record the quote.
const FILTERS: [string, string, string][] = [["all", "All", "Tous"], ["new", "New", "Nouveaux"], ["quoted", "Quoted", "Cotés"], ["booked", "Booked", "Réservés"], ["lost", "Lost", "Perdus"]];
const when = (s?: string) => (s ? new Date(s).toLocaleString() : "—");
// Kolis margin rule: greater of $30 or 15% of the carrier cost.
const kolisPrice = (cost: number) => Math.round((cost + Math.max(30, cost * 0.15)) * 100) / 100;

export default function FreightDesk() {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState("all");
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [cost, setCost] = useState("");
  const [service, setService] = useState("Économique");
  const [trk, setTrk] = useState({ number: "", carrier: "", url: "" });

  const load = useCallback((f = filter) => {
    setLoading(true);
    api.freight(f === "all" ? null : f).then((d) => setList(d || [])).catch(() => setList([])).finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load("all"); }, []); // eslint-disable-line

  const setStatus = async (id: string, status: string) => { try { await api.freightStatus(id, status); load(); if (open?.id === id) setOpen({ ...open, status }); } catch (e: any) { alert(e?.message); } };
  const capturePay = async () => {
    if (!open) return;
    if (!confirm(t("Capture the authorized payment now (shipment picked up)?", "Encaisser le paiement autorisé maintenant (envoi ramassé) ?"))) return;
    try { await api.freightCapture(open.id); alert(t("Payment captured.", "Paiement encaissé.")); load(); setOpen(null); }
    catch (e: any) { alert(e?.message || "error"); }
  };
  const book = async () => {
    if (!open) return;
    if (!trk.number.trim() && !confirm(t("Mark booked without a tracking number?", "Réserver sans numéro de suivi ?"))) return;
    try { await api.freightBooked(open.id, trk.number.trim(), trk.carrier.trim(), trk.url.trim()); alert(t("Booked. Send the merchant the tracking link.", "Réservé. Envoyez le lien de suivi au marchand.")); setTrk({ number: "", carrier: "", url: "" }); load(); setOpen(null); }
    catch (e: any) { alert(e?.message); }
  };
  const saveQuote = async () => {
    const c = parseFloat(cost); if (!open || !c) return;
    const price = kolisPrice(c);
    try { await api.freightQuote(open.id, price, service); alert(t(`Quote saved: $${price} (${service}). Now send it to the merchant.`, `Prix enregistré : ${price} $ (${service}). Envoyez-le au marchand.`)); setCost(""); load(); setOpen(null); }
    catch (e: any) { alert(e?.message); }
  };

  const badge = (s: string) => {
    const m: Record<string, [string, string, string, string]> = { new: ["#FBF3F7", "#9c1048", "New", "Nouveau"], quoted: ["#eef4ff", "#2456c9", "Quoted", "Coté"], booked: ["#eafaf5", "#178a5e", "Booked", "Réservé"], lost: ["#f3f3f5", "#8a8a92", "Lost", "Perdu"] };
    const v = m[s] || m.new;
    return <span style={{ background: v[0], color: v[1], fontWeight: 700, fontSize: 12, padding: "3px 9px", borderRadius: 20 }}>{lang === "fr" ? v[3] : v[2]}</span>;
  };
  const q = (o: any) => `${encodeURIComponent(o.origin)}%20to%20${encodeURIComponent(o.destination)}`;

  return (
    <>
      <h1>{t("Freight", "Fret")}</h1>
      <div className="sub" style={{ marginBottom: 10 }}>{t(
        "Pallet-quote requests from business.kolis.ca/freight. Pull the carrier rate, add margin, record the quote.",
        "Demandes de prix palette depuis business.kolis.ca/freight. Obtenez le tarif transporteur, ajoutez la marge, enregistrez le prix.")}</div>
      <div className="toolbar">
        {FILTERS.map(([f, en, fr]) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); load(f); }}>{lang === "fr" ? fr : en}</button>)}
        <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => load()}>↻ {t("Refresh", "Actualiser")}</button>
      </div>

      <table>
        <thead><tr>
          <th>{t("When", "Quand")}</th><th>{t("Lane", "Trajet")}</th><th>{t("Pallets", "Pal.")}</th><th>{t("Business / Contact", "Entreprise / Contact")}</th><th className="r">{t("Quote", "Prix")}</th><th>{t("Status", "Statut")}</th><th></th>
        </tr></thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.id}>
              <td style={{ whiteSpace: "nowrap", color: "var(--t3)" }}>{when(o.created_at)}</td>
              <td><b>{o.origin}</b> → {o.destination}</td>
              <td>{o.pallets}</td>
              <td>{o.business || "—"}<div style={{ fontSize: 11, color: "var(--t3)" }}>{o.contact} · {o.phone}</div></td>
              <td className="r">{o.quoted_price ? `$${o.quoted_price}` : "—"}</td>
              <td>{badge(o.status)}</td>
              <td><button className="btn" onClick={() => { setOpen(o); setCost(""); }}>{t("Open", "Ouvrir")}</button></td>
            </tr>
          ))}
          {!loading && list.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>{t("No freight requests yet.", "Aucune demande de fret pour l'instant.")}</td></tr>}
          {loading && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>{t("Loading…", "Chargement…")}</td></tr>}
        </tbody>
      </table>

      {open && (
        <div className="modalbg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>{open.origin} → {open.destination}</h2>
            <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.7, marginBottom: 14 }}>
              <b>{open.business || "—"}</b> · {open.contact} · {open.phone}{open.email ? ` · ${open.email}` : ""}<br />
              {open.pallets} {t("pallet(s)", "palette(s)")} · {open.weight || "—"} · {open.dims || "—"}<br />
              {t("Accessorials", "Services")}: {(open.accessorials || []).join(", ") || "—"}
              {open.note ? <><br />{t("Note", "Note")}: {open.note}</> : null}
            </div>

            {open.payment_method && (
              <div style={{ background: "#f7f7fb", border: "1px solid #ececf2", borderRadius: 10, padding: "10px 13px", marginBottom: 14, fontSize: 13 }}>
                <b>{t("Payment", "Paiement")}</b>: {open.payment_method === "card" ? t("Card", "Carte") : open.payment_method === "interac" ? "Interac" : t("Account", "Compte")} · <span style={{ textTransform: "uppercase", fontWeight: 700 }}>{open.payment_status}</span>
                {open.total_cents ? <> · {t("total", "total")} ${(open.total_cents / 100).toFixed(2)}</> : null}
                {open.pay_ref ? <> · réf {open.pay_ref}</> : null}
                {open.payment_method === "card" && open.payment_status === "authorized" && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" onClick={capturePay}>{t("Capture payment — picked up", "Encaisser — ramassé")}</button>
                    <span style={{ color: "var(--t3)", fontSize: 11 }}>{t("Authorized hold — capture when the carrier collects (holds expire ~7 days).", "Autorisation en attente — encaissez au ramassage (expire ~7 jours).")}</span>
                  </div>
                )}
                {open.payment_status === "paid" && <div style={{ color: "#178a5e", marginTop: 6, fontSize: 12, fontWeight: 700 }}>{t("Captured / paid", "Encaissé / payé")}</div>}
                {open.payment_method === "interac" && open.payment_status !== "paid" && <div style={{ color: "var(--t3)", marginTop: 6, fontSize: 12 }}>{t("Awaiting Interac e-Transfer", "En attente du virement Interac")}</div>}
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--t2)", marginBottom: 6 }}>1 · {t("Compare carrier rates", "Comparez les tarifs transporteurs")}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <a className="btn ghost" href={`https://ship.freightcom.com/`} target="_blank" rel="noreferrer">Freightcom ↗</a>
              <a className="btn ghost" href={`https://www.clickship.com/`} target="_blank" rel="noreferrer">ClickShip ↗</a>
              <a className="btn ghost" href={`https://www.freightera.com/`} target="_blank" rel="noreferrer">Freightera ↗</a>
            </div>

            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--t2)", marginBottom: 6 }}>2 · {t("Record the quote", "Enregistrez le prix")}</div>
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: "var(--t3)" }}>{t("Best carrier cost ($)", "Meilleur tarif transporteur ($)")}</label>
                <input className="input" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="180" /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: "var(--t3)" }}>{t("Service", "Service")}</label>
                <select className="input" value={service} onChange={(e) => setService(e.target.value)}><option>Économique</option><option>Express</option></select></div>
            </div>
            {parseFloat(cost) > 0 && (
              <div style={{ background: "#FBF3F7", border: "1px solid #f0cfe0", borderRadius: 10, padding: "10px 13px", margin: "12px 0", fontSize: 13 }}>
                {t("Kolis price to merchant", "Prix Kolis au marchand")}: <b style={{ color: "#E11D6B", fontSize: 16 }}>${kolisPrice(parseFloat(cost))}</b>
                <span style={{ color: "var(--t3)" }}> &nbsp;({t("cost", "coût")} ${parseFloat(cost)} + {t("margin", "marge")} max($30, 15%))</span>
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 6, marginBottom: 16 }}>
              <button className="btn" onClick={saveQuote} disabled={!(parseFloat(cost) > 0)}>{t("Save quote", "Enregistrer le prix")}</button>
            </div>

            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--t2)", marginBottom: 6 }}>3 · {t("Book & add tracking", "Réservez & ajoutez le suivi")}</div>
            {open.tracking_number ? (
              <div style={{ background: "#eafaf5", border: "1px solid #bfe8d6", borderRadius: 10, padding: "10px 13px", marginBottom: 12, fontSize: 13 }}>
                📦 {t("Tracking", "Suivi")}: <b>{open.tracking_number}</b>{open.carrier ? ` · ${open.carrier}` : ""}{open.tracking_url ? <> · <a href={open.tracking_url} target="_blank" rel="noreferrer">{t("carrier ↗", "transporteur ↗")}</a></> : null}
                <div style={{ marginTop: 6, fontSize: 12 }}>{t("Send merchant", "Envoyer au marchand")}: <a href={`/freight/track?n=${encodeURIComponent(open.tracking_number)}`} target="_blank" rel="noreferrer">business.kolis.ca/freight/track?n={open.tracking_number}</a></div>
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <input className="input" style={{ flex: 1.2 }} value={trk.number} onChange={(e) => setTrk({ ...trk, number: e.target.value })} placeholder={t("Tracking / PRO number", "N° de suivi / PRO")} />
                  <input className="input" style={{ flex: 1 }} value={trk.carrier} onChange={(e) => setTrk({ ...trk, carrier: e.target.value })} placeholder={t("Carrier", "Transporteur")} />
                </div>
                <input className="input" value={trk.url} onChange={(e) => setTrk({ ...trk, url: e.target.value })} placeholder={t("Tracking URL (optional)", "Lien de suivi (facultatif)")} />
              </>
            )}

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn" onClick={book}>{t("Mark booked", "Réservé")}</button>
              <button className="btn ghost" onClick={() => setStatus(open.id, "lost")}>{t("Lost", "Perdu")}</button>
              <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setOpen(null)}>{t("Close", "Fermer")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
