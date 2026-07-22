"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

type Product = { id: string; product_code: string; name: string; price_cents: number; qty_in_stock: number; allow_backorder: boolean; default_size: string | null; active: boolean };
type Client = { id: string; full_name: string; email: string | null; mobile: string | null; address: string | null; city: string | null; province: string | null };
type Line = { product_id: string; qty: number };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

function OrderBuilder() {
  const { active } = useOrg();
  const { t } = useLang();
  const qs = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(qs.get("client") || "");
  const [client, setClient] = useState<Client | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [dropoff, setDropoff] = useState("door");
  const [size, setSize] = useState("small");
  const [insured, setInsured] = useState(false);
  const [quote, setQuote] = useState<number | null>(null);
  const [tax, setTax] = useState<{ rate: number; label: string } | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ code: string; charged?: boolean } | null>(null);

  // initial load: catalog + clients + tax + optional prefill from query params
  useEffect(() => {
    org.products(active.org_id, null, "all").then((p) => setProducts(p.filter((x: Product) => x.active))).catch(() => {});
    org.clients(active.org_id).then(setClients).catch(() => {});
    org.tax(active.org_id).then((x: any) => setTax({ rate: x.rate, label: x.label })).catch(() => {});
    const pre = qs.get("product");
    if (pre) setLines([{ product_id: pre, qty: 1 }]);
    // eslint-disable-next-line
  }, [active.org_id]);

  // when a client is chosen, prefill destination
  useEffect(() => {
    if (!clientId) { setClient(null); return; }
    org.clientGet(active.org_id, clientId).then((c: Client) => {
      setClient(c); if (c?.city && !toCity) setToCity(c.city);
    }).catch(() => {});
    // eslint-disable-next-line
  }, [clientId]);

  // live shipping quote
  useEffect(() => {
    if (!fromCity.trim() || !toCity.trim()) { setQuote(null); return; }
    let cancel = false;
    const id = setTimeout(() => {
      org.shipQuote(active.org_id, size, dropoff, fromCity.trim(), toCity.trim())
        .then((c) => !cancel && setQuote(c)).catch(() => !cancel && setQuote(null));
    }, 350);
    return () => { cancel = true; clearTimeout(id); };
  }, [active.org_id, size, dropoff, fromCity, toCity]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const goods = lines.reduce((s, l) => s + (byId[l.product_id]?.price_cents || 0) * l.qty, 0);
  const shipTax = quote != null && tax ? Math.round(quote * tax.rate) : 0;
  const billed = (quote || 0) + shipTax;

  const addLine = () => { if (pick && !lines.some((l) => l.product_id === pick)) { setLines([...lines, { product_id: pick, qty: 1 }]); setPick(""); } };
  const setQty = (pid: string, q: number) => setLines((ls) => ls.map((l) => (l.product_id === pid ? { ...l, qty: Math.max(1, q) } : l)));
  const removeLine = (pid: string) => setLines((ls) => ls.filter((l) => l.product_id !== pid));

  const create = async () => {
    if (!clientId) { setErr(t("Choose a client.", "Choisissez un client.")); return; }
    if (!lines.length) { setErr(t("Add at least one product.", "Ajoutez au moins un produit.")); return; }
    if (!fromCity.trim() || !toCity.trim()) { setErr(t("Origin and destination city are required.", "Ville d’origine et de destination requises.")); return; }
    setBusy(true); setErr("");
    try {
      const res = await org.createProductOrder(active.org_id, {
        client_id: clientId, dropoff_type: dropoff, size, from_city: fromCity.trim(), to_city: toCity.trim(),
        dropoff_addr: client?.address || null, items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })), insured,
      });
      let charged = false;
      if (res.payg && res.has_card) { try { await org.chargeShipment(active.org_id, res.id); charged = true; } catch { /* leave uncharged */ } }
      setDone({ code: res.code, charged });
    } catch (e: any) {
      const m = String(e?.message || "");
      setErr(m.includes("insufficient_stock") ? t("Not enough stock for one of the products.", "Stock insuffisant pour un des produits.")
        : m.includes("client_not_found") ? t("Client not found.", "Client introuvable.") : m || t("Failed.", "Échec."));
    }
    setBusy(false);
  };

  if (done) return (
    <div className="card" style={{ maxWidth: 460, marginTop: 20 }}>
      <h2 style={{ margin: "0 0 6px" }}>{t("Order created", "Commande créée")} · {done.code}</h2>
      <div className="sub">{t("Shipping order placed for", "Commande d’expédition créée pour")} {client?.full_name}. {done.charged ? t("Card charged for shipping.", "Carte débitée pour l’expédition.") : t("Billed on your invoice.", "Facturé sur votre facture.")}</div>
      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <Link className="btn" href="/shipper/shipments">{t("View shipments", "Voir les envois")}</Link>
        <button className="btn ghost" onClick={() => { setDone(null); setLines([]); }}>{t("New order", "Nouvelle commande")}</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("New product order", "Nouvelle commande produit")}</h1><div className="sub">{active.name} · {t("build a shipment from catalog products", "créez un envoi à partir du catalogue")}</div></div>
        <Link className="btn ghost" href="/shipper/products">{t("Back to products", "Retour aux produits")}</Link>
      </div>
      {err ? <div className="pill pred" style={{ display: "inline-block", margin: "10px 0" }}>{err}</div> : null}

      <div className="cols" style={{ gap: 16, marginTop: 8, alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <label className="mono">{t("Client", "Client")}</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">{t("— choose a client —", "— choisir un client —")}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.city ? ` · ${c.city}` : ""}</option>)}
          </select>
          {client ? <div className="sub" style={{ marginTop: 6 }}>{[client.address, client.city, client.province].filter(Boolean).join(", ")}</div> : null}

          <div className="row" style={{ gap: 12, marginTop: 14 }}>
            <div style={{ flex: 1 }}><label className="mono">{t("From city", "Ville d’origine")}</label><input className="input" value={fromCity} onChange={(e) => setFromCity(e.target.value)} placeholder="Ottawa" /></div>
            <div style={{ flex: 1 }}><label className="mono">{t("To city", "Ville de destination")}</label><input className="input" value={toCity} onChange={(e) => setToCity(e.target.value)} placeholder="Montreal" /></div>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1 }}><label className="mono">{t("Drop-off", "Livraison")}</label>
              <select className="input" value={dropoff} onChange={(e) => setDropoff(e.target.value)}>
                <option value="door">{t("Door", "Porte")}</option><option value="hub">{t("Hub", "Relais")}</option><option value="zone">{t("Zone", "Zone")}</option>
              </select></div>
            <div style={{ flex: 1 }}><label className="mono">{t("Size", "Taille")}</label>
              <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="envelope">{t("Envelope", "Enveloppe")}</option><option value="small">{t("Small", "Petit")}</option><option value="large">{t("Large", "Grand")}</option>
              </select></div>
          </div>
          <label className="row" style={{ gap: 6, fontSize: 13, marginTop: 12 }}><input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} /> {t("Insure the goods value", "Assurer la valeur des biens")}</label>
        </div>

        <div className="card" style={{ flex: 1.2, minWidth: 360 }}>
          <label className="mono">{t("Products (manifest)", "Produits (manifeste)")}</label>
          <div className="row" style={{ gap: 8 }}>
            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{t("— add a product —", "— ajouter un produit —")}</option>
              {products.filter((p) => !lines.some((l) => l.product_id === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.product_code} · {p.name} · {money(p.price_cents)} ({p.qty_in_stock})</option>
              ))}
            </select>
            <button className="btn ghost" onClick={addLine} disabled={!pick}>{t("Add", "Ajouter")}</button>
          </div>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>{t("Product", "Produit")}</th><th>{t("Unit", "Unité")}</th><th>{t("Qty", "Qté")}</th><th>{t("Line", "Ligne")}</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => { const p = byId[l.product_id]; if (!p) return null; return (
                <tr key={l.product_id}>
                  <td><span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "#B81558", fontWeight: 700 }}>{p.product_code}</span> {p.name}</td>
                  <td>{money(p.price_cents)}</td>
                  <td><input className="input" style={{ width: 60 }} inputMode="numeric" value={l.qty} onChange={(e) => setQty(l.product_id, parseInt(e.target.value) || 1)} />{!p.allow_backorder && l.qty > p.qty_in_stock ? <div className="pill pred" style={{ fontSize: 10, marginTop: 2 }}>{t("over stock", "dépasse le stock")}</div> : null}</td>
                  <td>{money(p.price_cents * l.qty)}</td>
                  <td><button className="btn ghost" onClick={() => removeLine(l.product_id)}>✕</button></td>
                </tr>
              ); })}
              {lines.length === 0 && <tr><td colSpan={5} className="sub">{t("No products added yet.", "Aucun produit ajouté.")}</td></tr>}
            </tbody>
          </table>

          <div style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10, fontSize: 13 }}>
            <div className="row" style={{ justifyContent: "space-between", color: "var(--t3)" }}><span>{t("Goods (manifest — not billed by Kolis)", "Biens (manifeste — non facturé par Kolis)")}</span><span>{money(goods)}</span></div>
            <div className="row" style={{ justifyContent: "space-between", color: "var(--t2)" }}><span>{t("Shipping", "Expédition")}{quote == null ? ` (${t("enter cities", "entrez les villes")})` : ""}</span><span>{quote == null ? "—" : money(quote)}</span></div>
            {quote != null && tax ? <div className="row" style={{ justifyContent: "space-between", color: "var(--t2)" }}><span>{t("Tax", "Taxe")} ({tax.label})</span><span>{money(shipTax)}</span></div> : null}
            <div className="row" style={{ justifyContent: "space-between", fontWeight: 800, marginTop: 4 }}><span>{t("Billed total", "Total facturé")}</span><span style={{ color: "var(--accent)" }}>{quote == null ? "—" : money(billed)}</span></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" disabled={busy || !clientId || !lines.length} onClick={create}>{busy ? t("Creating…", "Création…") : t("Create shipping order", "Créer la commande")}</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProductOrderPage() {
  return <Suspense fallback={null}><OrderBuilder /></Suspense>;
}
