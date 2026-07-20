"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { Mail, Smartphone, Home, Briefcase, MapPin, StickyNote, Send, Package, ArrowLeft, RotateCw, PackagePlus } from "lucide-react";
import { TrackingPanel } from "@/components/LiveTracking";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  requested: "pgrey", received_at_hub: "pgold", matched: "pmag", dispatched: "pblue",
  picked_up: "pblue", in_transit: "pblue", delivered: "pg", cancelled: "pred",
};
const initials = (n: string) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const chip: React.CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center", background: "#FBF3F7", border: "1px solid #f0d8e5", borderRadius: 9, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, color: "#141420", textDecoration: "none" };

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>();
  const { active } = useOrg();
  const { t, lang } = useLang();
  const [c, setC] = useState<any | undefined>(undefined);
  const [hist, setHist] = useState<any[]>([]);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const when = (s?: string) => s ? new Date(s).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
  // Repeat a past shipment: prefill the Create form, or preselect it in Bulk.
  const resendHref = (p: any) => "/shipper/create?" + new URLSearchParams({ name: c?.full_name || "", phone: c?.mobile || "", email: c?.email || "", city: p.to_city || "", addr: p.dropoff_addr || c?.address || "", size: p.size || "small", type: p.dropoff_type || "door", contents: p.contents || "" }).toString();
  const bulkHref = (p: any) => "/shipper/bulk?" + new URLSearchParams({ client: String(c?.id || id), size: p.size || "small", city: p.to_city || "", addr: p.dropoff_addr || c?.address || "" }).toString();

  useEffect(() => {
    org.clientGet(active.org_id, id).then(setC).catch(() => setC(null));
    org.clientHistory(active.org_id, id).then((h) => setHist(h || [])).catch(() => setHist([]));
  }, [active.org_id, id]);

  // Arriving from a parcel code (Shipments/Overview) → auto-open that shipment's tracking + scroll to it.
  useEffect(() => {
    if (!hist.length || typeof window === "undefined") return;
    const code = new URLSearchParams(window.location.search).get("open");
    if (code && hist.some((p) => p.code === code)) {
      setOpenCode(code);
      setTimeout(() => document.getElementById(`row-${code}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    }
  }, [hist]);

  const stats = useMemo(() => {
    const total = hist.reduce((s, p) => s + (p.price_cents || 0) + (p.tax_cents || 0), 0);
    const last = hist[0]?.created_at;
    const routeCount: Record<string, number> = {};
    hist.forEach((p) => { const k = `${p.from_city} → ${p.to_city}`; routeCount[k] = (routeCount[k] || 0) + 1; });
    const usual = Object.entries(routeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    return { count: hist.length, total, last, usual };
  }, [hist]);

  if (c === undefined) return <div style={{ padding: 24 }}>{t("Loading…", "Chargement…")}</div>;
  if (c === null) return <div style={{ padding: 24 }}>{t("Customer not found.", "Client introuvable.")}</div>;

  return (
    <>
      <a className="link" href="/shipper/clients" style={{ color: "var(--mag,#B81558)", fontWeight: 800, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}><ArrowLeft size={14} strokeWidth={2.2} /> {t("Clients", "Clients")}</a>

      {/* Header */}
      <div className="card" style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 60, height: 60, borderRadius: 15, background: "#E11D6B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, flex: "none" }}>{initials(c.full_name)}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{c.full_name}</div>
          <div className="sub">{t("Customer", "Client")} · {active.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {c.email ? <span style={chip}><Mail size={14} strokeWidth={2} /> {c.email}</span> : null}
            {c.mobile ? <a style={chip} href={`tel:${c.mobile}`}><Smartphone size={14} strokeWidth={2} /> {c.mobile}</a> : null}
            {c.home_phone ? <span style={chip}><Home size={14} strokeWidth={2} /> {c.home_phone}</span> : null}
            {c.work_phone ? <span style={chip}><Briefcase size={14} strokeWidth={2} /> {c.work_phone}</span> : null}
            {(c.address || c.city) ? <span style={chip}><MapPin size={14} strokeWidth={2} /> {[c.address, c.city, c.province, c.postal].filter(Boolean).join(", ")}</span> : null}
          </div>
          {c.notes ? <div className="sub" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6 }}><StickyNote size={14} strokeWidth={2} /> {c.notes}</div> : null}
        </div>
        <a className="btn ghost" href={`/shipper/bulk?client=${c.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Send size={15} strokeWidth={2} /> {t("New shipment", "Nouvel envoi")}</a>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 14, margin: "16px 0", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: 1, minWidth: 150 }}><div className="mono">{t("Packages sent", "Colis envoyés")}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>{stats.count}</div></div>
        <div className="card" style={{ flex: 1, minWidth: 150 }}><div className="mono">{t("Total billed (incl. tax)", "Total facturé (taxe incl.)")}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 3, color: "var(--green,#178a5e)" }}>{money(stats.total)}</div></div>
        <div className="card" style={{ flex: 1, minWidth: 150 }}><div className="mono">{t("Last shipment", "Dernier envoi")}</div><div style={{ fontSize: 19, fontWeight: 900, marginTop: 3 }}>{stats.last ? when(stats.last) : "—"}</div></div>
        <div className="card" style={{ flex: 1, minWidth: 150 }}><div className="mono">{t("Usual route", "Trajet habituel")}</div><div style={{ fontSize: 19, fontWeight: 900, marginTop: 3 }}>{stats.usual}</div></div>
      </div>

      {/* History */}
      <div className="card">
        <h2 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}><Package size={17} strokeWidth={2} /> {t("Package history", "Historique des colis")}</h2>
        <div className="sub" style={{ marginBottom: 6 }}>{t("Every parcel sent to this customer — newest first.", "Chaque colis envoyé à ce client — le plus récent en premier.")}</div>
        <table>
          <thead><tr><th>{t("Date", "Date")}</th><th>{t("Code", "Code")}</th><th>{t("Route", "Trajet")}</th><th>{t("Size", "Taille")}</th><th>{t("Status", "Statut")}</th><th style={{ textAlign: "right" }}>{t("Total (incl. tax)", "Total (taxe incl.)")}</th></tr></thead>
          <tbody>
            {hist.map((p) => (
              <Fragment key={p.id}>
                <tr id={`row-${p.code}`} onClick={() => setOpenCode(openCode === p.code ? null : p.code)} style={{ cursor: "pointer", background: openCode === p.code ? "rgba(225,29,107,0.05)" : undefined }}>
                  <td style={{ whiteSpace: "nowrap" }}>{when(p.created_at)}</td>
                  <td><b>{p.code}</b> <span style={{ color: "#B81558", fontSize: 11 }}>{openCode === p.code ? "▾" : "▸"}</span></td>
                  <td>{p.from_city} → {p.to_city}{p.dropoff_type === "hub" ? " · hub" : ""}</td>
                  <td>{p.size}</td>
                  <td><span className={"pill " + (STATUS[p.status] || "pgrey")}>{(p.status || "").replace(/_/g, " ")}</span></td>
                  <td style={{ textAlign: "right", fontWeight: 800, color: "var(--green,#178a5e)", whiteSpace: "nowrap" }}>{money(p.price_cents + (p.tax_cents || 0))}{(p.tax_cents || 0) > 0 ? <div className="sub" style={{ fontSize: 10.5, fontWeight: 500 }}>{money(p.price_cents)} + {money(p.tax_cents)} {t("tax", "taxe")}</div> : null}</td>
                </tr>
                {openCode === p.code && (
                  <tr><td colSpan={6} style={{ background: "#faf8f4" }}>
                    {p.contents ? <div style={{ marginBottom: 10, fontSize: 13 }}><b>{t("Contents", "Contenu")}:</b> {p.contents}</div> : null}
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <a className="btn" href={resendHref(p)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RotateCw size={14} strokeWidth={2} /> {t("Resend this shipment", "Renvoyer cet envoi")}</a>
                      <a className="btn ghost" href={bulkHref(p)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><PackagePlus size={15} strokeWidth={2} /> {t("Add to bulk", "Ajouter au lot")}</a>
                    </div>
                    <TrackingPanel code={p.code} t={t} />
                  </td></tr>
                )}
              </Fragment>
            ))}
            {hist.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No packages sent to this customer yet.", "Aucun colis envoyé à ce client pour l’instant.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
