// Client-side PDF builder for a Quorly form (jsPDF loaded from CDN — no npm dep).
// Produces a jsPDF doc with: header, NDA clause, members, and every entry (fields, status, comments).
import type { CfFormFull, CfEntry, CfReceipt, CfElection, CfThEntry } from "@/lib/cf";

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

export type PdfLang = "en" | "fr";
// Same co-located pattern as the screens (lib/i18n.tsx): the pair travels with the call site.
const L = (en: string, fr: string) => ({ en, fr });
const T9N = (lang: PdfLang) => (o: { en: string; fr: string }) => o[lang];
const loc = (lang: PdfLang) => (lang === "fr" ? "fr-CA" : "en-CA");
const fmt = (iso: string, lang: PdfLang = "en") => { try { return new Date(iso).toLocaleString(loc(lang), { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
// A field's label is the storage key; a template may have shipped a translation for display.
const flabel = (f: any, lang: PdfLang) => f?.label_i18n?.[lang] ?? f?.label ?? "";
const foption = (f: any, o: string, lang: PdfLang) => f?.options_i18n?.[o]?.[lang] ?? o;
// Receipt categories are stored in English (they are the key the app groups by) — display only.
const RCAT_FR: Record<string, string> = { Meals: "Repas", Fuel: "Carburant", Office: "Bureau", Travel: "Déplacements", Lodging: "Hébergement", Supplies: "Fournitures", Groceries: "Épicerie", Utilities: "Services publics", Medical: "Santé", Other: "Autre" };
const rcat = (c: string | null | undefined, lang: PdfLang) => { const k = c || "Other"; return lang === "fr" ? (RCAT_FR[k] ?? k) : k; };

export async function buildFormPdf(form: CfFormFull, entries: CfEntry[], memberOf: Record<string, any>, lang: PdfLang = "en") {
  const tr = T9N(lang);
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
  const nMembers = form.members.filter((m) => m.status === "active").length;
  text(tr(L(`Generated ${fmt(new Date().toISOString(), lang)} · ${entries.length} entries · ${nMembers} members`,
           `Généré le ${fmt(new Date().toISOString(), lang)} · ${entries.length} entrée(s) · ${nMembers} membre(s)`)), M, 9, "normal", faint);
  y += 6; rule();

  // NDA
  if (form.nda) {
    text(tr(L("Confidentiality / Non-Disclosure", "Confidentialité / Non-divulgation")), M, 12, "bold", ink);
    text(form.nda, M, 9.5, "normal", ink); y += 4;
    text(tr(L("All members accepted this clause when joining.", "Tous les membres ont accepté cette clause en rejoignant.")), M, 8.5, "italic", faint);
    y += 6; rule();
  }

  // Members
  text(tr(L("Members", "Membres")), M, 12, "bold", ink);
  for (const m of form.members) text(`• ${m.name ?? m.contact}${m.role === "admin" ? "  (admin)" : ""}${m.status === "invited" ? tr(L("  — invited", "  — invité")) : ""}`, M + 6, 9.5);
  y += 6; rule();

  // Entries
  text(tr(L("Entries", "Entrées")), M, 12, "bold", ink);
  y += 2;
  const defined = (form.fields ?? []) as any[];
  const labels = defined.map((f) => f.label);
  const byLabel: Record<string, any> = Object.fromEntries(defined.map((f) => [f.label, f]));
  const ST: Record<string, { en: string; fr: string }> = { pending: L("pending", "en attente"), approved: L("approved", "approuvée"), rejected: L("rejected", "rejetée") };
  for (const e of entries) {
    const a = memberOf[e.author];
    ensure(40);
    const st = e.status ? "  [" + tr(ST[e.status] ?? L(e.status, e.status)) + (e.status !== "approved" ? "" : ` ${e.approvals}/${form.approval_count}`) + "]" : "";
    text(`${tr(L("No.", "Nº"))} ${String(e.seq).padStart(3, "0")}  —  ${a?.name ?? "—"}  ·  ${fmt(e.created_at, lang)}${st}`, M, 10.5, "bold", accent);
    const keys = [...labels, ...Object.keys(e.values ?? {}).filter((k) => !labels.includes(k))];
    for (const k of keys) {
      if (e.values?.[k] == null || e.values?.[k] === "") continue;
      const fd = byLabel[k];
      text(`${fd ? flabel(fd, lang) : k}:`, M + 6, 8.5, "bold", faint);
      text(fd?.type === "select" ? foption(fd, String(e.values[k]), lang) : String(e.values[k]), M + 12, 10);
    }
    for (const c of e.comments ?? []) { const ca = memberOf[c.author]; text(`↳ ${ca?.name ?? "—"} (${fmt(c.created_at, lang)}): ${c.body}`, M + 12, 9, "italic", ink); }
    y += 8;
  }

  // Page numbers
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(faint[0], faint[1], faint[2]); doc.text(`${tr(L("Page", "Page"))} ${i} / ${pages}`, W - M, H - 20, { align: "right" }); }
  return doc;
}

export function pdfFilename(form: CfFormFull) {
  return `${(form.name || "quorly-form").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.pdf`;
}

// Election results PDF — "Certificate + Ledger" (Design C): certified header, a winner-featured block
// per position (crown + For/Against/net chips + runners-up), a full tabulation of every candidate,
// then the members' vote reasons. `eligible` = number of members entitled to vote (roster size).
export async function buildElectionPdf(formName: string, el: CfElection, eligible?: number, lang: PdfLang = "en") {
  const tr = T9N(lang);
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 44; let y = M;
  const ink = [20, 19, 26], faint = [138, 135, 132], accent = [47, 58, 163], gold = [176, 141, 58],
    green = [23, 138, 78], red = [192, 57, 43], line = [236, 231, 220],
    greenSoft = [231, 246, 238], redSoft = [251, 233, 231], indigoSoft = [238, 239, 249], cardBg = [255, 255, 255];
  const setFill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
  const setCol = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const T = (s: string, x: number, size: number, style: string, color: number[], opts: any = {}) => {
    doc.setFont(opts.font || "helvetica", style); doc.setFontSize(size); setCol(color);
    doc.text(String(s ?? ""), x, y, opts);
  };
  const net = (n: number) => `${n >= 0 ? "+" : ""}${n}`;

  const positions = el.positions.length ? el.positions : Array.from(new Set(el.candidates.map((c) => c.position)));
  const votesCast = el.candidates.reduce((s, c) => s + c.for + c.against, 0);
  const when = el.closed_at ? fmt(el.closed_at, lang) : fmt(new Date().toISOString(), lang);

  // chip: soft-filled rounded pill with coloured text; returns its width. Anchored at right edge rx.
  const chipRight = (label: string, rx: number, cy: number, bg: number[], fg: number[]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    const tw = doc.getTextWidth(label), w = tw + 16;
    setFill(bg); doc.roundedRect(rx - w, cy - 11, w, 16, 8, 8, "F");
    setCol(fg); doc.text(label, rx - w / 2, cy, { align: "center" });
    return w;
  };
  const drawCrown = (x: number, cy: number) => {
    setFill(gold);
    doc.triangle(x, cy, x + 3, cy - 8, x + 6, cy, "F");
    doc.triangle(x + 5, cy, x + 8.5, cy - 11, x + 12, cy, "F");
    doc.triangle(x + 11, cy, x + 14, cy - 8, x + 17, cy, "F");
    doc.rect(x, cy - 1, 17, 4, "F");
  };

  // ===== Certified header (centred) =====
  const cx = W / 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  const qw = doc.getTextWidth("Quorly"), grp = 22 + 8 + qw, gx = cx - grp / 2;
  setFill(accent); doc.roundedRect(gx, y, 22, 22, 6, 6, "F");
  setCol([255, 255, 255]); doc.text("Q", gx + 11, y + 16, { align: "center" });
  setCol(ink); doc.text("Quorly", gx + 30, y + 16);
  y += 40;
  T(tr(L("CERTIFIED ELECTION RESULTS", "RÉSULTATS D'ÉLECTION CERTIFIÉS")), cx, 9, "bold", gold, { align: "center", charSpace: 2.4 }); y += 22;
  T(formName, cx, 26, "bold", ink, { align: "center", font: "times" }); y += 22;
  const plural = (n: number, en: string, fr: string) => tr(L(`${n} ${en}${n === 1 ? "" : "s"}`, `${n} ${fr}${n === 1 ? "" : "s"}`));
  const metaBits = [
    tr(L(`Overseen by ${el.closed_by || "the admin"}`, `Supervisée par ${el.closed_by || "l'admin"}`)),
    tr(L(`closed ${when}`, `clôturée le ${when}`)),
    plural(positions.length, "position", "poste"),
    plural(el.candidates.length, "candidate", "candidat"),
  ];
  if (eligible != null) metaBits.push(plural(eligible, "member", "membre"));
  metaBits.push(plural(votesCast, "vote", "vote"));
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); setCol(faint);
  for (const ln of doc.splitTextToSize(metaBits.join("  ·  "), W - 2 * M)) { doc.text(ln, cx, y, { align: "center" }); y += 13; }
  y += 6;
  setDraw(line); doc.setLineWidth(1); doc.line(M, y, W - M, y); doc.line(M, y + 2.5, W - M, y + 2.5); doc.setLineWidth(0.2); y += 20;

  // ===== Per-position winner-featured cards =====
  for (const pos of positions) {
    const cands = el.candidates.filter((c) => c.position === pos).sort((a, b) => b.net - a.net || b.for - a.for || +new Date(a.declared_at) - +new Date(b.declared_at));
    const posVotes = cands.reduce((s, c) => s + c.for + c.against, 0);
    const cardH = 14 + 16 + 8 + 40 + Math.max(0, cands.length - 1) * 22 + 12;
    ensure(cardH + 8);
    const top = y;
    setFill(cardBg); setDraw(line); doc.roundedRect(M, top, W - 2 * M, cardH, 12, 12, "FD");
    y = top + 24;
    T(pos.toUpperCase(), M + 18, 11, "bold", accent, { charSpace: 1 });
    T(`${plural(cands.length, "candidate", "candidat")} · ${plural(posVotes, "vote", "vote")}`, W - M - 18, 9, "normal", faint, { align: "right" });
    y += 12;
    if (cands.length === 0) { T(tr(L("No candidates declared.", "Aucune candidature déclarée.")), M + 18, 10, "italic", faint, {}); y = top + cardH + 12; continue; }
    // winner box
    const w0 = cands[0], wy = y, wh = 40;
    setFill(greenSoft); setDraw([216, 238, 223]); doc.roundedRect(M + 14, wy, W - 2 * M - 28, wh, 8, 8, "FD");
    const midY = wy + wh / 2 + 4;
    drawCrown(M + 28, midY - 1);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); setCol(ink); doc.text(w0.name, M + 54, midY);
    let rx = W - M - 26;
    rx -= chipRight(`${tr(L("net", "net"))} ${net(w0.net)}`, rx, midY, indigoSoft, accent) + 6;
    rx -= chipRight(`${w0.against} ${tr(L("Against", "Contre"))}`, rx, midY, redSoft, red) + 6;
    chipRight(`${w0.for} ${tr(L("For", "Pour"))}`, rx, midY, greenSoft, green);
    y = wy + wh;
    // runners-up
    for (const c of cands.slice(1)) {
      y += 22;
      setDraw([243, 240, 232]); doc.line(M + 16, y - 15, W - M - 16, y - 15);
      T(c.name, M + 20, 12, "bold", [58, 55, 66], {});
      T(`${tr(L("net", "net"))} ${net(c.net)}`, W - M - 20, 11, "normal", faint, { align: "right" });
      T(`${c.for} / ${c.against}`, W - M - 76, 11.5, "bold", [110, 107, 120], { align: "right" });
    }
    y = top + cardH + 12;
  }

  // ===== Full tabulation ledger =====
  ensure(60);
  T(tr(L("FULL TABULATION — EVERY CANDIDATE", "DÉPOUILLEMENT COMPLET — TOUS LES CANDIDATS")), M, 11, "bold", accent, { charSpace: .6 }); y += 10;
  const colCand = 150, colFor = 372, colAg = 432, colTot = 492, colNet = W - M;
  const thead = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setCol(faint);
    doc.text(tr(L("POSITION", "POSTE")), M, y); doc.text(tr(L("CANDIDATE", "CANDIDAT")), colCand, y);
    doc.text(tr(L("FOR", "POUR")), colFor, y, { align: "right" }); doc.text(tr(L("AGAINST", "CONTRE")), colAg, y, { align: "right" });
    doc.text(tr(L("TOTAL", "TOTAL")), colTot, y, { align: "right" }); doc.text(tr(L("NET", "NET")), colNet, y, { align: "right" });
    y += 6; setDraw(line); doc.setLineWidth(1); doc.line(M, y, W - M, y); doc.setLineWidth(0.2); y += 14;
  };
  thead();
  for (const pos of positions) {
    const cands = el.candidates.filter((c) => c.position === pos).sort((a, b) => b.net - a.net || b.for - a.for || +new Date(a.declared_at) - +new Date(b.declared_at));
    cands.forEach((c, j) => {
      ensure(22); if (y === M) thead();
      const rowY = y;
      if (c.winner) { setFill(greenSoft); doc.rect(M - 4, rowY - 12, W - 2 * M + 8, 20, "F"); }
      if (j === 0) T(pos.toUpperCase(), M, 9, "bold", accent, { charSpace: .4 });
      if (c.winner) { setFill(green); doc.circle(colCand - 8, rowY - 3, 2.2, "F"); }
      T(c.name, colCand, 11.5, c.winner ? "bold" : "normal", ink, {});
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); setCol(ink);
      doc.text(String(c.for), colFor, rowY, { align: "right" });
      doc.text(String(c.against), colAg, rowY, { align: "right" });
      doc.text(String(c.for + c.against), colTot, rowY, { align: "right" });
      doc.setFont("helvetica", "bold"); setCol(c.net >= 0 ? green : red);
      doc.text(net(c.net), colNet, rowY, { align: "right" });
      y += 20; setDraw([245, 242, 235]); doc.line(M, y - 8, W - M, y - 8);
    });
  }

  // ===== Vote reasons appendix =====
  if (el.reasons.length) {
    y += 12; ensure(30);
    T(tr(L("MEMBERS' REASONS", "MOTIFS DES MEMBRES")), M, 11, "bold", accent, { charSpace: .6 }); y += 14;
    for (const r of el.reasons) {
      ensure(16);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setCol(r.value === "for" ? green : red);
      const tag = r.value === "for" ? tr(L("FOR ", "POUR ")) : tr(L("AGAINST ", "CONTRE "));
      doc.text(tag, M, y);
      const tw = doc.getTextWidth(tag);
      doc.setFont("helvetica", "normal"); setCol([58, 55, 66]);
      const body = `“${r.reason}” — ${r.voter} · ${r.candidate} (${r.position})`;
      for (const ln of doc.splitTextToSize(body, W - M - (M + tw))) { doc.text(ln, M + tw, y); y += 13; }
      y += 3;
    }
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); setCol(faint);
    doc.text(tr(L("Certified · Quorly", "Certifié · Quorly")), M, H - 20);
    doc.text(`${tr(L("Page", "Page"))} ${i} / ${pages}`, W - M, H - 20, { align: "right" });
  }
  return doc;
}

