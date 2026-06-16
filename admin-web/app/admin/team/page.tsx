"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const ROLES = ["admin", "dispatcher", "finance", "support"];
const roleTone = (r: string) => ({ owner: "pmag", admin: "pmag", dispatcher: "pblue", finance: "pgold", support: "pgrey" } as any)[r] || "pgrey";
// Grantable sections (Team & access is owner-only and not listed — it can't be delegated).
const CAPS: { key: string; label: string; fr: string }[] = [
  { key: "orgs", label: "Organizations", fr: "Organisations" },
  { key: "revenue", label: "Revenue", fr: "Revenus" },
  { key: "parcels", label: "Parcels", fr: "Colis" },
  { key: "claims", label: "Claims", fr: "Réclamations" },
  { key: "members", label: "Members", fr: "Membres" },
];

export default function Team() {
  const { t, lang } = useLang();
  const [team, setTeam] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [caps, setCaps] = useState<string[]>([]);
  const [editAccess, setEditAccess] = useState<any | null>(null); // a staff member whose access is being edited
  const [editCaps, setEditCaps] = useState<string[]>([]);
  const [keyModal, setKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(() => { api.team().then(setTeam).catch(() => {}); api.keys().then(setKeys).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (list: string[], set: (v: string[]) => void, k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const capLabel = (c: { label: string; fr: string }) => lang === "fr" ? c.fr : c.label;
  const capSummary = (m: any) => m.role === "owner" ? t("Full access", "Accès complet") : ((m.caps || []).length ? (m.caps as string[]).map((c) => { const f = CAPS.find((x) => x.key === c); return f ? capLabel(f) : c; }).join(", ") : t("No sections", "Aucune section"));

  const sendInvite = async () => {
    // Accept one or many emails — comma, space, semicolon, or newline separated.
    const emails = Array.from(new Set(email.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
    if (!emails.length) return;
    const results = await Promise.all(emails.map(async (e) => {
      try { const r: any = await api.invite(e, role, caps); return { e, ok: true, emailed: !!r?.emailed, err: r?.error }; }
      catch (err: any) { return { e, ok: false, emailed: false, err: err?.message }; }
    }));
    setInvite(false); setEmail(""); setCaps([]); load();
    const emailed = results.filter((r) => r.emailed).length;
    const failed = results.filter((r) => !r.ok);
    let msg = t(`${emailed}/${emails.length} invite(s) emailed.`, `${emailed}/${emails.length} invitation(s) envoyée(s) par courriel.`);
    const madeNotSent = results.filter((r) => r.ok && !r.emailed);
    if (madeNotSent.length) msg += t(` ${madeNotSent.length} created but email failed.`, ` ${madeNotSent.length} créée(s) mais l’envoi du courriel a échoué.`);
    if (failed.length) msg += t(`\nFailed: ${failed.map((f) => f.e).join(", ")}`, `\nÉchec : ${failed.map((f) => f.e).join(", ")}`);
    alert(msg);
  };
  const remove = async (m: any) => { if (!m.user_id || !confirm(t(`Remove ${m.name || m.email}?`, `Retirer ${m.name || m.email} ?`))) return; try { await api.removeStaff(m.user_id); load(); } catch (e: any) { alert(e?.message); } };
  const resend = async (m: any) => { try { const r: any = await api.invite(m.email, m.role, m.caps || []); alert(r?.emailed ? t("Invite re-sent.", "Invitation renvoyée.") : t("Re-created, but email failed: ", "Recréée, mais l’envoi du courriel a échoué : ") + (r?.error || t("unknown", "inconnu"))); load(); } catch (e: any) { alert(e?.message); } };
  const cancelInvite = async (m: any) => { if (!confirm(t(`Delete the pending invite for ${m.email}?`, `Supprimer l’invitation en attente pour ${m.email} ?`))) return; try { await api.cancelInvite(m.email); load(); } catch (e: any) { alert(e?.message); } };
  const openAccess = (m: any) => { setEditAccess(m); setEditCaps([...(m.caps || [])]); };
  const saveAccess = async () => { if (!editAccess?.user_id) return; try { await api.setCaps(editAccess.user_id, editCaps); setEditAccess(null); load(); } catch (e: any) { alert(e?.message); } };
  const createKey = async () => { if (!keyName.trim()) return; try { const r = await api.createKey(keyName.trim(), ["read_parcels"]); setKeyModal(false); setKeyName(""); setNewKey(r.key); load(); } catch (e: any) { alert(e?.message); } };
  const revoke = async (k: any) => { if (!confirm(t(`Revoke ${k.name}?`, `Révoquer ${k.name} ?`))) return; try { await api.revokeKey(k.id); load(); } catch {} };

  return (
    <>
      <h1>{t("Team & access", "Équipe et accès")}</h1>
      <div className="sub">{t("Owner only · scoped staff roles + API keys", "Propriétaire seulement · rôles d’équipe restreints + clés API")}</div>

      <div className="mono">{t("Staff", "Équipe")}</div>
      <table style={{ marginBottom: 12 }}>
        <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Email", "Courriel")}</th><th>{t("Role", "Rôle")}</th><th>{t("Access", "Accès")}</th><th></th></tr></thead>
        <tbody>
          {team.map((m, i) => (
            <tr key={(m.user_id ?? m.email) + i}>
              <td><b>{m.name || m.email}</b>{m.pending ? <span className="pill pgrey" style={{ marginLeft: 6 }}>{t("pending", "en attente")}</span> : null}</td>
              <td>{m.email}</td>
              <td><span className={"pill " + roleTone(m.role)}>{m.role}</span></td>
              <td style={{ color: m.role === "owner" ? "var(--accent)" : (m.caps || []).length ? "inherit" : "var(--t3)", fontSize: 12.5 }}>{capSummary(m)}</td>
              <td>
                {m.pending ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost" onClick={() => resend(m)}>{t("Resend", "Renvoyer")}</button>
                    <button className="btn ghost" onClick={() => cancelInvite(m)}>{t("Delete", "Supprimer")}</button>
                  </div>
                ) : m.user_id && m.role !== "owner" ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost" onClick={() => openAccess(m)}>{t("Access", "Accès")}</button>
                    <button className="btn ghost" onClick={() => remove(m)}>{t("Remove", "Retirer")}</button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn dark" onClick={() => setInvite(true)}>＋ {t("Invite staff", "Inviter un membre")}</button>

      <div className="mono" style={{ marginTop: 22 }}>{t("API access keys", "Clés d’accès API")}</div>
      <table style={{ marginBottom: 12 }}>
        <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Key", "Clé")}</th><th>{t("Scopes", "Portées")}</th><th>{t("Status", "Statut")}</th><th></th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} style={{ opacity: k.revoked_at ? 0.5 : 1 }}>
              <td><b>{k.name}</b></td>
              <td style={{ fontFamily: "monospace" }}>{k.prefix}••••</td>
              <td>{(k.scopes || []).join(", ")}</td>
              <td><span className={"pill " + (k.revoked_at ? "pred" : "pg")}>{k.revoked_at ? t("revoked", "révoquée") : t("active", "active")}</span></td>
              <td>{!k.revoked_at && <button className="btn ghost" onClick={() => revoke(k)}>{t("Revoke", "Révoquer")}</button>}</td>
            </tr>
          ))}
          {keys.length === 0 && <tr><td colSpan={5} style={{ color: "var(--t3)" }}>{t("No keys.", "Aucune clé.")}</td></tr>}
        </tbody>
      </table>
      <button className="btn ghost" onClick={() => setKeyModal(true)}>＋ {t("Create access key", "Créer une clé d’accès")}</button>

      {invite && (
        <div className="modalbg" onClick={() => setInvite(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{t("Invite staff", "Inviter un membre")}</h3>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@kolis.ca, other@kolis.ca" />
          <div className="sub" style={{ marginTop: 4, fontSize: 12 }}>{t("Tip: invite several at once — separate emails with a comma.", "Astuce : invitez-en plusieurs à la fois — séparez les courriels par une virgule.")}</div>
          <div className="mono" style={{ marginTop: 12 }}>{t("Title", "Titre")}</div>
          <div>{ROLES.map((r) => <button key={r} className={"chip" + (role === r ? " on" : "")} style={{ marginRight: 6, marginBottom: 6, textTransform: "capitalize" }} onClick={() => setRole(r)}>{r}</button>)}</div>
          <div className="mono" style={{ marginTop: 12 }}>{t("Access — pick the sections they can use", "Accès — choisissez les sections qu’ils peuvent utiliser")}</div>
          <div className="sub" style={{ marginBottom: 6 }}>{t("Nothing is granted by default. Team & access stays owner-only.", "Rien n’est accordé par défaut. Équipe et accès reste réservé au propriétaire.")}</div>
          <div>{CAPS.map((c) => <button key={c.key} className={"chip" + (caps.includes(c.key) ? " on" : "")} style={{ marginRight: 6, marginBottom: 6 }} onClick={() => toggle(caps, setCaps, c.key)}>{caps.includes(c.key) ? "✓ " : ""}{capLabel(c)}</button>)}</div>
          <div className="row" style={{ marginTop: 14 }}><button className="btn ghost" style={{ flex: 1 }} onClick={() => setInvite(false)}>{t("Cancel", "Annuler")}</button><button className="btn" style={{ flex: 1 }} onClick={sendInvite}>{t("Send invite", "Envoyer l’invitation")}</button></div>
        </div></div>
      )}
      {editAccess && (
        <div className="modalbg" onClick={() => setEditAccess(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{t("Access", "Accès")} · {editAccess.name || editAccess.email}</h3>
          <div className="sub" style={{ marginBottom: 10 }}>{t("Switch on the sections this person can use. Team & access stays owner-only.", "Activez les sections que cette personne peut utiliser. Équipe et accès reste réservé au propriétaire.")}</div>
          <div>{CAPS.map((c) => <button key={c.key} className={"chip" + (editCaps.includes(c.key) ? " on" : "")} style={{ marginRight: 6, marginBottom: 6 }} onClick={() => toggle(editCaps, setEditCaps, c.key)}>{editCaps.includes(c.key) ? "✓ " : ""}{capLabel(c)}</button>)}</div>
          <div className="row" style={{ marginTop: 14 }}><button className="btn ghost" style={{ flex: 1 }} onClick={() => setEditAccess(null)}>{t("Cancel", "Annuler")}</button><button className="btn" style={{ flex: 1 }} onClick={saveAccess}>{t("Save access", "Enregistrer l’accès")}</button></div>
        </div></div>
      )}
      {keyModal && (
        <div className="modalbg" onClick={() => setKeyModal(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{t("New access key", "Nouvelle clé d’accès")}</h3>
          <input className="input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="ops-integration" />
          <div className="sub" style={{ marginTop: 8 }}>{t("Scope: read parcels. Shown once on creation.", "Portée : lecture des colis. Affichée une seule fois à la création.")}</div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn ghost" style={{ flex: 1 }} onClick={() => setKeyModal(false)}>{t("Cancel", "Annuler")}</button><button className="btn" style={{ flex: 1 }} onClick={createKey}>{t("Create", "Créer")}</button></div>
        </div></div>
      )}
      {newKey && (
        <div className="modalbg"><div className="modal">
          <h3 style={{ marginTop: 0 }}>🔑 {t("Copy your key now", "Copiez votre clé maintenant")}</h3>
          <div className="sub">{t("It won't be shown again.", "Elle ne sera plus affichée.")}</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "var(--bg)", padding: 12, borderRadius: 9, wordBreak: "break-all", margin: "10px 0" }}>{newKey}</div>
          <button className="btn dark" style={{ width: "100%" }} onClick={() => setNewKey(null)}>{t("Done", "Terminé")}</button>
        </div></div>
      )}
    </>
  );
}
