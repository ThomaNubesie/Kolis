"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const ROLES = ["owner", "admin", "finance", "shipper"];

export default function Team() {
  const { active } = useOrg();
  const { t } = useLang();
  // Display label for a backend role key (value stays untranslated).
  const roleLabel = (r: string) => ({
    owner: t("owner", "propriétaire"), admin: t("admin", "admin"),
    finance: t("finance", "finances"), shipper: t("shipper", "expéditeur"),
  } as Record<string, string>)[r] || r;
  const canManage = active.role === "owner" || active.role === "admin"; // invite + change roles
  const isOwner = active.role === "owner"; // remove member is owner-only
  const [data, setData] = useState<{ members: any[]; invites: any[] }>({ members: [], invites: [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("shipper");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => org.team(active.org_id).then(setData).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);

  const invite = async () => {
    // One or many emails — comma, space, semicolon, or newline separated.
    const emails = Array.from(new Set(email.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
    if (!emails.length) return;
    setBusy(true); setErr("");
    const results = await Promise.all(emails.map(async (e) => {
      try { await org.invite(active.org_id, e, role); return { e, ok: true }; }
      catch (err: any) { return { e, ok: false, err: err?.message }; }
    }));
    setBusy(false);
    const failed = results.filter((r) => !r.ok);
    setErr(failed.length ? t(`Couldn't invite: ${failed.map((f) => f.e).join(", ")}`, `Impossible d’inviter : ${failed.map((f) => f.e).join(", ")}`) : "");
    setEmail(""); load();
  };
  const changeRole = async (user: string, r: string) => { try { await org.setRole(active.org_id, user, r); load(); } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); } };
  const remove = async (user: string) => { if (!confirm(t("Remove this member?", "Retirer ce membre ?"))) return; try { await org.removeMember(active.org_id, user); load(); } catch (e: any) { setErr(e?.message || t("Failed.", "Échec.")); } };

  return (
    <>
      <h1>{t("Team & seats", "Équipe et sièges")}</h1>
      <div className="sub">{t(`${active.name} · company KYB means no per-person verification fee.`, `${active.name} · le KYB d’entreprise élimine les frais de vérification par personne.`)}</div>
      {canManage && (
        <div className="card" style={{ maxWidth: 560 }}>
          <p className="mono">{t("Invite member", "Inviter un membre")}</p>
          <div className="row">
            <input className="input" placeholder="name@company.com, other@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="input" style={{ width: 130 }} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <button className="btn" disabled={busy} onClick={invite}>{t("Invite", "Inviter")}</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}
      <table>
        <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Email", "Courriel")}</th><th>{t("Role", "Rôle")}</th>{isOwner && <th></th>}</tr></thead>
        <tbody>
          {data.members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.full_name || "—"}</td><td>{m.email || "—"}</td>
              <td>{canManage ? (
                <select className="input" style={{ width: 120, padding: 6 }} value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              ) : <span className="pill pmag">{roleLabel(m.role)}</span>}</td>
              {isOwner && <td><button className="btn ghost" onClick={() => remove(m.user_id)}>{t("Remove", "Retirer")}</button></td>}
            </tr>
          ))}
          {data.invites.map((i) => (
            <tr key={i.email}><td style={{ color: "var(--t3)" }}>—</td><td>{i.email}</td><td><span className="pill pgold">{t("invited", "invité")} · {roleLabel(i.role)}</span></td>{isOwner && <td></td>}</tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
