"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { Printer, Pencil } from "lucide-react";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  requested: "pgrey", received_at_hub: "pgold", matched: "pmag", dispatched: "pblue",
  picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred",
};
// Editable only before a courier is assigned.
const editable = (p: any) => !p.driver_id && ["requested", "received_at_hub"].includes(p.status);

export default function Shipments() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const when = (s?: string) => s ? new Date(s).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  // edit modal
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // multi-select for batch label printing
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (code: string) => setSelected((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const allOn = rows.length > 0 && rows.every((p) => selected.has(p.code));
  const toggleAll = () => setSelected(() => (allOn ? new Set<string>() : new Set(rows.map((p) => p.code))));
  // Click a code/recipient → the recipient's profile with this shipment's tracking open
  // (falls back to the public track page when the recipient isn't a saved client).
  const parcelHref = (p: any) => p.client_id ? `/shipper/clients/${p.client_id}?open=${encodeURIComponent(p.code)}` : `/track/${encodeURIComponent(p.code)}`;
  const codeLink: React.CSSProperties = { color: "#B81558", fontWeight: 800, textDecoration: "none", cursor: "pointer" };
  const printSelected = () => {
    const codes = Array.from(selected);
    if (!codes.length) return;
    try { localStorage.setItem("kolis_batch_labels", JSON.stringify({ org: active.org_id, codes })); } catch { /* */ }
    window.open(`/shipper/labels?codes=${encodeURIComponent(codes.join(","))}`, "_blank");
  };

  const load = () => org.shipments(active.org_id, filter, search || null).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id, filter]);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const openEdit = (p: any) => {
    setErr("");
    setEdit(p);
    setF({
      p_recipient_name: p.recipient_name ?? "", p_recipient_phone: p.recipient_phone ?? "",
      p_recipient_email: p.recipient_email ?? "", p_dropoff_addr: p.dropoff_addr ?? "",
      p_to_city: p.to_city ?? "", p_dropoff_type: p.dropoff_type ?? "door", p_size: p.size ?? "small",
      p_contents: p.contents ?? "",
    });
  };
  const set = (k: string, v: string) => setF((s: any) => ({ ...s, [k]: v }));

  const errMsg = (e: string) => ({
    shipment_locked: t("This shipment can no longer be edited — a courier has been assigned.", "Cet envoi ne peut plus être modifié — un coursier a été assigné."),
    no_card: t("The change raised the price, but there's no card on file to charge the difference.", "La modification a augmenté le prix, mais aucune carte n'est enregistrée pour débiter la différence."),
    payment_failed: t("Couldn't charge the price difference — the card was declined.", "Impossible de débiter la différence — la carte a été refusée."),
    not_found: t("Shipment not found.", "Envoi introuvable."),
  } as Record<string, string>)[e] || e;

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await org.updateShipment(active.org_id, edit.id, f);
      if (!r?.ok) { setErr(errMsg(r?.error || "")); setBusy(false); return; }
      const a = r.adjustment || {};
      const note = a.charged_cents ? t(`Saved — charged +${money(a.charged_cents)} to the card.`, `Enregistré — ${money(a.charged_cents)} débité sur la carte.`)
        : a.refunded_cents ? t(`Saved — refunded ${money(a.refunded_cents)}.`, `Enregistré — ${money(a.refunded_cents)} remboursé.`)
        : t("Saved.", "Enregistré.");
      setEdit(null); flash(note); load();
    } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  return (
    <>
      <h1>{t("Shipments", "Envois")}</h1>
      <div className="sub">{active.name} · {t("org-wide", "à l’échelle de l’organisation")}</div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", margin: "8px 0" }}>{msg}</div> : null}
      <div className="toolbar">
        {["all", "active", "delivered"].map((ff) => (
          <button key={ff} className={"chip" + (filter === ff ? " on" : "")} onClick={() => setFilter(ff)}>{ff === "all" ? t("all", "tous") : ff === "active" ? t("active", "actifs") : t("delivered", "livrés")}</button>
        ))}
        <input className="search" placeholder={t("Search code, city, recipient…", "Rechercher code, ville, destinataire…")} value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn ghost" onClick={load}>{t("Search", "Rechercher")}</button>
        <button className="btn" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7 }} disabled={selected.size === 0} onClick={printSelected}><Printer size={16} strokeWidth={2} /> {t(`Print labels (${selected.size})`, `Imprimer étiquettes (${selected.size})`)}</button>
      </div>
      <table>
        <thead><tr><th style={{ width: 26 }}><input type="checkbox" checked={allOn} onChange={toggleAll} title={t("Select all", "Tout sélectionner")} /></th><th>{t("When", "Quand")}</th><th>{t("Code", "Code")}</th><th>{t("Route", "Trajet")}</th><th>{t("Recipient", "Destinataire")}</th><th>{t("Size", "Taille")}</th><th>{t("Status", "Statut")}</th><th>{t("Total (incl. tax)", "Total (taxe incl.)")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} style={{ background: selected.has(p.code) ? "rgba(225,29,107,0.05)" : undefined }}>
              <td><input type="checkbox" checked={selected.has(p.code)} onChange={() => toggleSel(p.code)} /></td>
              <td style={{ whiteSpace: "nowrap", color: "var(--t2)" }}>{when(p.created_at)}</td>
              <td><a href={parcelHref(p)} style={codeLink}>{p.code}</a></td><td>{p.from_city} → {p.to_city}{p.dropoff_type === "hub" ? " · hub" : ""}</td><td><a href={parcelHref(p)} style={codeLink}>{p.recipient_name || "—"}</a></td><td>{p.size}</td>
              <td><span className={"pill " + (STATUS[p.status] || "pgrey")}>{p.status.replace(/_/g, " ")}</span></td>
              <td style={{ whiteSpace: "nowrap" }}><b>{money(p.price_cents + (p.tax_cents ?? 0))}</b>{(p.tax_cents ?? 0) > 0 ? <div className="sub" style={{ fontSize: 11 }}>{money(p.price_cents)} + {money(p.tax_cents)} {t("tax", "taxe")}</div> : null}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <a className="btn ghost" href={`/shipper/label/${encodeURIComponent(p.code)}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Printer size={14} strokeWidth={2} /> {t("Label", "Étiquette")}</a>
                {editable(p) ? <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => openEdit(p)}><Pencil size={13} strokeWidth={2} /> {t("Edit", "Modifier")}</button> : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} style={{ color: "var(--t3)" }}>{t("No shipments.", "Aucun envoi.")}</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modalbg" onClick={() => !busy && setEdit(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>{t("Edit shipment", "Modifier l’envoi")} · {edit.code}</h2>
              <button className="btn ghost" onClick={() => !busy && setEdit(null)}>✕</button>
            </div>
            <div className="sub" style={{ marginBottom: 10 }}>{t("Editable until a courier is assigned. Price updates automatically; any difference is charged or refunded to the card on file.", "Modifiable jusqu’à l’assignation d’un coursier. Le prix se met à jour; toute différence est débitée ou remboursée sur la carte.")}</div>

            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}><div className="mono">{t("Pickup type", "Type de ramassage")}</div>
                <select className="input" value={f.p_dropoff_type} onChange={(e) => set("p_dropoff_type", e.target.value)}>
                  <option value="door">{t("Door pickup", "Ramassage à domicile")}</option><option value="hub">{t("Drop at hub", "Dépôt au point relais")}</option><option value="zone">{t("LoadQ zone", "Zone LoadQ")}</option>
                </select></div>
              <div style={{ flex: 1 }}><div className="mono">{t("Size", "Taille")}</div>
                <select className="input" value={f.p_size} onChange={(e) => set("p_size", e.target.value)}>
                  <option value="envelope">{t("Envelope", "Enveloppe")}</option><option value="small">{t("Small", "Petit")}</option><option value="large">{t("Large", "Grand")}</option>
                </select></div>
            </div>
            <div className="mono" style={{ marginTop: 10 }}>{t("Destination city", "Ville de destination")}</div>
            <input className="input" value={f.p_to_city} onChange={(e) => set("p_to_city", e.target.value)} placeholder="Montréal" />
            <div className="mono" style={{ marginTop: 10 }}>{t("Recipient name", "Nom du destinataire")}</div>
            <input className="input" value={f.p_recipient_name} onChange={(e) => set("p_recipient_name", e.target.value)} />
            <div className="row" style={{ gap: 12, marginTop: 10 }}>
              <div style={{ flex: 1 }}><div className="mono">{t("Phone", "Téléphone")}</div><input className="input" value={f.p_recipient_phone} onChange={(e) => set("p_recipient_phone", e.target.value)} /></div>
              <div style={{ flex: 1 }}><div className="mono">{t("Email", "Courriel")}</div><input className="input" value={f.p_recipient_email} onChange={(e) => set("p_recipient_email", e.target.value)} /></div>
            </div>
            <div className="mono" style={{ marginTop: 10 }}>{t("Delivery address", "Adresse de livraison")}</div>
            <input className="input" value={f.p_dropoff_addr} onChange={(e) => set("p_dropoff_addr", e.target.value)} placeholder={t("Street, unit, postal code", "Rue, unité, code postal")} />
            <div className="mono" style={{ marginTop: 10 }}>{t("Contents", "Contenu")}</div>
            <input className="input" value={f.p_contents} onChange={(e) => set("p_contents", e.target.value)} placeholder={t("What's inside", "Ce qu’il y a à l’intérieur")} />

            {err ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? t("Saving…", "Enregistrement…") : t("Save changes", "Enregistrer")}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setEdit(null)}>{t("Cancel", "Annuler")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
