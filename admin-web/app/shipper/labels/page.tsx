"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { Printer, ArrowLeft } from "lucide-react";
import KolisLabel from "@/components/KolisLabel";

// Print ALL labels for a batch at once — one label per page. Codes come from the
// ?codes=KL-1,KL-2 query, or from localStorage (set by the Bulk page's "Print all").
const batchCss = (thermal: boolean) => `
  @page { size: ${thermal ? "4in 6in" : "auto"}; margin: 0; }
  @media print {
    html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
    body * { visibility: hidden !important; }
    .batch, .batch * { visibility: visible !important; }
    .batch { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
    .sheet { page-break-after: always; break-after: page; min-height: ${thermal ? "6in" : "100vh"}; display: flex; flex-direction: column; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .sheet .label { width: ${thermal ? "4in" : "100%"} !important; max-width: none !important; min-height: ${thermal ? "6in" : "100vh"} !important; flex: 1 1 auto !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; margin: 0 !important; display: flex !important; flex-direction: column !important; }
    .qrrow { flex: 1 1 auto !important; align-items: center !important; }
    .qrrow img { width: ${thermal ? "38mm" : "62mm"} !important; height: ${thermal ? "38mm" : "62mm"} !important; }
    .noprint { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }`;

export default function BatchLabels() {
  const { active } = useOrg();
  const { t } = useLang();
  const [labels, setLabels] = useState<any[] | undefined>(undefined);
  const [missing, setMissing] = useState<string[]>([]);
  const [thermal, setThermal] = useState(false);

  useEffect(() => {
    let codes: string[] = [];
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("codes");
      if (q) codes = q.split(",").map((c) => c.trim()).filter(Boolean);
      else {
        try {
          const saved = JSON.parse(localStorage.getItem("kolis_batch_labels") || "null");
          if (saved?.codes?.length) codes = saved.codes;
        } catch { /* ignore */ }
      }
    }
    codes = Array.from(new Set(codes));
    if (codes.length === 0) { setLabels([]); return; }
    Promise.all(codes.map((c) => org.label(active.org_id, c).then((l) => ({ c, l })).catch(() => ({ c, l: null }))))
      .then((res) => {
        setLabels(res.filter((r) => r.l).map((r) => r.l));
        setMissing(res.filter((r) => !r.l).map((r) => r.c));
      });
  }, [active.org_id]);

  if (labels === undefined) return <div style={{ padding: 30 }}>{t("Loading labels…", "Chargement des étiquettes…")}</div>;
  const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 13px", borderRadius: 9, fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "1px solid " + (on ? "#E11D6B" : "#3a3742"), background: on ? "#E11D6B" : "transparent", color: on ? "#fff" : "#cbb9c0" });

  return (
    <div className="page" style={{ background: "#141318", minHeight: "100vh", padding: 24 }}>
      <style>{batchCss(thermal)}</style>

      <div className="noprint" style={{ maxWidth: 780, margin: "0 auto 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} disabled={labels.length === 0} onClick={() => window.print()}><Printer size={16} strokeWidth={2} /> {t(`Print all ${labels.length} labels`, `Imprimer les ${labels.length} étiquettes`)}</button>
        <a className="btn ghost" href="/shipper/bulk" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={15} strokeWidth={2} /> {t("Bulk shipment", "Envoi en lot")}</a>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <span style={{ color: "#8a8f9c", fontSize: 12 }}>{t("Format:", "Format :")}</span>
          <button onClick={() => setThermal(false)} style={chip(!thermal)}>{t("Standard", "Standard")}</button>
          <button onClick={() => setThermal(true)} style={chip(thermal)}>{t("Thermal 4×6″", "Thermique 4×6″")}</button>
        </div>
        {missing.length > 0 ? <span className="warn" style={{ color: "#ffb3a8" }}>{t(`${missing.length} not found: ${missing.join(", ")}`, `${missing.length} introuvable(s) : ${missing.join(", ")}`)}</span> : null}
      </div>

      {labels.length === 0 ? (
        <div className="card" style={{ maxWidth: 780, margin: "0 auto" }}>{t("No labels to print. Create a bulk shipment first, then use “Print all labels”.", "Aucune étiquette. Créez un envoi en lot, puis « Imprimer toutes les étiquettes ».")}</div>
      ) : (
        <div className="batch">
          {labels.map((l) => (
            <div key={l.id} className="sheet" style={{ marginBottom: 20 }}>
              <KolisLabel p={l} thermal={thermal} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
