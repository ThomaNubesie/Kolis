"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { COUNTRIES, countryByCode, toE164 } from "@/lib/countries";
import { cityList, regionFor } from "@/lib/cities";
import { emailOk, phoneOk, nameOk, cityOk } from "@/lib/validate";
import { verifyEmail, emailReason } from "@/lib/emailVerify";
import { Smartphone, Home, Briefcase } from "lucide-react";

type Client = {
  id: string; full_name: string; email: string | null; mobile: string | null;
  home_phone: string | null; work_phone: string | null; address: string | null;
  city: string | null; province: string | null; postal: string | null; country: string | null; notes: string | null;
};
const EMPTY: Partial<Client> = { full_name: "", email: "", mobile: "", home_phone: "", work_phone: "", address: "", city: "", province: "", postal: "", country: "CA", notes: "" };

export default function Clients() {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const [rows, setRows] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => org.clients(active.org_id, search || null).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const set = (k: string, v: string) => setEdit((s) => ({ ...s, [k]: v }));

  const save = async () => {
    const ca = (edit?.country || "CA") === "CA";
    if (!nameOk(edit?.full_name)) { setErr(t("Enter the client's full name.", "Entrez le nom complet du client.")); return; }
    if (!emailOk(edit?.email)) { setErr(t("A valid email address is required.", "Une adresse courriel valide est requise.")); return; }
    if (ca ? !phoneOk(edit?.mobile) : !edit?.mobile?.trim()) { setErr(t("Enter a valid 10-digit mobile number.", "Entrez un numéro de mobile valide (10 chiffres).")); return; }
    if (!edit?.address?.trim()) { setErr(t("Home address is required.", "L’adresse est requise.")); return; }
    if (ca && !cityOk(edit?.city)) { setErr(t("Choose a served city from the list so the address matches a city we cover.", "Choisissez une ville desservie dans la liste pour que l’adresse corresponde à une ville couverte.")); return; }
    setBusy(true); setErr("");
    const v = await verifyEmail(edit?.email);
    if (!v.ok) { setBusy(false); setErr(emailReason(v, lang === "fr")); return; }
    const dial = countryByCode(edit.country).dial;
    const payload = { ...edit, mobile: edit.mobile ? toE164(edit.mobile, dial) : edit.mobile };
    try { await org.clientSave(active.org_id, payload); setEdit(null); flash(t("Client saved.", "Client enregistré.")); load(); }
    catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };
  const del = async (c: Client) => {
    if (!confirm(t(`Delete ${c.full_name}?`, `Supprimer ${c.full_name} ?`))) return;
    try { await org.clientDelete(active.org_id, c.id); load(); } catch (e: any) { setErr(e?.message || ""); }
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("Clients", "Clients")}</h1><div className="sub">{active.name} · {rows.length} {t("saved", "enregistrés")}</div></div>
        <button className="btn" onClick={() => { setErr(""); setEdit({ ...EMPTY }); }}>+ {t("Add client", "Ajouter un client")}</button>
      </div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", margin: "8px 0" }}>{msg}</div> : null}
      <div className="toolbar">
        <input className="search" placeholder={t("Search name, phone, email, city…", "Rechercher nom, téléphone, courriel, ville…")} value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn ghost" onClick={load}>{t("Search", "Rechercher")}</button>
      </div>
      <table>
        <thead><tr><th>{t("Client", "Client")}</th><th>{t("Phones", "Téléphones")}</th><th>{t("Address", "Adresse")}</th><th>{t("Notes", "Notes")}</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><a href={`/shipper/clients/${c.id}`} style={{ color: "#B81558", fontWeight: 800, textDecoration: "none" }}>{c.full_name}</a>{c.email ? <div className="sub" style={{ fontSize: 12 }}>{c.email}</div> : null}</td>
              <td style={{ fontSize: 12.5 }}>{c.mobile ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Smartphone size={13} strokeWidth={2} /> {c.mobile}</div> : null}{c.home_phone ? <div className="sub" style={{ display: "flex", alignItems: "center", gap: 5 }}><Home size={12} strokeWidth={2} /> {c.home_phone}</div> : null}{c.work_phone ? <div className="sub" style={{ display: "flex", alignItems: "center", gap: 5 }}><Briefcase size={12} strokeWidth={2} /> {c.work_phone}</div> : null}</td>
              <td style={{ fontSize: 12.5 }}>{c.address || "—"}{c.city ? <div className="sub">{[c.city, c.province, c.postal].filter(Boolean).join(", ")}</div> : null}</td>
              <td className="sub" style={{ fontSize: 12 }}>{c.notes || "—"}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn ghost" onClick={() => { setErr(""); setEdit(c); }}>{t("Edit", "Modifier")}</button>
                <button className="btn ghost" onClick={() => del(c)}>{t("Delete", "Supprimer")}</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--t3)" }}>{t("No clients yet — add your first one.", "Aucun client — ajoutez le premier.")}</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modalbg" onClick={() => !busy && setEdit(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>{edit.id ? t("Edit client", "Modifier le client") : t("Add a client", "Ajouter un client")}</h2>
              <button className="btn ghost" onClick={() => !busy && setEdit(null)}>✕</button>
            </div>
            <div className="mono" style={{ marginTop: 10 }}>{t("Full name *", "Nom complet *")}</div>
            <input className="input" value={edit.full_name || ""} onChange={(e) => set("full_name", e.target.value)} />
            <div className="mono" style={{ marginTop: 10 }}>{t("Country *", "Pays *")}</div>
            <select className="input" value={edit.country || "CA"} onChange={(e) => set("country", e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <div className="mono" style={{ marginTop: 10 }}>{t("Email *", "Courriel *")}</div>
            <input className="input" type="email" value={edit.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="name@email.com" />
            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1 }}><div className="mono">{t("Mobile *", "Mobile *")}</div><input className="input" value={edit.mobile || ""} onChange={(e) => set("mobile", e.target.value)} placeholder={`${countryByCode(edit.country).dial} ${countryByCode(edit.country).phonePh}`} inputMode="tel" /></div>
              <div style={{ flex: 1 }}><div className="mono">{t("Home", "Domicile")}</div><input className="input" value={edit.home_phone || ""} onChange={(e) => set("home_phone", e.target.value)} /></div>
              <div style={{ flex: 1 }}><div className="mono">{t("Work", "Travail")}</div><input className="input" value={edit.work_phone || ""} onChange={(e) => set("work_phone", e.target.value)} /></div>
            </div>
            <div className="mono" style={{ marginTop: 10 }}>{t("Home address *", "Adresse *")}</div>
            <input className="input" value={edit.address || ""} onChange={(e) => set("address", e.target.value)} placeholder={t("Street, unit", "Rue, unité")} />
            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <div style={{ flex: 2 }}><div className="mono">{t("City", "Ville")}</div>
                <input className="input" list="client-cities" value={edit.city || ""} onChange={(e) => { const v = e.target.value; set("city", v); const r = regionFor(v); if (r && r !== v && !edit.province) set("province", r); }} />
                <datalist id="client-cities">{cityList.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div style={{ flex: 1 }}><div className="mono">{countryByCode(edit.country).region}</div><input className="input" value={edit.province || ""} onChange={(e) => set("province", e.target.value)} /></div>
              <div style={{ flex: 1 }}><div className="mono">{countryByCode(edit.country).postal}</div><input className="input" value={edit.postal || ""} onChange={(e) => set("postal", e.target.value)} placeholder={countryByCode(edit.country).postalPh} /></div>
            </div>
            <div className="mono" style={{ marginTop: 10 }}>{t("Delivery notes", "Notes de livraison")}</div>
            <input className="input" value={edit.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder={t("Buzzer, floor, leave-at-door…", "Sonnette, étage, laisser à la porte…")} />
            {err ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? t("Saving…", "Enregistrement…") : t("Save client", "Enregistrer")}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setEdit(null)}>{t("Cancel", "Annuler")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