// Receipts / expense report PDF — grouped by category with subtotals, tax total and grand total.
export async function buildReceiptsPdf(formName: string, recs: CfReceipt[], lang: PdfLang = "en") {
  const tr = T9N(lang);
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 40; let y = M;
  const ink = [28, 27, 25], faint = [140, 135, 128], accent = [47, 58, 163], line = [225, 220, 210];
  const cur = recs[0]?.currency || "CAD";
  const fm = (n: number | null | undefined) => n == null ? "" : new Intl.NumberFormat(loc(lang), { style: "currency", currency: cur }).format(n);
  const setC = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const col = { merchant: M, date: 205, cat: 280, sub: 365, tax: 435, total: W - M };

  doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(0, 0, W, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); setC(accent); doc.text("Quorly", M, y + 12); y += 28;
  doc.setFontSize(16); setC(ink); doc.text(`${formName} — ${tr(L("Receipts", "Reçus"))}`, M, y); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); setC(faint);
  const gen = new Date().toLocaleDateString(loc(lang), { year: "numeric", month: "short", day: "numeric" });
  doc.text(tr(L(`Generated ${gen} · ${recs.length} receipts`, `Généré le ${gen} · ${recs.length} reçu(s)`)), M, y); y += 14;
  doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 14;
  const thead = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); setC(faint);
    doc.text(tr(L("MERCHANT", "MARCHAND")), col.merchant, y); doc.text(tr(L("DATE", "DATE")), col.date, y); doc.text(tr(L("CATEGORY", "CATÉGORIE")), col.cat, y);
    doc.text(tr(L("SUBTOTAL", "SOUS-TOTAL")), col.sub, y, { align: "right" }); doc.text(tr(L("TAX", "TAXE")), col.tax, y, { align: "right" }); doc.text(tr(L("TOTAL", "TOTAL")), col.total, y, { align: "right" });
    y += 6; doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 12;
  };
  thead();
  const byCat: Record<string, CfReceipt[]> = {}; recs.forEach((r) => { const c = r.category || "Other"; (byCat[c] = byCat[c] || []).push(r); });
  let grand = 0, taxT = 0;
  for (const c of Object.keys(byCat).sort()) {
    ensure(28); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setC(ink); doc.text(rcat(c, lang), M, y); y += 13;
    let catSum = 0;
    for (const r of byCat[c]) {
      ensure(16); doc.setFont("helvetica", "normal"); doc.setFontSize(9); setC(ink);
      doc.text((r.merchant || tr(L("(unread)", "(non lu)"))).slice(0, 32), col.merchant, y);
      setC(faint); doc.text(r.purchase_date || "—", col.date, y); setC(ink);
      doc.text(rcat(r.category, lang), col.cat, y);
      doc.text(fm(r.subtotal), col.sub, y, { align: "right" });
      doc.text(fm(r.tax), col.tax, y, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.text(fm(r.total), col.total, y, { align: "right" }); doc.setFont("helvetica", "normal");
      y += 14; catSum += (r.total || 0); grand += (r.total || 0); taxT += (r.tax || 0);
    }
    ensure(16); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setC(faint);
    doc.text(tr(L(`${rcat(c, lang)} subtotal`, `Sous-total ${rcat(c, lang)}`)), col.cat, y); doc.text(fm(catSum), col.total, y, { align: "right" }); y += 18;
  }
  ensure(40); doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); setC(ink);
  doc.text(tr(L("Tax total", "Total des taxes")), col.cat, y); doc.text(fm(taxT), col.total, y, { align: "right" }); y += 18;
  doc.setFontSize(13); setC(accent);
  doc.text(tr(L("GRAND TOTAL", "TOTAL GÉNÉRAL")), col.cat, y); doc.text(fm(grand), col.total, y, { align: "right" });
  return doc;
}

