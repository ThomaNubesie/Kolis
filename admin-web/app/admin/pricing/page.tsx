"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";
import { Tags, Plus, X, Trash2, Save, Users, Info } from "lucide-react";

const money = (c: number) => "$" + ((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Rule = { id?: string; label: string; total_cents: number; cities: string[] };

export default function PricingGroups() {
  const { t } = useLang();
  const [groups, setGroups] = useState<any[] | null>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [addOrg, setAddOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadGroups = () => api.priceGroups().then((g) => setGroups((g as any) || [])).catch((e) => setErr(e?.message || "Failed to load groups"));
  useEffect(() => { loadGroups(); api.orgs().then((o) => setOrgs(o || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    api.priceGroup(sel).then((d) => { setDetail(d); setRules((d?.rules || []).map((r: any) => ({ id: r.id, label: r.label || "", total_cents: r.total_cents, cities: r.cities || [] }))); }).catch((e) => setErr(e?.message || "Failed"));
  }, [sel]);

  const flash = (m: string) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 3500); };
  const refresh = async () => { await loadGroups(); if (sel) { const d = await api.priceGroup(sel); setDetail(d); setRules((d?.rules || []).map((r: any) => ({ id: r.id, label: r.label || "", total_cents: r.total_cents, cities: r.cities || [] }))); } };

  const newGroup = async () => {
    const name = window.prompt(t("New pricing group name", "Nom du nouveau groupe tarifaire"));
    if (!name || !name.trim()) return;
    setBusy(true); setErr("");
    try { const id = await api.priceGroupCreate(name.trim()); await loadGroups(); setSel(id as any); flash(t("Group created.", "Groupe créé.")); }
    catch (e: any) { setErr(e?.message || "Failed to create"); }
    setBusy(false);
  };

  const saveRules = async () => {
    if (!sel) return;
    setBusy(true); setErr("");
    try {
      const payload = rules.map((r) => ({ label: r.label, total_cents: Math.round(r.total_cents), cities: r.cities.map((c) => c.trim()).filter(Boolean) }));
      await api.priceGroupSetRules(sel, payload);
      await refresh();
      flash(t("Rates saved & re-applied to all members.", "Tarifs enregistrés et réappliqués à tous les membres."));
    } catch (e: any) { setErr(e?.message || "Failed to save rates"); }
    setBusy(false);
  };

  const addMember = async () => {
    if (!sel || !addOrg) return;
    setBusy(true); setErr("");
    try { await api.priceGroupAddMember(sel, addOrg); setAddOrg(""); await refresh(); flash(t("Member added — pricing applied.", "Membre ajouté — tarification appliquée.")); }
    catch (e: any) { setErr(e?.message || "Failed to add member"); }
    setBusy(false);
  };
  const removeMember = async (org: string, name: string) => {
    if (!sel || !window.confirm(t(`Remove ${name} from this group? They revert to standard pricing.`, `Retirer ${name} de ce groupe ? Il revient à la tarification standard.`))) return;
    setBusy(true); setErr("");
    try { await api.priceGroupRemoveMember(sel, org); await refresh(); flash(t("Member removed.", "Membre retiré.")); }
    catch (e: any) { setErr(e?.message || "Failed"); }
    setBusy(false);
  };
  const delGroup = async () => {
    if (!sel || !detail) return;
    if (!window.confirm(t(`Delete group “${detail.name}” and remove its pricing from all members? This can't be undone.`, `Supprimer le groupe « ${detail.name} » et retirer sa tarification de tous les membres ? Irréversible.`))) return;
    setBusy(true); setErr("");
    try { await api.priceGroupDelete(sel); setSel(null); await loadGroups(); flash(t("Group deleted.", "Groupe supprimé.")); }
    catch (e: any) { setErr(e?.message || "Failed"); }
    setBusy(false);
  };

  const setRule = (i: number, patch: Partial<Rule>) => setRules((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const memberIds = new Set((detail?.members || []).map((m: any) => m.org_id));
  const addable = orgs.filter((o) => !memberIds.has(o.id));

  return (
    <>
      <h1 style={{ display: "flex", alignItems: "center", gap: 9 }}><Tags size={22} strokeWidth={2} />{t("Pricing groups", "Groupes tarifaires")}</h1>
      <div className="sub">{t("Flat, tax-inclusive rate cards. Members are billed the group rate for matching destinations; everything else uses standard distance pricing.", "Cartes de tarifs forfaitaires, taxes incluses. Les membres sont facturés au tarif du groupe pour les destinations correspondantes ; le reste utilise la tarification standard.")}</div>
      {msg ? <div className="card" style={{ marginTop: 12, borderColor: "var(--green)", color: "#178a5e", fontWeight: 700 }}>{msg}</div> : null}
      {err ? <div className="card" style={{ marginTop: 12, borderColor: "var(--red)", color: "var(--red)", fontWeight: 700 }}>{err}</div> : null}

      <div style={{ display: "flex", gap: 20, marginTop: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Group list */}
        <div style={{ flex: "0 0 300px", minWidth: 260 }}>
          <button className="btn" style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }} disabled={busy} onClick={newGroup}><Plus size={16} strokeWidth={2.4} />{t("New group", "Nouveau groupe")}</button>
          {groups === null ? <div className="sub">{t("Loading…", "Chargement…")}</div>
            : groups.length === 0 ? <div className="sub">{t("No pricing groups yet.", "Aucun groupe tarifaire.")}</div>
            : groups.map((g) => (
              <div key={g.id} onClick={() => setSel(g.id)} className="card" style={{ marginBottom: 10, cursor: "pointer", borderColor: sel === g.id ? "var(--accent)" : undefined, borderWidth: sel === g.id ? 2 : 1 }}>
                <div style={{ fontWeight: 800 }}>{g.name}</div>
                <div className="sub" style={{ fontSize: 12, marginTop: 3 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={12} strokeWidth={2} />{g.member_count} {t("member(s)", "membre(s)")}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {(g.rules || []).map((r: any, i: number) => (
                    <span key={i} className="pill pmag" style={{ fontSize: 11 }}>{money(r.total_cents)} · {r.label || `${r.city_count} ${t("cities", "villes")}`}</span>
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Group detail */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {!detail ? <div className="card sub">{t("Select a group to manage its rates and members.", "Sélectionnez un groupe pour gérer ses tarifs et ses membres.")}</div> : (
            <>
              <div className="card">
                <div style={{ display: "flex", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{detail.name}</h2>
                  <button className="btn ghost" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--red)" }} disabled={busy} onClick={delGroup}><Trash2 size={14} strokeWidth={2} />{t("Delete", "Supprimer")}</button>
                </div>

                <div className="mono" style={{ marginTop: 14 }}>{t("Rates (tax included)", "Tarifs (taxes incluses)")}</div>
                {rules.map((r, i) => (
                  <div key={i} style={{ border: "1px solid var(--line,#E7E3D9)", borderRadius: 12, padding: 12, marginTop: 8 }}>
                    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 200px" }}><div className="mono" style={{ fontSize: 10 }}>{t("Label", "Étiquette")}</div><input className="input" value={r.label} onChange={(e) => setRule(i, { label: e.target.value })} placeholder={t("e.g. Montréal", "ex. Montréal")} /></div>
                      <div style={{ flex: "0 0 130px" }}><div className="mono" style={{ fontSize: 10 }}>{t("All-in price ($)", "Prix tout inclus ($)")}</div>
                        <input className="input" type="number" min={0} step="0.01" value={(r.total_cents / 100).toString()} onChange={(e) => setRule(i, { total_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })} />
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}><div className="mono" style={{ fontSize: 10 }}>{t("Destination cities (comma-separated)", "Villes de destination (séparées par des virgules)")}</div>
                      <textarea className="input" style={{ minHeight: 58, fontFamily: "inherit" }} value={r.cities.join(", ")} onChange={(e) => setRule(i, { cities: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} />
                      <div className="sub" style={{ fontSize: 11, marginTop: 3 }}>{r.cities.length} {t("cities · applies to door, hub & zone pickups", "villes · s’applique aux ramassages porte, relais et zone")}</div>
                    </div>
                    <button className="btn ghost" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--red)", fontSize: 12 }} onClick={() => setRules((rs) => rs.filter((_, idx) => idx !== i))}><X size={13} strokeWidth={2.4} />{t("Remove rate", "Retirer le tarif")}</button>
                  </div>
                ))}
                <div className="row" style={{ gap: 10, marginTop: 10 }}>
                  <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setRules((rs) => [...rs, { label: "", total_cents: 1500, cities: [] }])}><Plus size={14} strokeWidth={2.4} />{t("Add rate", "Ajouter un tarif")}</button>
                  <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 7 }} disabled={busy} onClick={saveRules}><Save size={15} strokeWidth={2} />{busy ? t("Saving…", "Enregistrement…") : t("Save rates", "Enregistrer les tarifs")}</button>
                </div>
                <div className="sub" style={{ fontSize: 11.5, marginTop: 10, display: "flex", gap: 7, alignItems: "flex-start" }}><Info size={14} strokeWidth={2} style={{ flex: "none", marginTop: 1 }} />{t("Prices are tax-inclusive: we store the pre-tax amount that grosses up to this all-in total for each city's province, so the customer pays exactly this.", "Les prix incluent la taxe : nous stockons le montant avant taxe qui atteint ce total tout inclus selon la province de chaque ville, afin que le client paie exactement ce montant.")}</div>
              </div>

              {/* Members */}
              <div className="card" style={{ marginTop: 16 }}>
                <div className="mono">{t("Members", "Membres")} ({(detail.members || []).length})</div>
                {(detail.members || []).length === 0 ? <div className="sub" style={{ fontSize: 12.5, marginTop: 6 }}>{t("No members yet.", "Aucun membre.")}</div> : (
                  <div style={{ marginTop: 8 }}>
                    {detail.members.map((m: any) => (
                      <div key={m.org_id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line,#F1EEE7)" }}>
                        <span style={{ fontWeight: 700 }}>{m.name}</span>
                        <button className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--red)", fontSize: 12, padding: "5px 10px" }} disabled={busy} onClick={() => removeMember(m.org_id, m.name)}><X size={13} strokeWidth={2.4} />{t("Remove", "Retirer")}</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row" style={{ gap: 10, marginTop: 12 }}>
                  <select className="input" style={{ flex: 1 }} value={addOrg} onChange={(e) => setAddOrg(e.target.value)}>
                    <option value="">{t("Add a business…", "Ajouter une entreprise…")}</option>
                    {addable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} disabled={busy || !addOrg} onClick={addMember}><Plus size={15} strokeWidth={2.4} />{t("Add member", "Ajouter")}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
