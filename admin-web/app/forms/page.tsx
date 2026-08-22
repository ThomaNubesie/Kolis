"use client";
// Quorly — forms app wired to the live cf_* backend. Three-pane: sidebar / entry
// feed / members rail. Colour-coded, numbered structured entries + comments,
// voting, translate + AI writing. Bilingual EN/FR. RLS-secured (Tier A).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cf, type CfFormBrief, type CfFormFull, type CfEntry } from "@/lib/cf";

const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const L = (en: string, fr: string) => ({ en, fr });
const initials = (n?: string | null) => { if (!n) return "?"; const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase(); };
const fmt = (iso: string, lang: string) => { try { return new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };

export default function FormsPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [list, setList] = useState<CfFormBrief[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<CfFormFull | null>(null);
  const [entries, setEntries] = useState<CfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const memberOf = useMemo(() => { const m: Record<string, any> = {}; (form?.members ?? []).forEach((x) => { if (x.id) m[x.id] = x; }); return m; }, [form]);

  useEffect(() => { cf.myForms().then((f) => { setList(f); setSel((s) => s ?? f[0]?.id ?? null); }).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, []);
  const loadForm = useCallback(async (id: string) => {
    try { const [f, e] = await Promise.all([cf.form(id), cf.entries(id)]); setForm(f); setEntries(e); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { if (!sel) return; loadForm(sel); const ch = cf.subscribe(sel, () => cf.entries(sel).then(setEntries).catch(() => {})); return () => { ch.unsubscribe(); }; }, [sel, loadForm]);

  if (loading) return <Shell><div style={{ padding: 40, color: C.faint }}>Loading…</div></Shell>;
  if (err) return <Shell><div style={{ padding: 40, color: "#B4531F" }}>{err}</div></Shell>;

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "230px 1fr 250px", minHeight: 660, background: C.paper, borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>
        <aside style={{ background: "#F4F1EB", borderRight: `1px solid ${C.line}`, padding: "18px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 6px 16px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>Q</div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Quorly</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, padding: "10px 6px 4px" }}>{tr(L("Your forms", "Vos formulaires"))}</div>
          {list.length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: "6px" }}>{tr(L("No forms yet", "Aucun formulaire"))}</div>}
          {list.map((f) => (
            <div key={f.id} onClick={() => setSel(f.id)} style={sItem(f.id === sel)}><span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />{f.name}</div>
          ))}
          <div style={{ marginTop: "auto", border: `1px dashed ${C.line}`, borderRadius: 9, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }} onClick={() => router.push("/forms/new")}>{tr(L("+ New form", "+ Nouveau formulaire"))}</div>
        </aside>

        <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: `1px solid ${C.line}` }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -.3 }}>{form?.name ?? "—"}</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{(form?.members.filter((m) => m.status === "active").length ?? 0)} {tr(L("members", "membres"))}{form?.is_admin ? " · " + tr(L("You're admin", "Vous êtes admin")) : ""}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
              {(["en", "fr"] as const).map((l) => <span key={l} onClick={() => setLang(l)} style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>)}
            </div>
          </div>
          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
            {form && <NewEntry form={form} tr={tr} onDone={() => sel && loadForm(sel)} />}
            {entries.map((e) => <EntryCard key={e.id} e={e} form={form!} lang={lang} tr={tr} memberOf={memberOf} reload={() => sel && cf.entries(sel).then(setEntries)} />)}
            {form && entries.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("No entries yet.", "Aucune entrée."))}</div>}
          </div>
        </section>

        <aside style={{ background: "#F7F4EE", borderLeft: `1px solid ${C.line}`, padding: "18px 16px" }}>
          <div style={railLbl}>{tr(L("Members", "Membres"))} · {form?.members.length ?? 0}</div>
          {(form?.members ?? []).map((m) => (
            <div key={(m.id ?? m.contact) as string} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 4px", opacity: m.status === "invited" ? 0.55 : 1 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: m.color ?? "#CCC" }} />
              <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{m.name ?? m.contact}</div><div style={{ fontSize: 10, color: C.faint }}>{m.status === "invited" ? tr(L("invited", "invité")) : m.contact}</div></div>
              {m.role === "admin" && <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, color: C.accent, background: C.accentSoft, padding: "2px 7px", borderRadius: 9 }}>ADMIN</span>}
            </div>
          ))}
          {form?.is_admin && <Invite form={form.id} tr={tr} onDone={() => sel && loadForm(sel)} />}
        </aside>
      </div>
    </div>
  );
}

function Shell({ children }: { children: any }) {
  return <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24 }}><div style={{ maxWidth: 1160, margin: "0 auto", background: C.paper, borderRadius: 14, minHeight: 400 }}>{children}</div></div>;
}

function Invite({ form, tr, onDone }: any) {
  const [v, setV] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => { if (!v.trim()) return; setBusy(true); try { await cf.invite(form, v.trim()); setV(""); onDone(); } catch (e: any) { alert(e.message); } setBusy(false); };
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <div style={{ ...railLbl, margin: "0 2px 2px" }}>{tr(L("Add member", "Ajouter un membre"))}</div>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={tr(L("Email or phone", "Courriel ou téléphone"))} style={{ ...inp, marginTop: 8 }} />
      <div onClick={send} style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 800, marginTop: 8, cursor: "pointer", opacity: busy ? .6 : 1 }}>{tr(L("Send invite", "Envoyer l'invitation"))}</div>
    </div>
  );
}

