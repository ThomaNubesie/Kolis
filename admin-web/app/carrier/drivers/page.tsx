"use client";
import { useEffect, useState } from "react";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const ROLES = ["driver", "dispatcher", "admin", "owner"];

export default function Drivers() {
  const { active } = useOrg();
  const { t } = useLang();
  const canManage = active.role === "owner" || active.role === "admin";
  const [rows, setRows] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => org.drivers(active.org_id).then(setRows).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active.org_id]);

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr("");
    try { await org.invite(active.org_id, email.trim(), "driver"); setEmail(""); load(); }
    catch (e: any) { setErr(e?.message || t("Invite failed.", "Échec de l’invitation.")); }
    setBusy(false);
  };

  return (
    <>
      <h1>{t("Drivers", "Chauffeurs")}</h1>
      <div className="sub">{active.name} · {t("each driver still passes individual identity verification; fee waived under the fleet.", "chaque chauffeur passe quand même la vérification d’identité individuelle; frais offerts sous la flotte.")}</div>
      {canManage && (
        <div className="card" style={{ maxWidth: 520 }}>
          <p className="mono">{t("Add driver (invite by email)", "Ajouter un chauffeur (invitation par courriel)")}</p>
          <div className="row">
            <input className="input" placeholder="driver@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" disabled={busy} onClick={invite}>{t("Invite", "Inviter")}</button>
          </div>
          {err ? <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{err}</div> : null}
        </div>
      )}
      <table>
        <thead><tr><th>{t("Driver", "Chauffeur")}</th><th>{t("Fleet role", "Rôle dans la flotte")}</th><th>{t("Identity", "Identité")}</th><th>{t("Courier status", "Statut de courrier")}</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.user_id}>
              <td>{d.full_name || "—"}</td>
              <td><span className="pill pgrey">{d.role}</span></td>
              <td>{d.identity_verified ? <span className="pill pg">{t("Verified", "Vérifié")}</span> : <span className="pill pgold">{t("Pending", "En attente")}</span>}</td>
              <td>{d.kolis_role === "courier" || d.kolis_role === "both" ? <span className="pill pg">{t("Can carry", "Peut transporter")}</span> : <span className="pill pgrey">{d.kolis_role || "—"}</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>{t("No drivers yet.", "Aucun chauffeur pour l’instant.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
