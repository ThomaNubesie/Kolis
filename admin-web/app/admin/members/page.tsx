"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

const FILTERS: [string, string, string][] = [["all", "All", "Tous"], ["couriers", "Couriers", "Chauffeurs"], ["senders", "Senders", "Expéditeurs"], ["unverified", "Unverified", "Non vérifiés"], ["founding", "Founding", "Fondateurs"], ["pending", "Pending", "En attente"], ["requests", "Contact requests", "Demandes de contact"]];
const day = (s?: string) => (s ? s.slice(0, 10) : "—");

export default function Members() {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);

  const load = useCallback((f = filter, s = search) => {
    if (f === "pending") { api.pendingMembers().then(setPending).catch(() => setPending([])); return; }
    if (f === "requests") { api.contactRequests().then(setReqs).catch(() => setReqs([])); return; }
    api.members(f, s.trim() || null).then(setList).catch(() => {});
  }, [filter, search]);
  useEffect(() => { load("all", ""); }, []); // eslint-disable-line

  const toggle = async (m: any) => { if (!confirm(t(`${m.suspended ? "Reinstate" : "Suspend"} ${m.full_name || m.email}?`, `${m.suspended ? "Réintégrer" : "Suspendre"} ${m.full_name || m.email} ?`))) return; try { await api.suspend(m.id, !m.suspended); load(); } catch (e: any) { alert(e?.message); } };
  const nudgeAll = async () => { if (!confirm(t("Send a verification reminder to all unverified members with the app installed?", "Envoyer un rappel de vérification à tous les membres non vérifiés ayant installé l’application ?"))) return; try { const r = await api.nudgeUnverified(); alert(r.nudged ? t(`Reminder sent to ${r.nudged} member(s).`, `Rappel envoyé à ${r.nudged} membre(s).`) : t("No unverified members have notifications enabled.", "Aucun membre non vérifié n’a activé les notifications.")); } catch (e: any) { alert(e?.message); } };
  const nudgeOne = async (m: any) => { try { const r = await api.nudgeUnverified(m.id); alert(r.nudged ? t("Reminder sent.", "Rappel envoyé.") : t("This member doesn't have notifications enabled.", "Ce membre n’a pas activé les notifications.")); } catch (e: any) { alert(e?.message); } };
  const resendSignup = async (m: any) => { try { const r = await api.resendSignup(m.id); alert(r.sent ? t(`Signup email sent to ${r.email}.`, `Courriel d’inscription envoyé à ${r.email}.`) : t("Couldn't send the email: ", "Impossible d’envoyer le courriel : ") + ((r as any)?.error || t("unknown", "inconnu"))); } catch (e: any) { alert(e?.message); } };
  const review = async (id: string, approve: boolean) => { try { await api.reviewContact(id, approve); load(); } catch (e: any) { alert(e?.message); } };
  const chg = (cur: string | null, req: string | null) => req && req !== cur ? <><span style={{ color: "var(--t3)", textDecoration: cur ? "line-through" : "none" }}>{cur || "—"}</span> → <b>{req}</b></> : (cur || "—");

  return (
    <>
      <h1>{t("Members", "Membres")}</h1>
      <div className="toolbar">
        {filter !== "pending" && filter !== "requests" && <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder={t("🔍 name, email…", "🔍 nom, courriel…")} />}
        {FILTERS.map(([f, en, fr]) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); load(f, search); }}>{lang === "fr" ? fr : en}</button>)}
        {filter !== "pending" && filter !== "requests" && <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={nudgeAll}>🔔 {t("Nudge unverified", "Relancer les non vérifiés")}</button>}
      </div>

      {filter === "requests" ? (
        <>
          <div className="sub" style={{ marginBottom: 8 }}>{t("Members requesting to add or change their email / phone. Approve to apply it to their profile.", "Membres demandant d’ajouter ou de modifier leur courriel / téléphone. Approuvez pour l’appliquer à leur profil.")}</div>
          <table>
            <thead><tr><th>{t("Member", "Membre")}</th><th>{t("Email", "Courriel")}</th><th>{t("Phone", "Téléphone")}</th><th>{t("Requested", "Demandé le")}</th><th></th></tr></thead>
            <tbody>
              {reqs.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name || "—"}</b></td>
                  <td>{chg(m.current_email, m.requested_email)}</td>
                  <td>{chg(m.current_phone, m.requested_phone)}</td>
                  <td>{day(m.created_at)}</td>
                  <td><div className="row" style={{ gap: 6 }}>
                    <button className="btn" onClick={() => review(m.id, true)}>{t("Approve", "Approuver")}</button>
                    <button className="btn ghost" onClick={() => review(m.id, false)}>{t("Reject", "Refuser")}</button>
                  </div></td>
                </tr>
              ))}
              {reqs.length === 0 && <tr><td colSpan={5} style={{ color: "var(--t3)" }}>{t("No pending contact requests.", "Aucune demande de contact en attente.")}</td></tr>}
            </tbody>
          </table>
        </>
      ) : filter === "pending" ? (
        <>
          <div className="sub" style={{ marginBottom: 8 }}>{t("Accounts that started a signup but haven't finished onboarding — no member profile yet. (LoadQ drivers excluded.)", "Comptes qui ont commencé une inscription sans terminer l’intégration — pas encore de profil de membre. (Chauffeurs LoadQ exclus.)")}</div>
          <table>
            <thead><tr><th>{t("Email", "Courriel")}</th><th>{t("Phone", "Téléphone")}</th><th>{t("Signed up", "Inscrit le")}</th><th>{t("Last seen", "Vu la dernière fois")}</th><th>{t("Confirmed", "Confirmé")}</th><th></th></tr></thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.id}>
                  <td>{m.email || "—"}</td>
                  <td>{m.phone ? "+" + m.phone : "—"}</td>
                  <td>{day(m.created_at)}</td>
                  <td>{day(m.last_sign_in_at)}</td>
                  <td>{m.confirmed ? <span className="pill pg">{t("yes", "oui")}</span> : <span className="pill pgrey">{t("no", "non")}</span>}</td>
                  <td>{m.email ? <button className="btn ghost" onClick={() => resendSignup(m)}>{t("Resend email", "Renvoyer le courriel")}</button> : null}</td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No incomplete signups 🎉", "Aucune inscription incomplète 🎉")}</td></tr>}
            </tbody>
          </table>
        </>
      ) : (
        <table>
          <thead><tr><th>{t("Name", "Nom")}</th><th>{t("Email", "Courriel")}</th><th>{t("Role", "Rôle")}</th><th>{t("Status", "Statut")}</th><th>{t("Founding", "Fondateur")}</th><th></th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} style={{ opacity: m.suspended ? 0.55 : 1 }}>
                <td><b>{m.full_name || "—"}</b></td>
                <td>{m.email || "—"}</td>
                <td style={{ textTransform: "capitalize" }}>{m.role || "—"}</td>
                <td>{m.identity_verified ? <span className="pill pg">{t("verified", "vérifié")}</span> : <span className="pill pgrey">{t("unverified", "non vérifié")}</span>}{m.suspended ? <span className="pill pred" style={{ marginLeft: 5 }}>{t("suspended", "suspendu")}</span> : null}</td>
                <td>{m.is_founding && m.founding_number ? `#${m.founding_number}` : "—"}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    {!m.identity_verified && <button className="btn ghost" onClick={() => nudgeOne(m)}>{t("Remind", "Rappeler")}</button>}
                    <button className="btn ghost" onClick={() => toggle(m)}>{m.suspended ? t("Reinstate", "Réintégrer") : t("Suspend", "Suspendre")}</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>{t("No members.", "Aucun membre.")}</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
