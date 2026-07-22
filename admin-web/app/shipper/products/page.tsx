"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

type Product = {
  id: string; product_code: string; name: string; description: string | null;
  price_cents: number; qty_in_stock: number; low_stock_at: number; allow_backorder: boolean;
  sku: string | null; category: string | null; weight_g: number | null; default_size: string | null;
  declared_value_cents: number | null; handling_notes: string | null; image_url: string | null; active: boolean;
};
// Edit form uses dollar strings for money; converted to cents in org.productSave.
type Edit = Partial<Product> & { price?: string; declared_value?: string };

const money = (c: number | null | undefined) => `$${(((c ?? 0) as number) / 100).toFixed(2)}`;
const toEdit = (p: Product): Edit => ({ ...p, price: (p.price_cents / 100).toFixed(2), declared_value: p.declared_value_cents != null ? (p.declared_value_cents / 100).toFixed(2) : "" });
const EMPTY: Edit = { name: "", description: "", price: "", qty_in_stock: 0, low_stock_at: 0, sku: "", category: "", weight_g: undefined, default_size: "large", declared_value: "", handling_notes: "", image_url: null, active: true, allow_backorder: false };

function statusPill(p: Product, t: (a: string, b: string) => string) {
  if (p.qty_in_stock <= 0) return <span className="pill pred">{t("Out of stock", "Rupture")}</span>;
  if (p.qty_in_stock <= p.low_stock_at) return <span className="pill pgold">{t("Low stock", "Stock bas")}</span>;
  return <span className="pill pg">{t("In stock", "En stock")}</span>;
}

