"use client";
import { useEffect, useMemo, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Row = { size: string; to_city: string; to_address: string };

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

  useEffect(() => {
    org.clients(active.org_id).then(setClients).catch(() => {});
    org.hubs(active.org_id).then(setHubs).catch(() => {});
  }, [active.org_id]);

  const filtered = clients.filter((c) => !search || `${c.full_name} ${c.email} ${c.city}`.toLowerCase().includes(search.toLowerCase()));
  const selectedIds = Object.keys(rows);
  const pickup = useMemo(() => ({ dropoff_type: ptype, hub_id: ptype === "hub" ? hubId : "", pickup_addr: ptype !== "hub" ? pickupAddr : "", from_city: fromCity }), [ptype, hubId, pickupAddr, fromCity]);

  const shipRows = () => selectedIds.map((id) => {
    const c = clients.find((x) => x.id === id); const o = rows[id];
    return { to_name: c?.full_name, to_email: c?.email, to_phone: c?.mobile, to_address: o.to_address, to_city: o.to_city, size: o.size, lang };
  });

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
    else n[c.id] = { size: "small", to_city: c.city || "", to_address: c.address || "" };
    return n;
  });
  const setRow = (id: string, k: keyof Row, v: string) => setRows((s) => ({ ...s, [id]: { ...s[id], [k]: v } }));

  const create = async () => {
    if (ptype === "hub" && !hubId) { setErr(t("Choose a pickup hub.", "Choisissez un point relais.")); return; }
    if (ptype !== "hub" && !pickupAddr.trim()) { setErr(t("Enter the pickup address.", "Entrez l’adresse de ramassage.")); return; }
    if (selectedIds.length === 0) { setErr(t("Select at least one client.", "Sélectionnez au moins un client.")); return; }
    if (selectedIds.some((id) => !rows[id].to_city.trim())) { setErr(t("Every selected client needs a destination city.", "Chaque client doit avoir une ville de destination.")); return; }
    setBusy(true); setErr(""); setResult("");
    try {
      const res = await org.bulkShip(active.org_id, pickup, shipRows());
      const created = (res.results || []).filter((x: any) => x.ok);
      const failed = (res.results || []).filter((x: any) => !x.ok);
      if (res.payg) await Promise.all(created.map((x: any) => org.chargeShipment(active.org_id, x.id).catch(() => {})));
      setRows({});
      setResult(t(`✓ Created ${created.length} shipment(s)${res.payg ? " and charged the card on file" : ""}.${failed.length ? ` ${failed.length} failed.` : ""}`,
        `✓ ${created.length} envoi(s) créé(s)${res.payg ? " et débités sur la carte" : ""}.${failed.length ? ` ${failed.length} en échec.` : ""}`));
    } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  return (
    <>
      <h1>{t("Bulk shipment", "Envoi en lot")}</h1>
      <div className="sub">{t("One pickup for the batch, then pick clients from your database — one shipment each.", "Un ramassage pour le lot, puis choisissez des clients de votre base — un envoi chacun.")}</div>
      {result ? <div className="pill pg" style={{ display: "inline-block", margin: "10px 0" }}>{result}</div> : null}

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
        <thead><tr><th></th><th>{t("Client", "Client")}</th><th>{t("Delivery address", "Adresse de livraison")}</th><th>{t("Destination", "Destination")}</th><th>{t("Size", "Taille")}</th><th>{t("Price", "Prix")}</th></tr></thead>
        <tbody>
          {filtered.map((c) => {
            const on = !!rows[c.id]; const idx = selectedIds.indexOf(c.id);
            const price = on && quote ? quote.rows.find((q) => q.index === idx + 1)?.price_cents : null;
            return (
              <tr key={c.id} style={{ background: on ? "rgba(225,29,107,0.04)" : undefined }}>
                <td><input type="checkbox" checked={on} onChange={() => toggle(c)} /></td>
                <td><b>{c.full_name}</b>{c.mobile ? <div className="sub" style={{ fontSize: 12 }}>{c.mobile}</div> : null}</td>
                <td>{on ? <input className="input" style={{ padding: "6px 9px", fontSize: 12.5 }} value={rows[c.id].to_address} onChange={(e) => setRow(c.id, "to_address", e.target.value)} /> : <span className="sub" style={{ fontSize: 12 }}>{c.address || "—"}</span>}</td>
                <td>{on ? <input className="input" style={{ padding: "6px 9px", fontSize: 12.5, width: 120 }} value={rows[c.id].to_city} onChange={(e) => setRow(c.id, "to_city", e.target.value)} /> : <span className="sub" style={{ fontSize: 12 }}>{c.city || "—"}</span>}</td>
                <td>{on ? (
                  <select className="input" style={{ padding: "6px 9px", fontSize: 12.5 }} value={rows[c.id].size} onChange={(e) => setRow(c.id, "size", e.target.value)}>
                    <option value="envelope">{t("Envelope", "Enveloppe")}</option><option value="small">{t("Small", "Petit")}</option><option value="large">{t("Large", "Grand")}</option>
                  </select>) : <span className="sub">—</span>}</td>
                <td style={{ color: "var(--green)", fontWeight: 800 }}>{price != null ? money(price) : (on ? "…" : "")}</td>
              </tr>
            );
          })}
          {filtered.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No clients — add some in the Clients tab first.", "Aucun client — ajoutez-en dans l’onglet Clients.")}</td></tr>}
        </tbody>
      </table>

      {/* Summary bar */}
      {selectedIds.length > 0 && (
        <div className="card" style={{ marginTop: 16, background: "#1A1F36", color: "#fff", display: "flex", alignItems: "center", gap: 20 }}>
          <div><div className="sub" style={{ color: "#c9c4d4" }}>{selectedIds.length} {t("clients selected", "clients sélectionnés")}</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{quote ? money(quote.total_cents) : "…"} {t("total", "au total")}</div></div>
          {err ? <div className="warn" style={{ marginLeft: "auto", marginRight: 12 }}>{err}</div> : null}
          <button className="btn" style={{ marginLeft: err ? 0 : "auto" }} disabled={busy} onClick={create}>
            {busy ? t("Creating…", "Création…") : t(`Create ${selectedIds.length} shipments →`, `Créer ${selectedIds.length} envois →`)}
          </button>
        </div>
      )}
      {err && selectedIds.length === 0 ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}
    </>
  );
}
