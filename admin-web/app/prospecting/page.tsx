"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";
import { cf } from "@/lib/cf";
import { Sparkles, Check, Ban, Play, Flag, Plus, Loader2 } from "lucide-react";

const C = { paper: "#F1EEE7", panel: "#FFFFFF", ink: "#14131A", ink2: "#6B6863", faint: "#9a97a4", line: "#ECE9E2", accent: "#2F3AA3", accentSoft: "#EEEBFA", green: "#178A4E", greenSoft: "#E7F6EE", red: "#C0392B", redSoft: "#FBE9E7", amber: "#A86A12", amberSoft: "#FDF3E0", blue: "#2b62c9", blueSoft: "#E7EEFB" };
const inp: any = { border: `1.5px solid #E3E0D8`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, background: "#FBFAF7", color: C.ink, outline: "none", fontFamily: "inherit", width: "100%" };
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  new: { label: "New", bg: "#F1EFEA", fg: "#7a7683" },
  active: { label: "In sequence", bg: C.blueSoft, fg: C.blue },
  clicked: { label: "Clicked", bg: C.amberSoft, fg: C.amber },
  engaged: { label: "Engaged", bg: C.greenSoft, fg: C.green },
  replied: { label: "Replied", bg: C.green, fg: "#fff" },
  bounced: { label: "Bounced", bg: C.redSoft, fg: C.red },
  stopped: { label: "Stopped", bg: "#F1EFEA", fg: "#9a97a4" },
  done: { label: "Done", bg: "#EEEBFA", fg: C.accent },
};
const DOTS = ["#EA4335", "#FBBC05", "#34A853", "#4285F4"];

export default function ProspectingPage() {
  return <Suspense fallback={null}><QuorlyAuthGate><Inner /></QuorlyAuthGate></Suspense>;
}