function NewEntry({ form, tr, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await cf.addEntry(form.id, vals); setVals({}); setOpen(false); onDone(); } catch (e: any) { alert(e.message); } setBusy(false); };
  if (!open) return <div onClick={() => setOpen(true)} style={{ border: `1px dashed ${C.line}`, borderRadius: 11, padding: 12, textAlign: "center", fontWeight: 700, fontSize: 13, color: C.accent, cursor: "pointer" }}>{tr(L("+ New entry", "+ Nouvelle entrée"))}</div>;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {(form.fields ?? []).map((f: any) => (
        <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{f.label}</span>
          {f.type === "longtext" ? <textarea value={vals[f.label] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.label]: e.target.value }))} style={{ ...inp, minHeight: 60 }} />
            : f.type === "select" ? <select value={vals[f.label] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.label]: e.target.value }))} style={inp}><option value="">—</option>{(f.options ?? []).map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
            : <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={vals[f.label] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.label]: e.target.value }))} style={inp} />}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <div onClick={submit} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: busy ? .6 : 1 }}>{tr(L("Post entry", "Publier"))}</div>
        <div onClick={() => setOpen(false)} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
      </div>
    </div>
  );
}

function EntryCard({ e, form, lang, tr, memberOf, reload }: any) {
  const a = memberOf[e.author];
  const [cmt, setCmt] = useState(""); const [trx, setTrx] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const vote = async () => { try { await cf.vote(e.id, "approve"); reload(); } catch (er: any) { alert(er.message); } };
  const addC = async () => { if (!cmt.trim()) return; try { await cf.addComment(e.id, cmt.trim()); setCmt(""); reload(); } catch (er: any) { alert(er.message); } };
  const translate = async () => { setBusy(true); try { const txt = Object.values(e.values || {}).join(" · "); const r = await cf.ai("translate", txt, { target_lang: lang === "fr" ? "French" : "English" }); setTrx(r.text ?? ""); } catch (er: any) { alert(er.message); } setBusy(false); };
  const polish = async () => { if (!cmt.trim()) return; setBusy(true); try { const r = await cf.ai("polish", cmt, { tone: "professional" }); if (r.text) setCmt(r.text); } catch (er: any) { alert(er.message); } setBusy(false); };
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ height: 3, background: a?.color ?? "#CCC" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px 6px" }}>
        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, fontWeight: 700, color: C.faint, background: C.line2, padding: "2px 7px", borderRadius: 5 }}>No. {String(e.seq).padStart(3, "0")}</span>
        <span style={chip(a?.color)}>{initials(a?.name)}</span><span style={{ fontSize: 13, fontWeight: 700 }}>{a?.name ?? "—"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{fmt(e.created_at, lang)}</span>
      </div>
      <div style={{ padding: "4px 16px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px" }}>
        {(form.fields ?? []).map((f: any) => (
          <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: f.type === "longtext" ? "1 / -1" : "auto" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{f.label}</span>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: f.type === "longtext" ? 500 : 600 }}>{String(e.values?.[f.label] ?? "—")}</span>
          </div>
        ))}
      </div>
      {form.features?.translation && (
        <div style={{ padding: "0 16px 12px" }}>
          <span onClick={translate} style={{ fontSize: 11, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{busy ? "…" : tr(L("Translate", "Traduire"))} ▾</span>
          {trx && <div style={{ borderLeft: `3px solid ${C.accent}`, background: C.accentSoft, borderRadius: "0 8px 8px 0", padding: "9px 11px", fontSize: 12.5, marginTop: 8 }}>{trx}</div>}
        </div>
      )}
      {form.features?.voting && e.status && (
        <div style={{ borderTop: `1px solid ${C.line2}`, background: "#FCFBF8", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          {e.status === "approved"
            ? <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#E7F3EC", color: "#1F7A4D" }}>{tr(L("Approved", "Approuvé"))} · {e.approvals}/{form.approval_count}</span>
            : <><span onClick={vote} style={{ background: C.green, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✓ {tr(L("Approve", "Approuver"))}{e.my_vote === "approve" ? " ✓" : ""}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.ink2, fontWeight: 700 }}>{e.approvals} / {form.approval_count}</span></>}
        </div>
      )}
      {form.features?.comments && (
        <div style={{ borderTop: `1px solid ${C.line2}`, background: "#FCFBF8", padding: "11px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {e.comments.map((c: any) => { const ca = memberOf[c.author]; return (
            <div key={c.id} style={{ display: "flex", gap: 9 }}><span style={chip(ca?.color)}>{initials(ca?.name)}</span>
              <div><span style={{ fontSize: 11.5, fontWeight: 800, color: ca?.color }}>{ca?.name ?? "—"}</span><span style={{ fontSize: 9.5, color: C.faint, marginLeft: 7 }}>{fmt(c.created_at, lang)}</span><div style={{ fontSize: 12, color: C.ink2, marginTop: 2 }}>{c.body}</div></div>
            </div>); })}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input value={cmt} onChange={(ev) => setCmt(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && addC()} placeholder={tr(L("Write a comment…", "Écrire un commentaire…"))} style={{ ...inp, flex: 1 }} />
            {form.features?.ai && <span onClick={polish} title="AI polish" style={{ fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer" }}>✦</span>}
            <span onClick={addC} style={{ color: C.accent, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{tr(L("Send", "Envoyer"))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const sItem = (on: boolean): any => ({ padding: "9px 10px", borderRadius: 8, fontSize: 13, color: on ? C.ink : C.ink2, fontWeight: on ? 700 : 400, display: "flex", alignItems: "center", gap: 8, background: on ? "#fff" : "transparent", cursor: "pointer" });
const railLbl: any = { fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, margin: "6px 2px 8px" };
const chip = (c?: string): any => ({ width: 20, height: 20, borderRadius: 6, background: c ?? "#999", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800, flex: "0 0 20px" });
const inp: any = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, background: "#fff", color: C.ink, outline: "none", width: "100%" };
