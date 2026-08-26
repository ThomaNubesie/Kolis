// Client-side PDF builder for a Quorly form (jsPDF loaded from CDN — no npm dep).
// Produces a jsPDF doc with: header, NDA clause, members, and every entry (fields, status, comments).
import type { CfFormFull, CfEntry, CfReceipt } from "@/lib/cf";

declare global { interface Window { jspdf?: any } }

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error("script load failed: " + src));
    document.head.appendChild(s);
  });
}
async function ensureJsPDF() {
  if (!window.jspdf) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  return window.jspdf.jsPDF;
}

const fmt = (iso: string) => { try { return new Date(iso).toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };

export async function buildFormPdf(form: CfFormFull, entries: CfEntry[], memberOf: Record<string, any>) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 48; let y = M;
  const ink = [28, 27, 25], faint = [140, 135, 128], accent = [47, 58, 163], line = [225, 220, 210];

  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const text = (s: string, x: number, size = 10, style = "normal", color = ink, maxW = W - M - x) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(String(s ?? ""), maxW);
    for (const ln of lines) { ensure(size + 4); doc.text(ln, x, y); y += size + 4; }
  };
  const rule = () => { ensure(10); doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 10; };

  // Header
  doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(0, 0, W, 8, "F");
  text("Quorly", M, 11, "bold", accent); y -= 2;
  text(form.name, M, 20, "bold", ink);
  text(`Generated ${fmt(new Date().toISOString())} · ${entries.length} entries · ${form.members.filter((m) => m.status === "active").length} members`, M, 9, "normal", faint);
  y += 6; rule();

  // NDA
  if (form.nda) {
    text("Confidentiality / Non-Disclosure", M, 12, "bold", ink);
    text(form.nda, M, 9.5, "normal", ink); y += 4;
    text("All members accepted this clause when joining.", M, 8.5, "italic", faint);
    y += 6; rule();
  }

  // Members
  text("Members", M, 12, "bold", ink);
  for (const m of form.members) text(`• ${m.name ?? m.contact}${m.role === "admin" ? "  (admin)" : ""}${m.status === "invited" ? "  — invited" : ""}`, M + 6, 9.5);
  y += 6; rule();

  // Entries
  text("Entries", M, 12, "bold", ink);
  y += 2;
  const defined = (form.fields ?? []) as any[];
  const labels = defined.map((f) => f.label);
  for (const e of entries) {
    const a = memberOf[e.author];
    ensure(40);
    text(`No. ${String(e.seq).padStart(3, "0")}  —  ${a?.name ?? "—"}  ·  ${fmt(e.created_at)}${e.status ? "  [" + e.status + (e.status !== "approved" ? "" : ` ${e.approvals}/${form.approval_count}`) + "]" : ""}`, M, 10.5, "bold", accent);
    const keys = [...labels, ...Object.keys(e.values ?? {}).filter((k) => !labels.includes(k))];
    for (const k of keys) { if (e.values?.[k] == null || e.values?.[k] === "") continue; text(`${k}:`, M + 6, 8.5, "bold", faint); text(String(e.values[k]), M + 12, 10); }
    for (const c of e.comments ?? []) { const ca = memberOf[c.author]; text(`↳ ${ca?.name ?? "—"} (${fmt(c.created_at)}): ${c.body}`, M + 12, 9, "italic", ink); }
    y += 8;
  }

  // Page numbers
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(faint[0], faint[1], faint[2]); doc.text(`Page ${i} / ${pages}`, W - M, H - 20, { align: "right" }); }
  return doc;
}

export function pdfFilename(form: CfFormFull) {
  return `${(form.name || "quorly-form").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.pdf`;
}

// Receipts / expense report PDF — grouped by category with subtotals, tax total and grand total.
export async function buildReceiptsPdf(formName: string, recs: CfReceipt[]) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 40; let y = M;
  const ink = [28, 27, 25], faint = [140, 135, 128], accent = [47, 58, 163], line = [225, 220, 210];
  const cur = recs[0]?.currency || "CAD";
  const fm = (n: number | null | undefined) => n == null ? "" : new Intl.NumberFormat("en-CA", { style: "currency", currency: cur }).format(n);
  const setC = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const col = { merchant: M, date: 205, cat: 280, sub: 365, tax: 435, total: W - M };

  doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(0, 0, W, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); setC(accent); doc.text("Quorly", M, y + 12); y += 28;
  doc.setFontSize(16); setC(ink); doc.text(`${formName} — Receipts`, M, y); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); setC(faint);
  doc.text(`Generated ${new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} · ${recs.length} receipts`, M, y); y += 14;
  doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 14;
  const thead = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); setC(faint);
    doc.text("MERCHANT", col.merchant, y); doc.text("DATE", col.date, y); doc.text("CATEGORY", col.cat, y);
    doc.text("SUBTOTAL", col.sub, y, { align: "right" }); doc.text("TAX", col.tax, y, { align: "right" }); doc.text("TOTAL", col.total, y, { align: "right" });
    y += 6; doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 12;
  };
  thead();
  const byCat: Record<string, CfReceipt[]> = {}; recs.forEach((r) => { const c = r.category || "Other"; (byCat[c] = byCat[c] || []).push(r); });
  let grand = 0, taxT = 0;
  for (const c of Object.keys(byCat).sort()) {
    ensure(28); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setC(ink); doc.text(c, M, y); y += 13;
    let catSum = 0;
    for (const r of byCat[c]) {
      ensure(16); doc.setFont("helvetica", "normal"); doc.setFontSize(9); setC(ink);
      doc.text((r.merchant || "(unread)").slice(0, 32), col.merchant, y);
      setC(faint); doc.text(r.purchase_date || "—", col.date, y); setC(ink);
      doc.text((r.category || "Other"), col.cat, y);
      doc.text(fm(r.subtotal), col.sub, y, { align: "right" });
      doc.text(fm(r.tax), col.tax, y, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.text(fm(r.total), col.total, y, { align: "right" }); doc.setFont("helvetica", "normal");
      y += 14; catSum += (r.total || 0); grand += (r.total || 0); taxT += (r.tax || 0);
    }
    ensure(16); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setC(faint);
    doc.text(`${c} subtotal`, col.cat, y); doc.text(fm(catSum), col.total, y, { align: "right" }); y += 18;
  }
  ensure(40); doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); setC(ink);
  doc.text("Tax total", col.cat, y); doc.text(fm(taxT), col.total, y, { align: "right" }); y += 18;
  doc.setFontSize(13); setC(accent);
  doc.text("GRAND TOTAL", col.cat, y); doc.text(fm(grand), col.total, y, { align: "right" });
  return doc;
}