// Minimal CSV parse (handles quoted fields + escaped quotes), mirrors /shipper/import.
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim().toLowerCase());
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export default function Products() {
  const { active } = useOrg();
  const { t } = useLang();
  const [rows, setRows] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [bulk, setBulk] = useState<{ text: string; result?: { created: number; failed: number; errors: any[] } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => org.products(active.org_id, search || null, status).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id, status]);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const set = (k: string, v: any) => setEdit((s) => ({ ...s, [k]: v }));

  const uploadImage = async (f: File) => {
    setBusy(true); setErr("");
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      const path = `${active.org_id}/${(globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2))}.${ext}`;
      const { error } = await supabase.storage.from("org-products").upload(path, f, { upsert: true, contentType: f.type });
      if (error) throw error;
      const { data } = supabase.storage.from("org-products").getPublicUrl(path);
      set("image_url", data.publicUrl);
    } catch (e: any) { setErr(e?.message || t("Upload failed.", "Échec du téléversement.")); }
    setBusy(false);
  };

  const save = async () => {
    if (!edit?.name?.trim()) { setErr(t("Product name is required.", "Le nom du produit est requis.")); return; }
    setBusy(true); setErr("");
    try { await org.productSave(active.org_id, edit); setEdit(null); flash(t("Product saved.", "Produit enregistré.")); load(); }
    catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };
  const del = async (p: Product) => {
    if (!confirm(t(`Delete ${p.name}?`, `Supprimer ${p.name} ?`))) return;
    try { await org.productDelete(active.org_id, p.id); load(); } catch (e: any) { setErr(e?.message || ""); }
  };

  const runBulk = async () => {
    if (!bulk) return;
    setBusy(true); setErr("");
    try {
      const parsed = parseCSV(bulk.text);
      if (!parsed.length) { setErr(t("No rows found. Include a header row.", "Aucune ligne. Incluez une ligne d’en-tête.")); setBusy(false); return; }
      const result = await org.productsBulkImport(active.org_id, parsed);
      setBulk({ ...bulk, result }); flash(t(`Imported ${result.created}.`, `${result.created} importés.`)); load();
    } catch (e: any) { setErr(e?.message || t("Import failed.", "Échec de l’import.")); }
    setBusy(false);
  };

  const CHIPS: [string, string][] = [["all", t("All", "Tous")], ["in_stock", t("In stock", "En stock")], ["low", t("Low", "Bas")], ["out", t("Out", "Rupture")]];

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("Products", "Produits")}</h1><div className="sub">{active.name} · {rows.length} {t("products", "produits")}</div></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={() => { setErr(""); setBulk({ text: "" }); }}>↥ {t("Bulk upload", "Import en lot")}</button>
          <button className="btn" onClick={() => { setErr(""); setEdit({ ...EMPTY }); }}>+ {t("Add product", "Ajouter un produit")}</button>
        </div>
      </div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", margin: "8px 0" }}>{msg}</div> : null}
      <div className="toolbar">
        <input className="search" placeholder={t("Search name, SKU, code, category…", "Rechercher nom, SKU, code, catégorie…")} value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn ghost" onClick={load}>{t("Search", "Rechercher")}</button>
        <div className="row" style={{ gap: 6, marginLeft: 8 }}>
          {CHIPS.map(([k, lbl]) => (
            <button key={k} className={"chip" + (status === k ? " on" : "")} onClick={() => setStatus(k)}>{lbl}</button>
          ))}
        </div>
      </div>
      <table>
        <thead><tr>
          <th></th><th>{t("Product #", "N° produit")}</th><th>{t("Name", "Nom")}</th><th>{t("Price / unit", "Prix / unité")}</th>
          <th>{t("In stock", "En stock")}</th><th>{t("Status", "Statut")}</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.image_url
                ? <img src={p.image_url} alt="" style={{ width: 42, height: 42, borderRadius: 9, objectFit: "cover", background: "#f0ebe0" }} />
                : <span style={{ display: "inline-block", width: 42, height: 42, borderRadius: 9, background: "#f0ebe0" }} />}</td>
              <td style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, color: "#B81558", fontWeight: 700 }}>{p.product_code}</td>
              <td><b>{p.name}</b>{p.description ? <div className="sub" style={{ fontSize: 12 }}>{p.description}</div> : null}{!p.active ? <span className="pill pgrey" style={{ marginLeft: 6 }}>{t("Hidden", "Masqué")}</span> : null}</td>
              <td>{money(p.price_cents)}</td>
              <td>{p.qty_in_stock}{p.allow_backorder ? <div className="sub" style={{ fontSize: 11 }}>{t("backorder ok", "commande en attente")}</div> : null}</td>
              <td>{statusPill(p, t)}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <a className="btn ghost" href={`/shipper/products/order?product=${p.id}`}>{t("→ Order", "→ Commander")}</a>
                <button className="btn ghost" onClick={() => { setErr(""); setEdit(toEdit(p)); }}>{t("Edit", "Modifier")}</button>
                <button className="btn ghost" onClick={() => del(p)}>{t("Delete", "Supprimer")}</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} style={{ color: "var(--t3)" }}>{t("No products yet — add your first, or bulk upload.", "Aucun produit — ajoutez le premier ou importez en lot.")}</td></tr>}
        </tbody>
      </table>

      {/* Add / edit modal */}
      {edit && (
        <div className="modalbg" onClick={() => !busy && setEdit(null)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px" }}>{edit.id ? t("Edit product", "Modifier le produit") : t("Add product", "Ajouter un produit")}</h2>
            {err ? <div className="pill pred" style={{ display: "inline-block", marginBottom: 10 }}>{err}</div> : null}
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: "0 0 110px" }}>
                <label className="mono">{t("Picture", "Photo")}</label>
                <div onClick={() => fileRef.current?.click()} style={{ cursor: "pointer", border: "2px dashed #d8cfc0", borderRadius: 12, height: 110, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#fbfaf6" }}>
                  {edit.image_url ? <img src={edit.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span className="sub" style={{ fontSize: 12, textAlign: "center" }}>📷<br />{t("Upload", "Téléverser")}</span>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="mono">{t("Product name", "Nom du produit")} *</label>
                <input className="input" value={edit.name || ""} onChange={(e) => set("name", e.target.value)} />
                <div style={{ height: 10 }} />
                <label className="mono">{t("Description", "Description")}</label>
                <input className="input" value={edit.description || ""} onChange={(e) => set("description", e.target.value)} />
              </div>
            </div>
            <div style={{ height: 12 }} />
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}><label className="mono">{t("Price / unit (CAD)", "Prix / unité (CAD)")}</label><input className="input" inputMode="decimal" value={edit.price || ""} onChange={(e) => set("price", e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Qty in stock", "Qté en stock")}</label><input className="input" inputMode="numeric" value={edit.qty_in_stock ?? 0} onChange={(e) => set("qty_in_stock", e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Low-stock at", "Seuil bas")}</label><input className="input" inputMode="numeric" value={edit.low_stock_at ?? 0} onChange={(e) => set("low_stock_at", e.target.value)} /></div>
            </div>
            <div style={{ height: 12 }} />
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}><label className="mono">{t("SKU / barcode", "SKU / code-barres")}</label><input className="input" value={edit.sku || ""} onChange={(e) => set("sku", e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Category", "Catégorie")}</label><input className="input" value={edit.category || ""} onChange={(e) => set("category", e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Weight (g)", "Poids (g)")}</label><input className="input" inputMode="numeric" value={edit.weight_g ?? ""} onChange={(e) => set("weight_g", e.target.value)} /></div>
            </div>
            <div style={{ height: 12 }} />
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="mono">{t("Default ship size", "Taille d’envoi")}</label>
                <select className="input" value={edit.default_size || "large"} onChange={(e) => set("default_size", e.target.value)}>
                  <option value="envelope">{t("Envelope", "Enveloppe")}</option>
                  <option value="small">{t("Small", "Petit")}</option>
                  <option value="large">{t("Large", "Grand")}</option>
                </select>
              </div>
              <div style={{ flex: 1 }}><label className="mono">{t("Declared value (CAD)", "Valeur déclarée (CAD)")}</label><input className="input" inputMode="decimal" value={edit.declared_value || ""} onChange={(e) => set("declared_value", e.target.value)} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Handling notes", "Notes de manutention")}</label><input className="input" value={edit.handling_notes || ""} onChange={(e) => set("handling_notes", e.target.value)} /></div>
            </div>
            <div style={{ height: 12 }} />
            <div className="row" style={{ gap: 18 }}>
              <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={edit.active !== false} onChange={(e) => set("active", e.target.checked)} /> {t("Active (visible)", "Actif (visible)")}</label>
              <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={!!edit.allow_backorder} onChange={(e) => set("allow_backorder", e.target.checked)} /> {t("Allow backorder", "Autoriser commande en attente")}</label>
            </div>
            <div className="row" style={{ gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn ghost" disabled={busy} onClick={() => setEdit(null)}>{t("Cancel", "Annuler")}</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? t("Saving…", "Enregistrement…") : t("Save product", "Enregistrer")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk upload modal */}
      {bulk && (
        <div className="modalbg" onClick={() => !busy && setBulk(null)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 4px" }}>{t("Bulk upload products", "Import de produits en lot")}</h2>
            <div className="sub" style={{ marginBottom: 10 }}>{t("Paste CSV or choose a file. Header row required.", "Collez un CSV ou choisissez un fichier. Ligne d’en-tête requise.")}</div>
            {err ? <div className="pill pred" style={{ display: "inline-block", marginBottom: 10 }}>{err}</div> : null}
            <div className="warn" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, marginBottom: 10 }}>name, description, price, qty, sku, category, weight_g, default_size, image_url</div>
            <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBulk({ text: await f.text() }); }} style={{ marginBottom: 10 }} />
            <textarea className="input" style={{ height: 160, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} placeholder={"name,price,qty\nPalm Oil 5L,28.00,140"} value={bulk.text} onChange={(e) => setBulk({ text: e.target.value })} />
            {bulk.result ? (
              <div style={{ marginTop: 10 }}>
                <span className="pill pg">{bulk.result.created} {t("created", "créés")}</span>{" "}
                {bulk.result.failed ? <span className="pill pred">{bulk.result.failed} {t("failed", "échoués")}</span> : null}
                {bulk.result.errors?.slice(0, 5).map((x: any, i: number) => <div key={i} className="sub" style={{ fontSize: 11.5 }}>{t("row", "ligne")} {x.row}: {x.error}</div>)}
              </div>
            ) : null}
            <div className="row" style={{ gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn ghost" disabled={busy} onClick={() => setBulk(null)}>{t("Close", "Fermer")}</button>
              <button className="btn" disabled={busy || !bulk.text.trim()} onClick={runBulk}>{busy ? t("Importing…", "Import…") : t("Import", "Importer")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