function Inner() {
  const router = useRouter();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", category: "", region: "", contact: "", fit: "" });

  const reload = useCallback(async () => {
    const [s, l] = await Promise.all([cf.outreachStats().catch(() => ({})), cf.outreachList(filter === "all" ? null : filter).catch(() => [])]);
    setStats(s || {}); setRows(l || []);
  }, [filter]);
  useEffect(() => { cf.outreachAdmin().then((a) => { setAdmin(a); if (a) reload(); }).catch(() => setAdmin(false)); }, [reload]);

  const act = async (id: string, fn: () => Promise<any>) => { setBusy(id); try { await fn(); await reload(); } catch (e: any) { alert(e?.message || "Failed"); } finally { setBusy(""); } };
  const addProspect = async () => {
    if (!form.name.trim()) return;
    setBusy("add");
    try { await cf.outreachAdd(form); setForm({ name: "", email: "", category: "", region: "", contact: "", fit: "" }); setAdding(false); await reload(); }
    catch (e: any) { alert(e?.message || "Failed"); } finally { setBusy(""); }
  };

  if (admin === null) return <Center><Loader2 className="spin" size={18} /> Loading…</Center>;
  if (!admin) return <Center>You don't have access to the prospecting console.</Center>;

  const tiles = [
    { n: stats.total ?? 0, l: "Prospects", c: C.accent },
    { n: stats.contacted ?? 0, l: "Contacted", c: C.ink },
    { n: stats.opened ?? 0, l: "Opened", c: C.ink },
    { n: stats.clicked ?? 0, l: "Clicked", c: C.amber },
    { n: stats.engaged ?? 0, l: "Engaged", c: C.green },
    { n: stats.replied ?? 0, l: "Replied", c: C.green },
  ];
  const newCount = stats.new ?? 0;
  const TABS = [["all", "All"], ["new", "To review"], ["active", "In sequence"], ["engaged", "Engaged"], ["bounced", "Bounced"]];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif", color: C.ink }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={() => router.push("/forms")} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>Q</div>
            <div><div style={{ fontWeight: 800, fontSize: 17 }}>Quorly</div>
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>{DOTS.map((c) => <span key={c} style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />)}</div></div>
          </div>
        </div>
        <div onClick={() => router.push("/forms")} style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>← Forms</div>
      </div>

      <div style={{ padding: "24px 26px 48px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -.5, display: "flex", alignItems: "center", gap: 9 }}><Sparkles size={22} style={{ color: C.accent }} /> <span><span style={{ color: C.accent }}>AI</span> Prospecting</span></div>
        <div style={{ color: C.ink2, fontSize: 14, margin: "5px 0 20px" }}>Organizations that would run their board on Quorly — boards, associations, non-profits, condo councils, sport groups, school PACs & church councils — found daily, contacted and followed up automatically, stopping on reply.</div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {tiles.map((t) => (
            <div key={t.l} style={{ flex: "1 1 140px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 13, padding: "13px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -.5, color: t.c }}>{t.n}</div>
              <div style={{ fontSize: 11.5, color: C.ink2, fontWeight: 600, marginTop: 2 }}>{t.l}</div>
            </div>
          ))}
        </div>

        {newCount > 0 && filter !== "new" && (
          <div style={{ background: C.accentSoft, border: `1px solid #D9D3F5`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, color: "#2b2570", fontWeight: 600 }}>✨ {newCount} new prospect{newCount === 1 ? "" : "s"} found — review &amp; approve before outreach.</div>
            <div onClick={() => setFilter("new")} style={{ background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 800, padding: "8px 15px", borderRadius: 9, cursor: "pointer" }}>Review {newCount} →</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {TABS.map(([k, lbl]) => (
            <div key={k} onClick={() => setFilter(k)} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 8, cursor: "pointer", background: filter === k ? C.accentSoft : "transparent", color: filter === k ? C.accent : C.ink2 }}>{lbl}</div>
          ))}
          <div style={{ marginLeft: "auto" }}>
            <div onClick={() => setAdding((a) => !a)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}><Plus size={14} /> Add prospect</div>
          </div>
        </div>

        {adding && (
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <input placeholder="Organization name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
            <input placeholder="Contact email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} />
            <input placeholder="Category (e.g. school-pac)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inp} />
            <input placeholder="Region / city" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inp} />
            <input placeholder="Contact name" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} style={inp} />
            <input placeholder="Fit (one line)" value={form.fit} onChange={(e) => setForm({ ...form, fit: e.target.value })} style={inp} />
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <div onClick={() => setAdding(false)} style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.line}`, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>Cancel</div>
              <div onClick={addProspect} style={{ padding: "9px 18px", borderRadius: 9, background: C.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: form.name.trim() ? 1 : .6 }}>{busy === "add" ? "Adding…" : "Add to pipeline"}</div>
            </div>
          </div>
        )}

        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["Organization", "Type", "Location", "Fit", "Touches", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 10.5, letterSpacing: .5, color: C.faint, fontWeight: 800, textTransform: "uppercase", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>{h}</th>))}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS[r.status] || STATUS.new;
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB` }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.org_name}</div>
                        <div style={{ fontSize: 11.5, color: C.faint }}>{r.email || "no email"}{r.contact_name ? " · " + r.contact_name : ""}</div>
                      </td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12.5, color: C.ink2 }}>{r.category || "—"}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12.5, color: C.ink2 }}>{r.region || "—"}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12, color: C.ink2, fontStyle: "italic", maxWidth: 220 }}>{r.fit || "—"}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, fontSize: 12.5, color: C.ink2, textAlign: "center" }}>{r.touch_count ?? 0}</td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB` }}><span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 20, background: st.bg, color: st.fg }}>{st.label}</span></td>
                      <td style={{ padding: "12px 16px", borderTop: `1px solid #F3F1EB`, whiteSpace: "nowrap" }}>
                        {busy === r.id ? <Loader2 size={14} className="spin" /> : (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {r.status === "new" && r.email && <IconBtn title="Approve → send" color={C.green} onClick={() => act(r.id, () => cf.outreachApprove(r.id))}><Check size={14} /></IconBtn>}
                            {r.status === "active" && <IconBtn title="Stop" color={C.red} onClick={() => act(r.id, () => cf.outreachStop(r.id))}><Ban size={14} /></IconBtn>}
                            {r.status === "stopped" && <IconBtn title="Resume" color={C.accent} onClick={() => act(r.id, () => cf.outreachResume(r.id))}><Play size={14} /></IconBtn>}
                            {(r.status === "engaged" || r.status === "clicked" || r.status === "replied") && <IconBtn title="Mark met" color={C.accent} onClick={() => act(r.id, () => cf.outreachStage(r.id, "met"))}><Flag size={14} /></IconBtn>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.faint, fontSize: 13 }}>No prospects{filter !== "all" ? " in this view" : " yet — the daily finder will add some, or add one above"}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function IconBtn({ children, title, color, onClick }: any) {
  return <span title={title} onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${color}`, color, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{children}</span>;
}
function Center({ children }: any) {
  return <div style={{ background: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: C.ink2, fontSize: 14, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>{children}</div>;
}
