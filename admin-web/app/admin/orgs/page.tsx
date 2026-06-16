"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString();
const KYB: Record<string, string> = { verified: "pg", pending: "pgold", rejected: "pred" };

export default function Organizations() {
  const router = useRouter();
  const { t } = useLang();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", type: "shipper", billing_email: "", net_terms: "30", discount: "0", credit: "0" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const load = () => api.orgs().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.name.trim()) { setErr(t("Name is required.", "Le nom est requis.")); return; }
    setBusy(true); setErr("");
    try {
      const id = await api.createOrg({
        name: f.name.trim(), type: f.type, billing_email: f.billing_email.trim() || undefined,
        net_terms: Number(f.net_terms) || 30, discount: (Number(f.discount) || 0) / 100,
        credit_limit_cents: Math.round((Number(f.credit) || 0) * 100),
      });
      setOpen(false); router.push(`/admin/orgs/${id}`);
    } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  // KYB + account-status labels (display only; backend values unchanged).
  const kybLabel = (s?: string) => ({ verified: t("verified", "vérifié"), pending: t("pending", "en attente"), rejected: t("rejected", "refusé") } as Record<string, string>)[s || ""] || s || "";
  const statusLabel = (s?: string) => ({ active: t("active", "actif"), suspended: t("suspended", "suspendu") } as Record<string, string>)[s || ""] || s || "";
  const typeLabel = (s?: string) => ({ shipper: t("shipper", "expéditeur"), carrier: t("carrier", "transporteur"), both: t("both", "les deux") } as Record<string, string>)[s || ""] || s || "";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>{t("Organizations", "Organisations")}</h1><div className="sub">{t("Business accounts — shippers & carrier fleets", "Comptes d’entreprise — expéditeurs et flottes de transport")}</div></div>
        <button className="btn" onClick={() => { setOpen(true); setErr(""); }}>{t("+ New organization", "+ Nouvelle organisation")}</button>
      </div>

      <div className="tiles">
        <div className="tile"><div className="l">{t("Total", "Total")}</div><div className="n">{rows.length}</div></div>
        <div className="tile"><div className="l">{t("Active", "Actifs")}</div><div className="n">{rows.filter((o) => o.status === "active").length}</div></div>
        <div className="tile"><div className="l">{t("Suspended", "Suspendus")}</div><div className="n">{rows.filter((o) => o.status === "suspended").length}</div></div>
        <div className="tile"><div className="l">{t("KYB pending", "KYB en attente")}</div><div className="n">{rows.filter((o) => o.kyb_status === "pending").length}</div></div>
      </div>

      <table>
        <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Type", "Type")}</th><th>{t("KYB", "KYB")}</th><th>{t("Status", "Statut")}</th><th>{t("Credit limit", "Limite de crédit")}</th><th>{t("Net", "Net")}</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="clk" onClick={() => router.push(`/admin/orgs/${o.id}`)}>
              <td><b>{o.name}</b><br /><span style={{ fontSize: 11, color: "var(--t3)" }}>{o.billing_email || "—"}</span></td>
              <td style={{ textTransform: "capitalize" }}>{typeLabel(o.type)}</td>
              <td><span className={"pill " + (KYB[o.kyb_status] || "pgrey")}>{kybLabel(o.kyb_status)}</span></td>
              <td><span className={"pill " + (o.status === "active" ? "pg" : "pred")}>{statusLabel(o.status)}</span></td>
              <td>{money(o.credit_limit_cents)}</td>
              <td>net-{o.net_terms_days}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No organizations yet — create one to onboard a business.", "Aucune organisation — créez-en une pour intégrer une entreprise.")}</td></tr>}
        </tbody>
      </table>

      {open && (
        <div className="modalbg" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18 }}>{t("New organization", "Nouvelle organisation")}</h1>
            <div className="mono" style={{ marginTop: 8 }}>{t("Business name", "Nom de l’entreprise")}</div>
            <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Northwind Goods Inc." />
            <div className="mono" style={{ marginTop: 10 }}>{t("Type", "Type")}</div>
            <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="shipper">{t("Shipper (sends parcels)", "Expéditeur (envoie des colis)")}</option>
              <option value="carrier">{t("Carrier / fleet (provides drivers)", "Transporteur / flotte (fournit des chauffeurs)")}</option>
              <option value="both">{t("Both", "Les deux")}</option>
            </select>
            <div className="mono" style={{ marginTop: 10 }}>{t("Billing email", "Courriel de facturation")}</div>
            <input className="input" value={f.billing_email} onChange={(e) => set("billing_email", e.target.value)} placeholder="billing@company.com" />
            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1 }}><div className="mono">{t("Net terms (days)", "Délai net (jours)")}</div><input className="input" value={f.net_terms} onChange={(e) => set("net_terms", e.target.value)} inputMode="numeric" /></div>
              <div style={{ flex: 1 }}><div className="mono">{t("Volume discount %", "Remise volume %")}</div><input className="input" value={f.discount} onChange={(e) => set("discount", e.target.value)} inputMode="decimal" /></div>
              <div style={{ flex: 1 }}><div className="mono">{t("Credit limit $", "Limite de crédit $")}</div><input className="input" value={f.credit} onChange={(e) => set("credit", e.target.value)} inputMode="numeric" /></div>
            </div>
            {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={create}>{busy ? t("Creating…", "Création…") : t("Create", "Créer")}</button>
              <button className="btn ghost" onClick={() => setOpen(false)}>{t("Cancel", "Annuler")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
