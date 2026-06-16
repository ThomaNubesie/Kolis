"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const dollars = (c: number) => ((c || 0) / 100).toString();
const KYB: Record<string, string> = { verified: "pg", pending: "pgold", rejected: "pred" };

export default function OrgDetail() {
  const router = useRouter();
  const { t } = useLang();
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // editable profile + limits
  const [name, setName] = useState("");
  const [billing, setBilling] = useState("");
  const [credit, setCredit] = useState("");
  const [discount, setDiscount] = useState("");
  const [net, setNet] = useState("");
  // invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("owner");

  const load = async () => {
    const o = (await api.org(id).catch(() => []))?.[0] ?? null;
    setOrg(o);
    if (o) { setName(o.name ?? ""); setBilling(o.billing_email ?? ""); setCredit(dollars(o.credit_limit_cents)); setDiscount(String(Math.round((o.discount_rate || 0) * 100))); setNet(String(o.net_terms_days)); }
    setMembers(await api.orgMembers(id).catch(() => []));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const flash = (m: string) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 2500); };
  const fail = (e: any) => setErr(e?.message || t("Failed.", "Échec."));

  // KYB + account-status labels (display only; backend values unchanged).
  const kybLabel = (s?: string) => ({ verified: t("verified", "vérifié"), pending: t("pending", "en attente"), rejected: t("rejected", "refusé") } as Record<string, string>)[s || ""] || s || "";
  const statusLabel = (s?: string) => ({ active: t("active", "actif"), suspended: t("suspended", "suspendu") } as Record<string, string>)[s || ""] || s || "";

  const saveProfile = async () => {
    if (!name.trim()) { setErr(t("Name can't be empty.", "Le nom ne peut pas être vide.")); return; }
    try { await api.setOrgProfile(id, { name: name.trim(), billing_email: billing.trim() }); flash(t("Saved.", "Enregistré.")); load(); } catch (e) { fail(e); }
  };
  const saveLimits = async () => {
    try {
      await api.setOrgLimits(id, { credit_limit_cents: Math.round((Number(credit) || 0) * 100), discount: (Number(discount) || 0) / 100, net_terms: Number(net) || 30 });
      flash(t("Saved.", "Enregistré.")); load();
    } catch (e) { fail(e); }
  };
  const setKyb = async (s: string) => { try { await api.setOrgKyb(id, s); flash("KYB " + kybLabel(s)); load(); } catch (e) { fail(e); } };
  const setStatus = async (s: string) => { try { await api.setOrgStatus(id, s); flash(statusLabel(s)); load(); } catch (e) { fail(e); } };
  const inviteByEmail = async () => {
    // One or many emails — comma, space, semicolon, or newline separated.
    const emails = Array.from(new Set(inviteEmail.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
    if (!emails.length) return;
    const results = await Promise.all(emails.map(async (e) => {
      try { const r: any = await api.orgInviteEmail(id, e, inviteRole); return { e, ok: true, emailed: !!r?.emailed }; }
      catch (err: any) { return { e, ok: false, emailed: false, err: err?.message }; }
    }));
    setInviteEmail("");
    const emailed = results.filter((r) => r.emailed).length;
    const failed = results.filter((r) => !r.ok);
    if (failed.length) setErr(t(`Couldn't invite: ${failed.map((f) => f.e).join(", ")}`, `Impossible d’inviter : ${failed.map((f) => f.e).join(", ")}`));
    else flash(t(`${emailed}/${emails.length} invite(s) emailed — they'll appear once they sign in with that email.`, `${emailed}/${emails.length} invitation(s) envoyée(s) par courriel — elles apparaîtront dès la connexion avec ce courriel.`));
  };
  const addByPhone = async () => {
    if (!invitePhone.trim()) return;
    try { const r = await api.orgAddByPhone(id, invitePhone.trim(), inviteRole); setInvitePhone(""); flash(t("Added ", "Ajouté ") + (r?.full_name || t("member", "membre"))); load(); }
    catch (e: any) { setErr(e?.message?.includes("no_account_for_phone") ? t("No Kolis account with that phone — they must sign in once first.", "Aucun compte Kolis avec ce téléphone — il doit se connecter une première fois.") : (e?.message || t("Failed.", "Échec."))); }
  };
  const remove = async (uid: string) => { if (!confirm(t("Remove this member?", "Retirer ce membre ?"))) return; try { await api.orgRemoveMember(id, uid); load(); } catch (e) { fail(e); } };

  if (!org) return <div className="sub">{t("Loading…", "Chargement…")}</div>;

  return (
    <>
      <div className="sub" style={{ cursor: "pointer" }} onClick={() => router.push("/admin/orgs")}>← {t("Organizations", "Organisations")}</div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>{org.name}</h1><div className="sub">{org.type} · {org.billing_email || t("no billing email", "aucun courriel de facturation")}</div></div>
        <div className="row">
          <span className={"pill " + (KYB[org.kyb_status] || "pgrey")}>KYB {kybLabel(org.kyb_status)}</span>
          <span className={"pill " + (org.status === "active" ? "pg" : "pred")}>{statusLabel(org.status)}</span>
        </div>
      </div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", marginBottom: 10 }}>{msg}</div> : null}
      {err ? <div className="warn">{err}</div> : null}

      <div className="cols">
        {/* Business details (editable name + billing email) */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <div className="mono">{t("Business details", "Détails de l’entreprise")}</div>
          <div className="mono">{t("Name", "Nom")}</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Business name", "Nom de l’entreprise")} />
          <div className="mono" style={{ marginTop: 10 }}>{t("Billing email", "Courriel de facturation")}</div>
          <input className="input" value={billing} onChange={(e) => setBilling(e.target.value)} placeholder="billing@company.com" />
          <button className="btn" style={{ marginTop: 10 }} onClick={saveProfile}>{t("Save", "Enregistrer")}</button>
        </div>

        {/* Limits & terms */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <div className="mono">{t("Credit & terms", "Crédit et conditions")}</div>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}><div className="mono">{t("Credit limit $", "Limite de crédit $")}</div><input className="input" value={credit} onChange={(e) => setCredit(e.target.value)} inputMode="numeric" /></div>
            <div style={{ flex: 1 }}><div className="mono">{t("Discount %", "Remise %")}</div><input className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" /></div>
            <div style={{ flex: 1 }}><div className="mono">{t("Net days", "Jours net")}</div><input className="input" value={net} onChange={(e) => setNet(e.target.value)} inputMode="numeric" /></div>
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={saveLimits}>{t("Save", "Enregistrer")}</button>
        </div>

        {/* KYB + status */}
        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <div className="mono">{t("Verification (KYB)", "Vérification (KYB)")}</div>
          <div className="row" style={{ marginBottom: 12 }}>
            {["verified", "pending", "rejected"].map((s) => (
              <button key={s} className={"chip" + (org.kyb_status === s ? " on" : "")} onClick={() => setKyb(s)}>{kybLabel(s)}</button>
            ))}
          </div>
          <div className="mono">{t("Account status", "Statut du compte")}</div>
          <div className="row">
            <button className={"chip" + (org.status === "active" ? " on" : "")} onClick={() => setStatus("active")}>{statusLabel("active")}</button>
            <button className={"chip" + (org.status === "suspended" ? " on" : "")} onClick={() => setStatus("suspended")}>{statusLabel("suspended")}</button>
          </div>
        </div>
      </div>

      {/* Members + invite */}
      <div className="card">
        <div className="mono">{t("Add owner / member", "Ajouter un propriétaire / membre")}</div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div className="mono">{t("Invite by email (they sign in with this email)", "Inviter par courriel (connexion avec ce courriel)")}</div>
            <input className="input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="owner@company.com, other@company.com" />
          </div>
          <select className="input" style={{ width: 130 }} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {["owner", "admin", "finance", "shipper", "dispatcher", "driver"].map((rr) => <option key={rr} value={rr}>{rr}</option>)}
          </select>
          <button className="btn" onClick={inviteByEmail}>{t("Email invite", "Inviter par courriel")}</button>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div className="mono">{t("…or add an existing Kolis user by phone", "…ou ajouter un utilisateur Kolis existant par téléphone")}</div>
            <input className="input" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} placeholder="+1 613 555 0192" />
          </div>
          <button className="btn ghost" onClick={addByPhone}>{t("Add by phone", "Ajouter par téléphone")}</button>
        </div>
      </div>

      <table>
        <thead><tr><th>{t("Member", "Membre")}</th><th>{t("Email", "Courriel")}</th><th>{t("Role", "Rôle")}</th><th></th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.full_name || "—"}</td><td>{m.email || "—"}</td><td><span className="pill pmag">{m.role}</span></td>
              <td><button className="btn ghost" onClick={() => remove(m.user_id)}>{t("Remove", "Retirer")}</button></td>
            </tr>
          ))}
          {members.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>{t("No members yet — invite the owner above.", "Aucun membre — invitez le propriétaire ci-dessus.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
