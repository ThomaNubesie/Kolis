"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

type Promo = { id: string; name: string; discount_pct: number | null; product_ids: string[]; starts_at: string | null; ends_at: string | null; active: boolean };
type Product = { id: string; product_code: string; name: string; price_cents: number };
const EMPTY: Partial<Promo> = { name: "", discount_pct: null, product_ids: [], starts_at: "", ends_at: "", active: true };

export default function Promotions() {
  const { active } = useOrg();
  const { t } = useLang();
  const [rows, setRows] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [edit, setEdit] = useState<Partial<Promo> | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => org.promotions(active.org_id).then(setRows).catch(() => {});
  useEffect(() => {
    load();
    org.products(active.org_id, null, "all").then(setProducts).catch(() => {});
    // eslint-disable-next-line
  }, [active.org_id]);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const name = (id: string) => products.find((p) => p.id === id)?.name || "—";
  const toggleProd = (id: string) => setEdit((s) => { const cur = s?.product_ids || []; return { ...s, product_ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }; });

  const save = async () => {
    if (!edit?.name?.trim()) { setErr(t("Name is required.", "Le nom est requis.")); return; }
    setBusy(true); setErr("");
    try { await org.promotionSave(active.org_id, edit); setEdit(null); flash(t("Promotion saved.", "Promotion enregistrée.")); load(); }
    catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };
  const del = async (p: Promo) => { if (!confirm(t(`Delete ${p.name}?`, `Supprimer ${p.name} ?`))) return; try { await org.promotionDelete(active.org_id, p.id); load(); } catch { /* */ } };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("Promotions", "Promotions")}</h1><div className="sub">{active.name} · {rows.length}</div></div>
        <button className="btn" onClick={() => { setErr(""); setEdit({ ...EMPTY }); }}>+ {t("New promotion", "Nouvelle promotion")}</button>
      </div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", margin: "8px 0" }}>{msg}</div> : null}
      <table style={{ marginTop: 10 }}>
        <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Discount", "Rabais")}</th><th>{t("Products", "Produits")}</th><th>{t("Window", "Période")}</th><th>{t("Status", "Statut")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><b>{p.name}</b></td>
              <td>{p.discount_pct ? `${p.discount_pct}%` : "—"}</td>
              <td className="sub" style={{ fontSize: 12 }}>{p.product_ids?.length ? p.product_ids.slice(0, 3).map(name).join(", ") + (p.product_ids.length > 3 ? ` +${p.product_ids.length - 3}` : "") : "—"}</td>
              <td className="sub" style={{ fontSize: 12 }}>{[p.starts_at, p.ends_at].filter(Boolean).join(" → ") || "—"}</td>
              <td>{p.active ? <span className="pill pg">{t("Active", "Active")}</span> : <span className="pill pgrey">{t("Off", "Inactive")}</span>}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <a className="btn ghost" href={`/shipper/campaigns?promo=${p.id}`}>{t("→ Campaign", "→ Campagne")}</a>
                <button className="btn ghost" onClick={() => { setErr(""); setEdit({ ...p, starts_at: p.starts_at || "", ends_at: p.ends_at || "" }); }}>{t("Edit", "Modifier")}</button>
                <button className="btn ghost" onClick={() => del(p)}>{t("Delete", "Supprimer")}</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="sub">{t("No promotions yet.", "Aucune promotion.")}</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modalbg" onClick={() => !busy && setEdit(null)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px" }}>{edit.id ? t("Edit promotion", "Modifier la promotion") : t("New promotion", "Nouvelle promotion")}</h2>
            {err ? <div className="pill pred" style={{ display: "inline-block", marginBottom: 10 }}>{err}</div> : null}
            <label className="mono">{t("Name", "Nom")} *</label>
            <input className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="row" style={{ gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1 }}><label className="mono">{t("Discount %", "Rabais %")}</label><input className="input" inputMode="numeric" value={edit.discount_pct ?? ""} onChange={(e) => setEdit({ ...edit, discount_pct: e.target.value ? parseInt(e.target.value) : null })} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Starts", "Début")}</label><input className="input" type="date" value={edit.starts_at || ""} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label className="mono">{t("Ends", "Fin")}</label><input className="input" type="date" value={edit.ends_at || ""} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></div>
            </div>
            <label className="mono" style={{ marginTop: 12 }}>{t("Products", "Produits")}</label>
            <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--line)", borderRadius: 9, padding: 8 }}>
              {products.map((p) => (
                <label key={p.id} className="row" style={{ gap: 8, fontSize: 13, padding: "3px 0" }}>
                  <input type="checkbox" checked={(edit.product_ids || []).includes(p.id)} onChange={() => toggleProd(p.id)} />
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "#B81558" }}>{p.product_code}</span> {p.name}
                </label>
              ))}
              {products.length === 0 && <div className="sub">{t("No products in catalog yet.", "Aucun produit au catalogue.")}</div>}
            </div>
            <label className="row" style={{ gap: 6, fontSize: 13, marginTop: 12 }}><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t("Active", "Active")}</label>
            <div className="row" style={{ gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn ghost" disabled={busy} onClick={() => setEdit(null)}>{t("Cancel", "Annuler")}</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? t("Saving…", "…") : t("Save", "Enregistrer")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
