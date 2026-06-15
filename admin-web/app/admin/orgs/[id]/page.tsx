"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/supabase";

const dollars = (c: number) => ((c || 0) / 100).toString();
const KYB: Record<string, string> = { verified: "pg", pending: "pgold", rejected: "pred" };

export default function OrgDetail() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // editable limits
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
    if (o) { setCredit(dollars(o.credit_limit_cents)); setDiscount(String(Math.round((o.discount_rate || 0) * 100))); setNet(String(o.net_terms_days)); }
    setMembers(await api.orgMembers(id).catch(() => []));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const flash = (m: string) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 2500); };
  const fail = (e: any) => setErr(e?.message || "Failed.");

  const saveLimits = async () => {
    try {
      await api.setOrgLimits(id, { credit_limit_cents: Math.round((Number(credit) || 0) * 100), discount: (Number(discount) || 0) / 100, net_terms: Number(net) || 30 });
      flash("Saved."); load();
    } catch (e) { fail(e); }
  };
  const setKyb = async (s: string) => { try { await api.setOrgKyb(id, s); flash("KYB " + s); load(); } catch (e) { fail(e); } };
  const setStatus = async (s: string) => { try { await api.setOrgStatus(id, s); flash(s); load(); } catch (e) { fail(e); } };
  const inviteByEmail = async () => {
    if (!inviteEmail.trim()) return;
    try { await api.orgInviteEmail(id, inviteEmail.trim(), inviteRole); setInviteEmail(""); flash("Invite emailed — they'll appear here once they sign in with that email."); } catch (e) { fail(e); }
  };
  const addByPhone = async () => {
    if (!invitePhone.trim()) return;
    try { const r = await api.orgAddByPhone(id, invitePhone.trim(), inviteRole); setInvitePhone(""); flash("Added " + (r?.full_name || "member")); load(); }
    catch (e: any) { setErr(e?.message?.includes("no_account_for_phone") ? "No Kolis account with that phone — they must sign in once first." : (e?.message || "Failed.")); }
  };
  const remove = async (uid: string) => { if (!confirm("Remove this member?")) return; try { await api.orgRemoveMember(id, uid); load(); } catch (e) { fail(e); } };

  if (!org) return <div className="sub">Loading…</div>;

  return (
    <>
      <div className="sub" style={{ cursor: "pointer" }} onClick={() => router.push("/admin/orgs")}>← Organizations</div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>{org.name}</h1><div className="sub">{org.type} · {org.billing_email || "no billing email"}</div></div>
        <div className="row">
          <span className={"pill " + (KYB[org.kyb_status] || "pgrey")}>KYB {org.kyb_status}</span>
          <span className={"pill " + (org.status === "active" ? "pg" : "pred")}>{org.status}</span>
        </div>
      </div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", marginBottom: 10 }}>{msg}</div> : null}
      {err ? <div className="warn">{err}</div> : null}

      <div className="cols">
        {/* Limits & terms */}
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <div className="mono">Credit & terms</div>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}><div className="mono">Credit limit $</div><input className="input" value={credit} onChange={(e) => setCredit(e.target.value)} inputMode="numeric" /></div>
            <div style={{ flex: 1 }}><div className="mono">Discount %</div><input className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" /></div>
            <div style={{ flex: 1 }}><div className="mono">Net days</div><input className="input" value={net} onChange={(e) => setNet(e.target.value)} inputMode="numeric" /></div>
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={saveLimits}>Save</button>
        </div>

        {/* KYB + status */}
        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <div className="mono">Verification (KYB)</div>
          <div className="row" style={{ marginBottom: 12 }}>
            {["verified", "pending", "rejected"].map((s) => (
              <button key={s} className={"chip" + (org.kyb_status === s ? " on" : "")} onClick={() => setKyb(s)}>{s}</button>
            ))}
          </div>
          <div className="mono">Account status</div>
          <div className="row">
            <button className={"chip" + (org.status === "active" ? " on" : "")} onClick={() => setStatus("active")}>active</button>
            <button className={"chip" + (org.status === "suspended" ? " on" : "")} onClick={() => setStatus("suspended")}>suspended</button>
          </div>
        </div>
      </div>

      {/* Members + invite */}
      <div className="card">
        <div className="mono">Add owner / member</div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div className="mono">Invite by email (they sign in with this email)</div>
            <input className="input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="owner@company.com" />
          </div>
          <select className="input" style={{ width: 130 }} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {["owner", "admin", "finance", "shipper", "dispatcher", "driver"].map((rr) => <option key={rr} value={rr}>{rr}</option>)}
          </select>
          <button className="btn" onClick={inviteByEmail}>Email invite</button>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div className="mono">…or add an existing Kolis user by phone</div>
            <input className="input" value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} placeholder="+1 613 555 0192" />
          </div>
          <button className="btn ghost" onClick={addByPhone}>Add by phone</button>
        </div>
      </div>

      <table>
        <thead><tr><th>Member</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.full_name || "—"}</td><td>{m.email || "—"}</td><td><span className="pill pmag">{m.role}</span></td>
              <td><button className="btn ghost" onClick={() => remove(m.user_id)}>Remove</button></td>
            </tr>
          ))}
          {members.length === 0 && <tr><td colSpan={4} style={{ color: "var(--t3)" }}>No members yet — invite the owner above.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