// Town Hall closing summary → base64 PDF (topic, overall yea/nay tally, each concern
// with its running summary + vote). Margins respected (M + ensure() pagination).
export async function buildTownHallPdf(topicTitle: string, entries: CfThEntry[], lang: PdfLang = "en"): Promise<string> {
  const tr = T9N(lang);
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 48; let y = M;
  const ink = [28, 27, 25], faint = [140, 135, 128], accent = [47, 58, 163], line = [225, 220, 210], yea = [23, 138, 78], nay = [192, 57, 43];
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const text = (s: string, x: number, size = 10, style = "normal", color = ink, maxW = W - M - x) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
    for (const ln of doc.splitTextToSize(String(s ?? ""), maxW)) { ensure(size + 4); doc.text(ln, x, y); y += size + 4; }
  };
  const rule = () => { ensure(12); doc.setDrawColor(line[0], line[1], line[2]); doc.line(M, y, W - M, y); y += 12; };
  doc.setFillColor(accent[0], accent[1], accent[2]); doc.roundedRect(M, y, 20, 20, 4, 4, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Q", M + 6, y + 14);
  doc.setTextColor(ink[0], ink[1], ink[2]); doc.setFontSize(13); doc.text("Quorly", M + 28, y + 14); y += 34;
  text(tr(L("Parliament — published summary", "Parlement — synthèse publiée")), M, 9, "normal", faint);
  text(topicTitle, M, 17, "bold");
  let tf = 0, ta = 0; entries.forEach((e) => { tf += e.for; ta += e.against; });
  text(`${tr(L("Overall", "Total"))}: ${tf} ${tr(L("for", "pour"))} · ${ta} ${tr(L("against", "contre"))} · ${entries.length} ${tr(L("concerns", "préoccupations"))}`, M, 10, "bold", accent);
  rule();
  entries.slice().reverse().forEach((e) => {
    ensure(56);
    text(`#${e.seq} · ${e.author}`, M, 11, "bold");
    text(e.body, M, 10.5);
    text(`${tr(L("Votes", "Votes"))}: ${e.for} ${tr(L("for", "pour"))} / ${e.against} ${tr(L("against", "contre"))}`, M, 9.5, "bold", e.for >= e.against ? yea : nay);
    if (e.summary) text(`${tr(L("Summary", "Résumé"))}: ${e.summary}`, M + 6, 9.5, "italic", faint);
    y += 6; rule();
  });
  text(tr(L("Prepared with Quorly · quorly.ca", "Préparé avec Quorly · quorly.ca")), M, 8, "normal", faint);
  const uri = doc.output("datauristring");
  return uri.split("base64,")[1] || "";
}
