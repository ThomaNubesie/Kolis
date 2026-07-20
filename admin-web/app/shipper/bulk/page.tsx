"use client";
import { useEffect, useMemo, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { Printer, History, Save, FolderOpen, Pencil, Trash2, FilePlus2, Layers } from "lucide-react";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Row = { size: string; to_city: string; to_address: string; contents: string };

export default function BulkShip() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const [clients, setClients] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});
  // batch pickup
  const [ptype, setPtype] = useState<"door" | "hub" | "zone">("door");
  const [pickupAddr, setPickupAddr] = useState("");
  const [fromCity, setFromCity] = useState("Ottawa");
  const [hubId, setHubId] = useState("");
  const [quote, setQuote] = useState<{ rows: any[]; total_cents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(false);
  const [batchCodes, setBatchCodes] = useState<string[]>([]);
  // ── Saved batches (drafts) ──
  const [drafts, setDrafts] = useState<any[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [curDraft, setCurDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const loadDrafts = () => org.bulkDrafts(active.org_id).then((d) => setDrafts(d || [])).catch(() => setDrafts([]));
  const printAllLabels = () => {
    if (!batchCodes.length) return;
    try { localStorage.setItem("kolis_batch_labels", JSON.stringify({ org: active.org_id, codes: batchCodes })); } catch { /* */ }
    window.open(`/shipper/labels?codes=${encodeURIComponent(batchCodes.join(","))}`, "_blank");
  };

  useEffect(() => {
    org.clients(active.org_id).then(setClients).catch(() => {});
    org.hubs(active.org_id).then(setHubs).catch(() => {});
    loadDrafts();
    // eslint-disable-next-line
  }, [active.org_id]);

  const filtered = clients.filter((c) => !search || `${c.full_name} ${c.email} ${c.city}`.toLowerCase().includes(search.toLowerCase()));
  const selectedIds = Object.keys(rows);
  const pickup = useMemo(() => ({ dropoff_type: ptype, hub_id: ptype === "hub" ? hubId : "", pickup_addr: ptype !== "hub" ? pickupAddr : "", from_city: fromCity }), [ptype, hubId, pickupAddr, fromCity]);

  const shipRows = () => selectedIds.map((id) => {
    const c = clients.find((x) => x.id === id); const o = rows[id];
    return { client_id: id, to_name: c?.full_name, to_email: c?.email, to_phone: c?.mobile, to_address: o.to_address, to_city: o.to_city, size: o.size, contents: o.contents, lang };
  });
  const when = (s?: string) => s ? new Date(s).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" }) : "";

  // ── Select from a client's package history ──
  const [histFor, setHistFor] = useState<string | null>(null);
  const [histRows, setHistRows] = useState<Record<string, any[]>>({});
  const [histLoading, setHistLoading] = useState(false);
  const openHistory = async (clientId: string) => {
    if (histFor === clientId) { setHistFor(null); return; }
    setHistFor(clientId);
    if (!histRows[clientId]) {
      setHistLoading(true);
      try { const h = await org.clientHistory(active.org_id, clientId); setHistRows((s) => ({ ...s, [clientId]: h || [] })); }
      catch { setHistRows((s) => ({ ...s, [clientId]: [] })); }
      setHistLoading(false);
    }
  };
  const applyHistory = (clientId: string, h: any) => {
    setRows((s) => ({ ...s, [clientId]: { size: h.size || "small", to_city: h.to_city || "", to_address: h.dropoff_addr || (s[clientId]?.to_address || ""), contents: h.contents || (s[clientId]?.contents || "") } }));
    setHistFor(null);
  };

  // Preselect a client when arriving from their profile (/shipper/bulk?client=…),
  // optionally prefilling a specific past shipment's size/city/address (&size&city&addr).
  useEffect(() => {
    if (typeof window === "undefined" || !clients.length) return;
    const sp = new URLSearchParams(window.location.search);
    const cid = sp.get("client");
    if (cid) {
      const c = clients.find((x) => x.id === cid);
      if (c) setRows((s) => (s[cid] ? s : { ...s, [cid]: { size: sp.get("size") || "small", to_city: sp.get("city") || c.city || "", to_address: sp.get("addr") || c.address || "", contents: sp.get("contents") || "" } }));
    }
    // eslint-disable-next-line
  }, [clients]);

  // Live quote whenever selection or pickup changes.
  useEffect(() => {
    if (selectedIds.length === 0) { setQuote(null); return; }
    const rowsForQuote = selectedIds.map((id) => ({ size: rows[id].size, to_city: rows[id].to_city }));
    org.bulkQuote(active.org_id, pickup, rowsForQuote).then(setQuote).catch(() => setQuote(null));
    // eslint-disable-next-line
  }, [rows, ptype, hubId, pickupAddr, fromCity]);

  const toggle = (c: any) => setRows((s) => {
    const n = { ...s };
    if (n[c.id]) delete n[c.id];
    else n[c.id] = { size: "small", to_city: c.city || "", to_address: c.address || "", contents: "" };
    return n;
  });
  const setRow = (id: string, k: keyof Row, v: string) => setRows((s) => ({ ...s, [id]: { ...s[id], [k]: v } }));

  // Validate the batch, then open the review modal (no shipment is created yet).
  const openPreview = () => {
    if (ptype === "hub" && !hubId) { setErr(t("Choose a pickup hub.", "Choisissez un point relais.")); return; }
    if (ptype !== "hub" && !pickupAddr.trim()) { setErr(t("Enter the pickup address.", "Entrez l’adresse de ramassage.")); return; }
    if (selectedIds.length === 0) { setErr(t("Select at least one client.", "Sélectionnez au moins un client.")); return; }
    if (selectedIds.some((id) => !rows[id].to_city.trim())) { setErr(t("Every selected client needs a destination city.", "Chaque client doit avoir une ville de destination.")); return; }
    setErr(""); setPreview(true);
  };

  // Per-line preview details (client, destination, size, price) for the modal.
  const previewLines = selectedIds.map((id, i) => {
    const c = clients.find((x) => x.id === id); const o = rows[id];
    return { id, name: c?.full_name || "—", to_address: o.to_address, to_city: o.to_city, size: o.size, contents: o.contents,
      price_cents: quote?.rows.find((q) => q.index === i + 1)?.price_cents ?? null };
  });
  const pickupLabel = ptype === "hub" ? (hubs.find((h) => h.id === hubId)?.name || t("Hub", "Point relais")) : `${pickupAddr}${fromCity ? ` · ${fromCity}` : ""}`;

  // Confirmed — actually create the shipments (+ charge PAYG).
  const create = async () => {
    setBusy(true); setErr(""); setResult("");
    try {
      const res = await org.bulkShip(active.org_id, pickup, shipRows());
      const created = (res.results || []).filter((x: any) => x.ok);
      const failed = (res.results || []).filter((x: any) => !x.ok);
      if (res.payg) await Promise.all(created.map((x: any) => org.chargeShipment(active.org_id, x.id).catch(() => {})));
      setBatchCodes(created.map((x: any) => x.code).filter(Boolean));
      setRows({}); setPreview(false);
      setResult(t(`✓ Created ${created.length} shipment(s)${res.payg ? " and charged the card on file" : ""}.${failed.length ? ` ${failed.length} failed.` : ""}`,
        `✓ ${created.length} envoi(s) créé(s)${res.payg ? " et débités sur la carte" : ""}.${failed.length ? ` ${failed.length} en échec.` : ""}`));
    } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  // ── Saved batches ──
  const whenLong = (s?: string) => s ? new Date(s).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const draftRows = () => selectedIds.map((id) => ({ client_id: id, size: rows[id].size, to_city: rows[id].to_city, to_address: rows[id].to_address, contents: rows[id].contents }));
  const defaultName = () => `${t("Batch", "Lot")} · ${new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" })}`;
  const openSave = () => { setDraftName(curDraft ? draftName : defaultName()); setErr(""); setSaveOpen(true); };
  const saveDraft = async () => {
    const name = draftName.trim() || defaultName();
    setBusy(true); setErr("");
    try {
      const id = await org.bulkDraftSave(active.org_id, { id: curDraft, name, pickup, rows: draftRows() });
      setCurDraft(id); setDraftName(name); setSaveOpen(false);
      setNotice(t(`Saved “${name}” — ${selectedIds.length} recipient(s).`, `« ${name} » enregistré — ${selectedIds.length} destinataire(s).`));
      loadDrafts();
    } catch (e: any) { setErr(e?.message || t("Couldn’t save the batch.", "Échec de l’enregistrement du lot.")); }
    setBusy(false);
  };
  const loadDraft = async (d: any) => {
    setBusy(true); setErr("");
    try {
      const full = await org.bulkDraftGet(active.org_id, d.id);
      const p = full.pickup || {};
      setPtype((p.dropoff_type as any) || "door"); setHubId(p.hub_id || ""); setPickupAddr(p.pickup_addr || ""); setFromCity(p.from_city || "Ottawa");
      const map: Record<string, Row> = {};
      (full.rows || []).forEach((rw: any) => { if (rw.client_id) map[rw.client_id] = { size: rw.size || "small", to_city: rw.to_city || "", to_address: rw.to_address || "", contents: rw.contents || "" }; });
      const known = Object.keys(map).filter((id) => clients.some((c) => c.id === id));
      const dropped = Object.keys(map).length - known.length;
      const clean: Record<string, Row> = {}; known.forEach((id) => (clean[id] = map[id]));
      setRows(clean); setCurDraft(d.id); setDraftName(d.name); setShowDrafts(false); setResult("");
      setNotice(t(`Loaded “${d.name}”${dropped ? ` — ${dropped} removed client(s) skipped` : ""}.`, `« ${d.name} » chargé${dropped ? ` — ${dropped} client(s) supprimé(s) ignoré(s)` : ""}.`));
    } catch { setErr(t("Couldn’t load that batch.", "Impossible de charger ce lot.")); }
    setBusy(false);
  };
  const renameDraft = async (d: any) => {
    const name = window.prompt(t("Rename batch", "Renommer le lot"), d.name);
    if (name == null || !name.trim()) return;
    await org.bulkDraftSave(active.org_id, { id: d.id, name: name.trim() }).catch(() => {});
    if (curDraft === d.id) setDraftName(name.trim());
    loadDrafts();
  };
  const deleteDraft = async (d: any) => {
    if (!window.confirm(t(`Delete saved batch “${d.name}”? This can’t be undone.`, `Supprimer le lot « ${d.name} » ? Action irréversible.`))) return;
    await org.bulkDraftDelete(active.org_id, d.id).catch(() => {});
    if (curDraft === d.id) setCurDraft(null);
    loadDrafts();
  };
  const newBatch = () => { setRows({}); setCurDraft(null); setDraftName(""); setResult(""); setNotice(""); setErr(""); };

  return (
    <>
      {histFor && <div onClick={() => setHistFor(null)} style={{ position: "fixed", inset: 0, zIndex: 15 }} />}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ marginBottom: 2 }}>{t("Bulk shipment", "Envoi en lot")}{curDraft ? <span className="pill pmag" style={{ marginLeft: 10, fontSize: 12, verticalAlign: "middle" }}>{draftName}</span> : null}</h1>
          <div className="sub">{t("One pickup for the batch, then pick clients from your database — one shipment each.", "Un ramassage pour le lot, puis choisissez des clients de votre base — un envoi chacun.")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => setShowDrafts((v) => !v)}>
            <FolderOpen size={16} strokeWidth={2} /> {t("Saved batches", "Lots enregistrés")}{drafts.length ? ` (${drafts.length})` : ""}
          </button>
          {(selectedIds.length > 0 || curDraft) && <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={newBatch}><FilePlus2 size={16} strokeWidth={2} /> {t("New batch", "Nouveau lot")}</button>}
        </div>
      </div>

      {/* Saved batches panel */}
      {showDrafts && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Layers size={16} strokeWidth={2} /><b>{t("Saved batches", "Lots enregistrés")}</b>
            <span className="sub" style={{ marginLeft: "auto", fontSize: 12 }}>{t("Load one to edit and reuse it.", "Chargez-en un pour le modifier et le réutiliser.")}</span>
          </div>
          {drafts.length === 0 ? (
            <div className="sub" style={{ fontSize: 12.5 }}>{t("No saved batches yet — build a selection and click Save batch.", "Aucun lot enregistré — composez une sélection puis cliquez sur Enregistrer le lot.")}</div>
          ) : (
            <table>
              <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Recipients", "Destinataires")}</th><th>{t("Created", "Créé")}</th><th>{t("Updated", "Modifié")}</th><th></th></tr></thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id} style={{ background: curDraft === d.id ? "rgba(225,29,107,0.05)" : undefined }}>
                    <td><b>{d.name}</b>{curDraft === d.id ? <span className="pill pg" style={{ marginLeft: 8, fontSize: 11 }}>{t("editing", "en cours")}</span> : null}</td>
                    <td>{d.item_count}</td>
                    <td className="sub" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{whenLong(d.created_at)}</td>
                    <td className="sub" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{whenLong(d.updated_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: "5px 11px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }} disabled={busy} onClick={() => loadDraft(d)}><FolderOpen size={13} strokeWidth={2.2} /> {t("Load", "Charger")}</button>
                      <button className="btn ghost" title={t("Rename", "Renommer")} style={{ padding: "5px 9px", fontSize: 12, marginLeft: 6 }} onClick={() => renameDraft(d)}><Pencil size={13} strokeWidth={2.2} /></button>
                      <button className="btn ghost" title={t("Delete", "Supprimer")} style={{ padding: "5px 9px", fontSize: 12, marginLeft: 6, color: "var(--red,#c0263a)" }} onClick={() => deleteDraft(d)}><Trash2 size={13} strokeWidth={2.2} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {notice ? <div className="pill pg" style={{ display: "inline-block", marginTop: 12 }}>{notice}</div> : null}
      {result ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0", flexWrap: "wrap" }}>
          <div className="pill pg" style={{ display: "inline-block" }}>{result}</div>
          {batchCodes.length > 0 ? <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} onClick={printAllLabels}><Printer size={16} strokeWidth={2} /> {t(`Print all ${batchCodes.length} labels`, `Imprimer les ${batchCodes.length} étiquettes`)}</button> : null}
        </div>
      ) : null}

      {/* Batch pickup */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="mono">{t("Pickup for the whole batch", "Ramassage pour tout le lot")}</div>
        <div className="row" style={{ gap: 8, marginTop: 6, marginBottom: 10 }}>
          {(["door", "hub", "zone"] as const).map((p) => (
            <button key={p} className={"chip" + (ptype === p ? " on" : "")} onClick={() => setPtype(p)}>
              {p === "door" ? t("Door pickup", "Ramassage à l’adresse") : p === "hub" ? t("Drop at hub", "Dépôt au point relais") : t("LoadQ zone", "Zone LoadQ")}
            </button>
          ))}
        </div>
        {ptype === "hub" ? (
          <select className="input" value={hubId} onChange={(e) => setHubId(e.target.value)}>
            <option value="">{t("Select a hub…", "Choisir un point relais…")}</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}{h.city ? ` · ${h.city}` : ""}</option>)}
          </select>
        ) : (
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 2 }}><div className="mono">{t("Pickup address", "Adresse de ramassage")}</div><input className="input" value={pickupAddr} onChange={(e) => setPickupAddr(e.target.value)} placeholder={t("Where the courier collects", "Où le coursier récupère")} /></div>
            <div style={{ flex: 1 }}><div className="mono">{t("From city", "Ville de départ")}</div><input className="input" value={fromCity} onChange={(e) => setFromCity(e.target.value)} /></div>
          </div>
        )}
      </div>

      {/* Clients */}
      <div className="toolbar" style={{ marginTop: 14 }}>
        <input className="search" placeholder={t("Search your clients…", "Rechercher vos clients…")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="sub">{selectedIds.length} {t("selected", "sélectionnés")}</span>
      </div>
      <table>
        <thead><tr><th></th><th>{t("Client", "Client")}</th><th>{t("Delivery address", "Adresse de livraison")}</th><th>{t("Destination", "Destination")}</th><th>{t("Size", "Taille")}</th><th>{t("Contents", "Contenu")}</th><th>{t("Price", "Prix")}</th></tr></thead>
        <tbody>
          {filtered.map((c) => {
            const on = !!rows[c.id]; const idx = selectedIds.indexOf(c.id);
            const price = on && quote ? quote.rows.find((q) => q.index === idx + 1)?.price_cents : null;
            return (
              <tr key={c.id} style={{ background: on ? "rgba(225,29,107,0.04)" : undefined }}>
                <td><input type="checkbox" checked={on} onChange={() => toggle(c)} /></td>
                <td style={{ position: "relative" }}>
                  <a href={`/shipper/clients/${c.id}`} style={{ color: "#B81558", fontWeight: 800, textDecoration: "none" }}>{c.full_name}</a>
                  {c.mobile ? <div className="sub" style={{ fontSize: 12 }}>{c.mobile}</div> : null}
                  <button type="button" onClick={() => openHistory(c.id)} style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 5, background: "#FBF3F7", border: "1px solid #f0d8e5", color: "#B81558", borderRadius: 8, padding: "4px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}><History size={13} strokeWidth={2.2} /> {t("From history", "Historique")}</button>
                  {histFor === c.id && (
                    <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, width: 430, background: "#fff", border: "1px solid #E4E0D8", borderRadius: 12, boxShadow: "0 12px 34px rgba(0,0,0,.16)", padding: 8 }} onClick={(e) => e.stopPropagation()}>
                      <div className="mono" style={{ padding: "6px 8px" }}>📦 {t("Reuse a past shipment", "Réutiliser un envoi passé")}</div>
                      {histLoading && !histRows[c.id] ? <div className="sub" style={{ padding: 8 }}>{t("Loading…", "Chargement…")}</div> : null}
                      {!histLoading && (histRows[c.id] || []).length === 0 ? <div className="sub" style={{ padding: 8 }}>{t("No past shipments for this customer.", "Aucun envoi passé pour ce client.")}</div> : null}
                      {(histRows[c.id] || []).slice(0, 6).map((h) => (
                        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px", borderRadius: 9, fontSize: 12.5 }}>
                          <span style={{ whiteSpace: "nowrap" }}>{when(h.created_at)}</span>
                          <span className="sub">{h.to_city}{h.dropoff_type === "hub" ? " · hub" : ""} · {h.size}</span>
                          <span style={{ marginLeft: "auto", color: "var(--green,#178a5e)", fontWeight: 800 }}>{money(h.price_cents)}</span>
                          <button type="button" className="btn" style={{ padding: "5px 12px", fontSize: 11.5 }} onClick={() => applyHistory(c.id, h)}>{t("Use", "Utiliser")}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td>{on ? <input className="input" style={{ padding: "6px 9px", fontSize: 12.5 }} value={rows[c.id].to_address} onChange={(e) => setRow(c.id, "to_address", e.target.value)} /> : <span className="sub" style={{ fontSize: 12 }}>{c.address || "—"}</span>}</td>
                <td>{on ? <input className="input" style={{ padding: "6px 9px", fontSize: 12.5, width: 120 }} value={rows[c.id].to_city} onChange={(e) => setRow(c.id, "to_city", e.target.value)} /> : <span className="sub" style={{ fontSize: 12 }}>{c.city || "—"}</span>}</td>
                <td>{on ? (
                  <select className="input" style={{ padding: "6px 9px", fontSize: 12.5 }} value={rows[c.id].size} onChange={(e) => setRow(c.id, "size", e.target.value)}>
                    <option value="envelope">{t("Envelope", "Enveloppe")}</option><option value="small">{t("Small", "Petit")}</option><option value="large">{t("Large", "Grand")}</option>
                  </select>) : <span className="sub">—</span>}</td>
                <td>{on ? <input className="input" style={{ padding: "6px 9px", fontSize: 12.5, width: 130 }} value={rows[c.id].contents} onChange={(e) => setRow(c.id, "contents", e.target.value)} placeholder={t("What's inside", "Contenu")} /> : <span className="sub" style={{ fontSize: 12 }}>—</span>}</td>
                <td style={{ color: "var(--green)", fontWeight: 800 }}>{price != null ? money(price) : (on ? "…" : "")}</td>
              </tr>
            );
          })}
          {filtered.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>{t("No clients — add some in the Clients tab first.", "Aucun client — ajoutez-en dans l’onglet Clients.")}</td></tr>}
        </tbody>
      </table>

      {/* Summary bar */}
      {selectedIds.length > 0 && (
        <div className="card" style={{ marginTop: 16, background: "#1A1F36", color: "#fff", display: "flex", alignItems: "center", gap: 20 }}>
          <div><div className="sub" style={{ color: "#c9c4d4" }}>{selectedIds.length} {t("clients selected", "clients sélectionnés")}</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{quote ? money(quote.total_cents) : "…"} {t("total", "au total")}</div></div>
          {err ? <div className="warn" style={{ marginLeft: "auto", marginRight: 12 }}>{err}</div> : null}
          <button className="btn ghost" style={{ marginLeft: err ? 0 : "auto", display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.28)" }} disabled={busy} onClick={openSave}>
            <Save size={16} strokeWidth={2} /> {curDraft ? t("Update saved batch", "Mettre à jour le lot") : t("Save batch", "Enregistrer le lot")}
          </button>
          <button className="btn" disabled={busy} onClick={openPreview}>
            {t(`Review ${selectedIds.length} shipments →`, `Vérifier ${selectedIds.length} envois →`)}
          </button>
        </div>
      )}
      {err && selectedIds.length === 0 ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}

      {/* Name & save the batch */}
      {saveOpen && (
        <div className="modalbg" onClick={() => !busy && setSaveOpen(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}><Save size={18} strokeWidth={2} /> {curDraft ? t("Update saved batch", "Mettre à jour le lot") : t("Save this batch", "Enregistrer ce lot")}</h2>
              <button className="btn ghost" onClick={() => !busy && setSaveOpen(false)}>✕</button>
            </div>
            <div className="sub" style={{ marginTop: 4 }}>{t(`Saves ${selectedIds.length} recipient(s) and the batch pickup so you can reuse it later.`, `Enregistre ${selectedIds.length} destinataire(s) et le ramassage du lot pour le réutiliser plus tard.`)}</div>
            <p className="mono" style={{ marginTop: 12 }}>{t("Batch name", "Nom du lot")}</p>
            <input className="input" autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={defaultName()} onKeyDown={(e) => { if (e.key === "Enter") saveDraft(); }} />
            {err ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={saveDraft}>{busy ? t("Saving…", "Enregistrement…") : t("Save", "Enregistrer")}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setSaveOpen(false)}>{t("Cancel", "Annuler")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Review before final submit */}
      {preview && (
        <div className="modalbg" onClick={() => !busy && setPreview(false)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: "86vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>{t("Review batch", "Vérifier le lot")}</h2>
              <button className="btn ghost" onClick={() => !busy && setPreview(false)}>✕</button>
            </div>
            <div className="sub" style={{ marginTop: 4 }}>
              {t("Nothing is created until you confirm. Pickup for the whole batch:", "Rien n’est créé avant votre confirmation. Ramassage pour tout le lot :")} <b>{ptype === "hub" ? t("Drop at hub", "Dépôt au point relais") : ptype === "zone" ? t("LoadQ zone", "Zone LoadQ") : t("Door pickup", "Ramassage à l’adresse")} · {pickupLabel}</b>
            </div>
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>#</th><th>{t("Recipient", "Destinataire")}</th><th>{t("Destination", "Destination")}</th><th>{t("Size", "Taille")}</th><th style={{ textAlign: "right" }}>{t("Price", "Prix")}</th></tr></thead>
              <tbody>
                {previewLines.map((l, i) => (
                  <tr key={l.id}>
                    <td style={{ color: "var(--t3)" }}>{i + 1}</td>
                    <td><b>{l.name}</b>{l.to_address ? <div className="sub" style={{ fontSize: 11.5 }}>{l.to_address}</div> : null}{l.contents ? <div className="sub" style={{ fontSize: 11.5 }}>📦 {l.contents}</div> : null}</td>
                    <td>{l.to_city || "—"}</td>
                    <td>{l.size}</td>
                    <td style={{ textAlign: "right", color: "var(--green)", fontWeight: 800 }}>{l.price_cents != null ? money(l.price_cents) : "…"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card" style={{ marginTop: 14, background: "#1A1F36", color: "#fff", display: "flex", alignItems: "center", gap: 16 }}>
              <div><div className="sub" style={{ color: "#c9c4d4" }}>{selectedIds.length} {t("shipments", "envois")}</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{quote ? money(quote.total_cents) : "…"} {t("total", "au total")}</div></div>
              <div className="sub" style={{ marginLeft: "auto", maxWidth: 260, color: "#c9c4d4", fontSize: 12 }}>💳 {t("For pay-as-you-go accounts, the card on file is charged when you confirm.", "Pour les comptes à l’usage, la carte enregistrée est débitée à la confirmation.")}</div>
            </div>
            {err ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={create}>{busy ? t("Creating…", "Création…") : t(`✓ Confirm & create ${selectedIds.length}`, `✓ Confirmer et créer ${selectedIds.length}`)}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setPreview(false)}>{t("← Back / edit", "← Retour / modifier")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
