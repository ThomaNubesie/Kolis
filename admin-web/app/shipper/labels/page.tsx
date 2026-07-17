"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import KolisLabel from "@/components/KolisLabel";

// Print ALL labels for a batch at once — one label per page. Codes come from the
// ?codes=KL-1,KL-2 query, or from localStorage (set by the Bulk page's "Print all").
export default function BatchLabels() {
  const { active } = useOrg();
  const { t } = useLang();
  const [labels, setLabels] = useState<any[] | undefined>(undefined);
  const [missing, setMissing] = useState<string[]>([]);

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

  return (
    <div className="page" style={{ background: "#141318", minHeight: "100vh", padding: 24 }}>
      <style>{`
        @page { size: auto; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; }
          body * { visibility: hidden !important; }
          .batch, .batch * { visibility: visible !important; }
          .batch { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
          .sheet { page-break-after: always; break-after: page; min-height: 100vh; display: flex; flex-direction: column; }
          .sheet:last-child { page-break-after: auto; break-after: auto; }
          .sheet .label {
            width: 100% !important; max-width: none !important; min-height: 100vh !important; flex: 1 1 auto !important;
            border: none !important; border-radius: 0 !important; box-shadow: none !important; margin: 0 !important;
            display: flex !important; flex-direction: column !important;
          }
          .qrrow { flex: 1 1 auto !important; align-items: center !important; }
          .qrrow img { width: 62mm !important; height: 62mm !important; }
          .noprint { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="noprint" style={{ maxWidth: 780, margin: "0 auto 14px", display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn" disabled={labels.length === 0} onClick={() => window.print()}>🖨 {t(`Print all ${labels.length} labels`, `Imprimer les ${labels.length} étiquettes`)}</button>
        <a className="btn ghost" href="/shipper/bulk">← {t("Bulk shipment", "Envoi en lot")}</a>
        {missing.length > 0 ? <span className="warn" style={{ color: "#ffb3a8" }}>{t(`${missing.length} not found: ${missing.join(", ")}`, `${missing.length} introuvable(s) : ${missing.join(", ")}`)}</span> : null}
      </div>

      {labels.length === 0 ? (
        <div className="card" style={{ maxWidth: 780, margin: "0 auto" }}>{t("No labels to print. Create a bulk shipment first, then use “Print all labels”.", "Aucune étiquette. Créez un envoi en lot, puis « Imprimer toutes les étiquettes ».")}</div>
      ) : (
        <div className="batch">
          {labels.map((l) => (
            <div key={l.id} className="sheet" style={{ marginBottom: 20 }}>
              <KolisLabel p={l} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
