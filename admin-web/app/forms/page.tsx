"use client";
// Quorly — forms app wired to the live cf_* backend. Three-pane: sidebar / entry
// feed / members rail. Colour-coded, numbered structured entries + comments,
// voting, translate + AI writing. Bilingual EN/FR. RLS-secured (Tier A).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cf, type CfFormBrief, type CfFormFull, type CfEntry, type CfFile, type CfFileRequest } from "@/lib/cf";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";
import { buildFormPdf, pdfFilename } from "@/lib/pdf";

const C = { paper: "#FAF8F4", panel: "#FFFFFF", ink: "#1C1B19", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA", line2: "#F1ECE3", accent: "#2F3AA3", accentSoft: "#EEEFF9", green: "#1F9D6B" };
const L = (en: string, fr: string) => ({ en, fr });
const initials = (n?: string | null) => { if (!n) return "?"; const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase(); };
const fmt = (iso: string, lang: string) => { try { return new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
const fmtDate = (iso: string, lang: string) => { try { return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" }); } catch { return iso; } };
function useMobile(bp = 820) { const [m, setM] = useState(false); useEffect(() => { const f = () => setM(window.innerWidth < bp); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [bp]); return m; }

export default function FormsPage() {
  return <QuorlyAuthGate><FormsInner /></QuorlyAuthGate>;
}

function FormsInner() {
  const router = useRouter();
  const mobile = useMobile();
  const [lang, setLang] = useState<"en" | "fr">("en");
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [list, setList] = useState<CfFormBrief[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<CfFormFull | null>(null);
  const [entries, setEntries] = useState<CfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [tab, setTab] = useState<"entries" | "files">("entries");

  const memberOf = useMemo(() => { const m: Record<string, any> = {}; (form?.members ?? []).forEach((x) => { if (x.id) m[x.id] = x; }); return m; }, [form]);

  useEffect(() => { cf.myForms().then((f) => setList(f)).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, []);
  // Desktop (three-pane) opens the first form for convenience; mobile lands on Home (list) so
  // "back" from a form / new-form returns to the profile page, not into a form.
  useEffect(() => { if (!loading && !mobile && !sel && list.length) setSel(list[0].id); }, [loading, mobile, list, sel]);
  useEffect(() => { cf.canCreate().then(setCanCreate).catch(() => {}); }, []);
  useEffect(() => { cf.myProfile().then((p) => setProfileName(p?.name || "")).catch(() => {}); }, []);
  const loadForm = useCallback(async (id: string) => {
    try { const [f, e] = await Promise.all([cf.form(id), cf.entries(id)]); setForm(f); setEntries(e); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { if (!sel) return; setTab("entries"); loadForm(sel); const ch = cf.subscribe(sel, () => cf.entries(sel).then(setEntries).catch(() => {})); return () => { ch.unsubscribe(); }; }, [sel, loadForm]);

  if (loading) return <Shell><div style={{ padding: 40, color: C.faint }}>Loading…</div></Shell>;
  if (err) return <Shell><div style={{ padding: 40, color: "#B4531F" }}>{err}</div></Shell>;

  const showHome = !mobile || !sel;
  const showForm = !mobile || !!sel;
  const editName = async () => {
    const n = window.prompt(tr(L("Your name (shown in every form)", "Votre nom (affiché dans chaque formulaire)")), profileName);
    if (n && n.trim()) { try { await cf.setProfile(n.trim()); setProfileName(n.trim()); if (sel) loadForm(sel); } catch (e: any) { alert(e.message); } }
  };
  const langToggle = (
    <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
      {(["en", "fr"] as const).map((l) => <span key={l} onClick={() => setLang(l)} style={{ padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: lang === l ? C.accent : "transparent", color: lang === l ? "#fff" : C.ink2 }}>{l.toUpperCase()}</span>)}
    </div>
  );

  return (
    <div style={{ background: "#2A2824", minHeight: "100vh", padding: mobile ? 0 : 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: mobile ? "1fr" : "260px 1fr 250px", minHeight: mobile ? "100vh" : 660, background: C.paper, borderRadius: mobile ? 0 : 14, overflow: "hidden", boxShadow: mobile ? "none" : "0 30px 70px rgba(0,0,0,.45)" }}>

        {/* ===== HOME / PROFILE ===== */}
        {showHome && (
          <aside style={{ background: "#F4F1EB", borderRight: mobile ? "none" : `1px solid ${C.line}`, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10, minHeight: mobile ? "100vh" : "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>Q</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Quorly</div>
              <div style={{ marginLeft: "auto" }}>{langToggle}</div>
            </div>
            <div onClick={editName} style={{ display: "flex", alignItems: "center", gap: 11, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 11, cursor: "pointer" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>{initials(profileName) === "?" ? "🙂" : initials(profileName)}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profileName || tr(L("Set your name", "Définir votre nom"))}</div><div style={{ fontSize: 11, color: C.accent, fontWeight: 700, marginTop: 1 }}>{tr(L("Tap to edit profile", "Modifier le profil"))}</div></div>
            </div>
            {canCreate && <div style={{ background: C.accent, color: "#fff", borderRadius: 11, padding: 12, textAlign: "center", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }} onClick={() => router.push("/forms/new")}>{tr(L("+ New form", "+ Nouveau formulaire"))}</div>}
            <JoinCode tr={tr} router={router} />
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .9, textTransform: "uppercase", color: C.faint, padding: "6px 6px 2px" }}>{tr(L("Your forms", "Vos formulaires"))}</div>
            {list.length === 0 && <div style={{ fontSize: 12.5, color: C.faint, padding: "6px" }}>{tr(L("No forms yet.", "Aucun formulaire."))}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, overflow: "auto" }}>
              {list.map((f) => (
                <div key={f.id} onClick={() => setSel(f.id)} style={{ ...sItem(f.id === sel), flexDirection: "column", alignItems: "stretch", gap: 3, padding: "9px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, flex: "0 0 auto" }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.faint, paddingLeft: 15, lineHeight: 1.3 }}>
                    {f.is_admin ? tr(L("You're admin", "Vous êtes admin")) : `${tr(L("Admin", "Admin"))}: ${f.admin ?? "—"}`}
                    {f.joined_at ? ` · ${tr(L("joined", "rejoint"))} ${fmtDate(f.joined_at, lang)}` : ""}
                  </div>
                </div>
              ))}
            </div>
            <div onClick={async () => { await supabase.auth.signOut({ scope: "local" }); }} style={{ marginTop: "auto", textAlign: "center", fontSize: 12, fontWeight: 800, color: C.ink2, cursor: "pointer", padding: "10px 6px 4px", borderTop: `1px solid ${C.line}` }}>{tr(L("Sign out", "Se déconnecter"))}</div>
          </aside>
        )}

        {/* ===== FORM VIEW ===== */}
        {showForm && form && (
          <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: mobile ? "13px 14px" : "16px 22px", borderBottom: `1px solid ${C.line}` }}>
              {mobile && <span onClick={() => setSel(null)} style={{ fontSize: 24, fontWeight: 800, color: C.ink, cursor: "pointer", lineHeight: 1, marginRight: 2 }}>‹</span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: mobile ? 16 : 18, fontWeight: 800, letterSpacing: -.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.name}</div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{form.members.filter((m) => m.status === "active").length} {tr(L("members", "membres"))}{form.is_admin ? " · " + tr(L("You're admin", "Vous êtes admin")) : ""}</div>
                {form.description && <div style={{ fontSize: 12, color: C.ink2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: mobile ? 220 : 380 }}>{form.description}</div>}
              </div>
              <div style={{ marginLeft: "auto", flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                {form.is_admin && <FormEdit form={form} tr={tr} onSaved={() => sel && loadForm(sel)} onDeleted={() => { setSel(null); setForm(null); setEntries([]); cf.myForms().then(setList).catch(() => {}); }} />}
                {!mobile && langToggle}
              </div>
            </div>
            <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.line}`, padding: mobile ? "0 12px" : "0 22px" }}>
              {(["entries", "files"] as const).map((k) => (
                <div key={k} onClick={() => setTab(k)} style={{ padding: "10px 14px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", color: tab === k ? C.accent : C.ink2, borderBottom: `2px solid ${tab === k ? C.accent : "transparent"}`, marginBottom: -1 }}>
                  {k === "entries" ? tr(L("Entries", "Entrées")) : tr(L("Files", "Fichiers"))}
                </div>
              ))}
            </div>
            <div style={{ padding: mobile ? "14px 16px" : "18px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
              {tab === "entries" ? (
                <>
                  {form.is_admin && <PdfPanel form={form} entries={entries} memberOf={memberOf} tr={tr} />}
                  <NewEntry form={form} tr={tr} mobile={mobile} onDone={() => sel && loadForm(sel)} />
                  {entries.map((e) => <EntryCard key={e.id} e={e} form={form!} lang={lang} tr={tr} mobile={mobile} memberOf={memberOf} reload={() => sel && cf.entries(sel).then(setEntries)} />)}
                  {entries.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("No entries yet.", "Aucune entrée."))}</div>}
                </>
              ) : (
                <FilesPanel form={form} tr={tr} lang={lang} mobile={mobile} entries={entries} memberOf={memberOf} />
              )}
              {mobile && (
                <aside style={{ background: "#F7F4EE", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 14px", marginTop: 4 }}>
                  <MembersRail form={form} tr={tr} lang={lang} sel={sel} loadForm={loadForm} />
                </aside>
              )}
            </div>
          </section>
        )}

        {/* ===== MEMBERS RAIL (desktop) ===== */}
        {showForm && form && !mobile && (
          <aside style={{ background: "#F7F4EE", borderLeft: `1px solid ${C.line}`, padding: "18px 16px", overflow: "auto" }}>
            <MembersRail form={form} tr={tr} lang={lang} sel={sel} loadForm={loadForm} />
          </aside>
        )}

        {/* ===== DESKTOP EMPTY STATE ===== */}
        {!mobile && !form && (
          <section style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 14, padding: 40 }}>
            {tr(L("Select a form, or create a new one.", "Sélectionnez un formulaire ou créez-en un."))}
          </section>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: any }) {
  return <div style={{ background: "#2A2824", minHeight: "100vh", padding: 24 }}><div style={{ maxWidth: 1160, margin: "0 auto", background: C.paper, borderRadius: 14, minHeight: 400 }}>{children}</div></div>;
}

function PdfPanel({ form, entries, memberOf, tr }: any) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState("");
  const memberEmails: string[] = (form.members ?? []).filter((m: any) => m.contact && String(m.contact).includes("@")).map((m: any) => m.contact);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const download = async () => { setBusy(true); try { const doc = await buildFormPdf(form, entries, memberOf); doc.save(pdfFilename(form)); } catch (e: any) { alert(e.message); } setBusy(false); };
  const email = async () => {
    const chosen = memberEmails.filter((e) => !off[e]);
    const extras = extra.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const to = Array.from(new Set([...chosen, ...extras]));
    if (to.length === 0) { alert(tr(L("Add at least one recipient.", "Ajoutez au moins un destinataire."))); return; }
    setBusy(true);
    try {
      const doc = await buildFormPdf(form, entries, memberOf);
      const b64 = doc.output("datauristring").split(",")[1];
      const r = await cf.sendPdf(form.id, { filename: pdfFilename(form), pdf_base64: b64, recipients: to });
      if (r?.ok) { alert(tr(L(`Sent to ${r.sent} recipient(s).`, `Envoyé à ${r.sent} destinataire(s).`))); setOpen(false); }
      else alert(r?.error || "Failed");
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  if (!open) return <div onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", background: C.accentSoft, color: C.accent, borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>⤓ {tr(L("Export / Send PDF", "Exporter / Envoyer PDF"))}</div>;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{tr(L("Export / Send PDF", "Exporter / Envoyer PDF"))}</div>
        <span onClick={() => setOpen(false)} style={{ marginLeft: "auto", color: C.faint, cursor: "pointer", fontWeight: 800 }}>✕</span>
      </div>
      <div onClick={download} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, color: C.accent, cursor: "pointer" }}>⬇ {tr(L("Download PDF", "Télécharger le PDF"))}</div>
      <div style={{ ...railLbl, margin: "2px 0 0" }}>{tr(L("Email to members", "Envoyer aux membres"))}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {memberEmails.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>{tr(L("No member emails yet.", "Aucun courriel de membre."))}</div>}
        {memberEmails.map((e) => (
          <label key={e} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={!off[e]} onChange={() => setOff((s) => ({ ...s, [e]: !s[e] }))} />{e}
          </label>
        ))}
      </div>
      <div style={{ ...railLbl, margin: "2px 0 0" }}>{tr(L("Other recipients", "Autres destinataires"))}</div>
      <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={tr(L("email, email…", "courriel, courriel…"))} style={inp} />
      <div onClick={email} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "10px 12px", textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : tr(L("Send PDF", "Envoyer le PDF"))}</div>
    </div>
  );
}

function fileKind(name: string, mime?: string | null): { tag: string; bg: string } {
  const n = (name || "").toLowerCase(); const m = (mime || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return { tag: "PDF", bg: "#D64545" };
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return { tag: "IMG", bg: "#2F8F6B" };
  if (/\.(xlsx?|csv|numbers)$/.test(n) || m.includes("sheet")) return { tag: "XLS", bg: "#1F7A4D" };
  if (/\.(docx?|pages|rtf)$/.test(n) || m.includes("word")) return { tag: "DOC", bg: "#2F5BA3" };
  return { tag: (n.split(".").pop() || "FILE").slice(0, 3).toUpperCase(), bg: "#8A8378" };
}
const kb = (n: number | null) => n == null ? "" : n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";

// Quorly Dropbox — per-form shared files + admin file requests + the final PDF.
function FilesPanel({ form, tr, lang, entries, memberOf }: any) {
  const [files, setFiles] = useState<CfFile[]>([]);
  const [reqs, setReqs] = useState<CfFileRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const load = useCallback(async () => {
    try { const [fs, rs] = await Promise.all([cf.files(form.id), cf.fileRequests(form.id)]); setFiles(fs); setReqs(rs); } catch { /* ignore */ }
  }, [form.id]);
  useEffect(() => { load(); }, [load]);

  const upload = async (fl: FileList | null, requestId?: string | null) => {
    if (!fl || !fl.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(fl)) {
        if (f.size > 26214400) { alert(tr(L("File too large (max 25 MB): ", "Fichier trop volumineux (max 25 Mo) : ")) + f.name); continue; }
        await cf.fileUpload(form.id, f, { requestId: requestId ?? null });
      }
      await load();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const download = async (f: CfFile) => { try { window.open(await cf.fileUrl(f.path), "_blank"); } catch (e: any) { alert(e.message); } };
  const remove = async (f: CfFile) => { if (!confirm(tr(L("Remove this file?", "Supprimer ce fichier ?")))) return; try { await cf.fileDelete(f.id); await load(); } catch (e: any) { alert(e.message); } };
  const addReq = async () => { const l = window.prompt(tr(L("Request a file — what do you need? (e.g. Signed NDA)", "Demander un fichier — de quoi avez-vous besoin ? (ex. NDA signé)")) || ""); if (l && l.trim()) { try { await cf.fileRequestAdd(form.id, l.trim()); await load(); } catch (e: any) { alert(e.message); } } };
  const delReq = async (id: string) => { if (!confirm(tr(L("Delete this request?", "Supprimer cette demande ?")))) return; try { await cf.fileRequestDelete(id); await load(); } catch (e: any) { alert(e.message); } };
  const saveFinal = async () => { setBusy(true); try { const doc = await buildFormPdf(form, entries, memberOf); const blob = doc.output("blob"); await cf.fileSavePdf(form.id, pdfFilename(form), blob); await load(); } catch (e: any) { alert(e.message); } setBusy(false); };

  const sec: any = { fontSize: 11.5, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.faint, margin: "6px 2px 2px", display: "flex", alignItems: "center", gap: 8 };
  const btn: any = { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 700, color: C.ink, cursor: "pointer" };
  const addLink: any = { marginLeft: "auto", color: C.accent, fontWeight: 800, fontSize: 11.5, cursor: "pointer", textTransform: "none", letterSpacing: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        style={{ border: `1.6px dashed ${drag ? C.accent : "#d9d2c6"}`, background: drag ? C.accentSoft : "#FCFBF8", borderRadius: 13, padding: 22, textAlign: "center", cursor: "pointer" }}
      >
        <div style={{ fontSize: 22 }}>⬆︎</div>
        <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>{busy ? tr(L("Uploading…", "Téléversement…")) : tr(L("Drag files here, or click to browse", "Glissez des fichiers ici, ou cliquez"))}</div>
        <div style={{ color: C.ink2, fontSize: 12, marginTop: 3 }}>{tr(L("Up to 25 MB each · visible to everyone on this form", "Jusqu'à 25 Mo chacun · visible par tous"))}</div>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.currentTarget.value = ""; }} />
      </div>

      {(reqs.length > 0 || form.is_admin) && (
        <>
          <div style={sec}>{tr(L("Requested from members", "Demandé aux membres"))}{form.is_admin && <span style={addLink} onClick={addReq}>+ {tr(L("Request a file", "Demander un fichier"))}</span>}</div>
          {reqs.length === 0 && <div style={{ color: C.faint, fontSize: 12.5 }}>{tr(L("No file requests yet.", "Aucune demande."))}</div>}
          {reqs.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FFFDF8", border: "1px solid #F0E6D2", borderRadius: 12, padding: "10px 13px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.label}</div>
                <div style={{ color: C.ink2, fontSize: 11.5, marginTop: 2 }}>{r.fulfilled}/{r.total_members} {tr(L("in", "reçus"))}</div>
              </div>
              {r.mine
                ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#EAF6F0", color: "#1F7A4D" }}>{tr(L("You're in", "Envoyé"))}</span>
                : <label style={{ ...btn, background: C.accent, color: "#fff", borderColor: C.accent }}>{tr(L("Upload mine", "Envoyer le mien"))}<input type="file" hidden onChange={(e) => { upload(e.target.files, r.id); e.currentTarget.value = ""; }} /></label>}
              {form.is_admin && <span onClick={() => delReq(r.id)} style={{ color: C.faint, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>×</span>}
            </div>
          ))}
        </>
      )}

      <div style={sec}>{tr(L("Documents", "Documents"))}{form.is_admin && <span style={addLink} onClick={busy ? undefined : saveFinal}>⤓ {tr(L("Save form PDF here", "Enregistrer le PDF ici"))}</span>}</div>
      {files.length === 0 && <div style={{ color: C.faint, fontSize: 12.5 }}>{tr(L("No files yet.", "Aucun fichier."))}</div>}
      {files.map((f) => {
        const k = fileKind(f.name, f.mime);
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 13px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: k.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flex: "0 0 auto" }}>{k.tag}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}{f.is_final && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "#EAF6F0", color: "#1F7A4D", marginLeft: 8 }}>{tr(L("Final form", "Formulaire final"))}</span>}</div>
              <div style={{ color: C.ink2, fontSize: 11.5, marginTop: 2, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.uploader_color && <span style={{ width: 9, height: 9, borderRadius: "50%", background: f.uploader_color, display: "inline-block", flex: "0 0 auto" }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f.uploader_name}{f.request_label ? " · " + f.request_label : ""}{f.size != null ? " · " + kb(f.size) : ""} · {fmtDate(f.created_at, lang)}</span>
              </div>
            </div>
            <button onClick={() => download(f)} style={btn}>{tr(L("Download", "Télécharger"))}</button>
            {(f.mine || form.is_admin) && <span onClick={() => remove(f)} style={{ color: C.faint, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>×</span>}
          </div>
        );
      })}
    </div>
  );
}

function FormEdit({ form, tr, onSaved, onDeleted }: any) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(form.name || "");
  const [d, setD] = useState(form.description || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setN(form.name || ""); setD(form.description || ""); }, [form.id, form.name, form.description]);
  const save = async () => {
    if (!n.trim()) return; setBusy(true);
    try { const r = await cf.updateForm(form.id, n.trim(), d); if (r?.ok) { setOpen(false); onSaved(); } else alert(r?.error || "Failed"); }
    catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const del = async () => {
    if (busy) return;
    if (!confirm(tr(L(`Delete "${form.name}"? This permanently removes the form, its entries, files and members for everyone. This can't be undone.`, `Supprimer « ${form.name} » ? Cela supprime définitivement le formulaire, ses entrées, fichiers et membres pour tout le monde. Irréversible.`)))) return;
    setBusy(true);
    try { await cf.deleteForm(form.id); setOpen(false); onDeleted?.(); }
    catch (e: any) { alert(e.message); setBusy(false); }
  };
  return (
    <>
      <span onClick={() => setOpen(true)} style={{ fontSize: 12, fontWeight: 800, color: C.accent, background: C.accentSoft, borderRadius: 8, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>✎ {tr(L("Edit", "Modifier"))}</span>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: "100%", background: C.paper, borderRadius: 16, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{tr(L("Edit form", "Modifier le formulaire"))}</div>
              <span onClick={() => setOpen(false)} style={{ marginLeft: "auto", color: C.faint, fontWeight: 800, cursor: "pointer" }}>✕</span>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={railLbl}>{tr(L("Form title", "Titre du formulaire"))}</div>
                <input value={n} onChange={(e) => setN(e.target.value)} style={{ ...inp, marginTop: 6 }} />
              </div>
              <div>
                <div style={railLbl}>{tr(L("Description", "Description"))}</div>
                <textarea value={d} onChange={(e) => setD(e.target.value)} placeholder={tr(L("What this form is for…", "À quoi sert ce formulaire…"))} style={{ ...inp, minHeight: 80, marginTop: 6 }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div onClick={() => setOpen(false)} style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11, textAlign: "center", fontWeight: 800, fontSize: 13.5, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
                <div onClick={save} style={{ flex: 2, background: C.accent, color: "#fff", borderRadius: 9, padding: 11, textAlign: "center", fontWeight: 800, fontSize: 13.5, cursor: "pointer", opacity: busy || !n.trim() ? .6 : 1 }}>{busy ? "…" : tr(L("Save", "Enregistrer"))}</div>
              </div>
              <div onClick={del} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#B4531F", cursor: "pointer", marginTop: 2, borderTop: `1px solid ${C.line}`, paddingTop: 12, opacity: busy ? .6 : 1 }}>🗑 {tr(L("Delete this form", "Supprimer ce formulaire"))}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MembersRail({ form, tr, lang, sel, loadForm }: any) {
  return (
    <>
      <div style={railLbl}>{tr(L("Members", "Membres"))} · {form?.members.length ?? 0}</div>
      {(form?.members ?? []).map((m: any) => (
        <div key={(m.id ?? m.contact) as string} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 4px", opacity: m.status === "invited" ? 0.55 : 1 }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, background: m.color ?? "#CCC" }} />
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name ?? m.contact}</div><div style={{ fontSize: 10, color: C.faint }}>{m.status === "invited" ? tr(L("invited", "invité")) : (m.joined_at ? tr(L("joined", "rejoint")) + " " + fmtDate(m.joined_at, lang) : m.contact)}</div></div>
          {m.role === "admin" && <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, color: C.accent, background: C.accentSoft, padding: "2px 7px", borderRadius: 9 }}>ADMIN</span>}
          {m.status === "invited" && form?.is_admin && <ResendLink form={form.id} contact={m.contact} tr={tr} />}
        </div>
      ))}
      {form?.is_admin && <Invite form={form.id} tr={tr} onDone={() => sel && loadForm(sel)} />}
    </>
  );
}

function JoinCode({ tr, router }: any) {
  const [open, setOpen] = useState(false); const [c, setC] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!c.trim()) return; setBusy(true);
    try { const r = await cf.resolveCode(c.trim()); if (r?.ok && r.token) router.push(`/join?token=${r.token}`); else alert(tr(L("Invalid or already-used code.", "Code invalide ou déjà utilisé."))); }
    catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  if (!open) return <div onClick={() => setOpen(true)} style={{ background: C.accentSoft, color: C.accent, borderRadius: 11, padding: 11, textAlign: "center", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{tr(L("Join with a code", "Rejoindre avec un code"))}</div>;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input value={c} onChange={(e) => setC(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={tr(L("Enter code", "Entrez le code"))} style={{ ...inp, textAlign: "center", letterSpacing: 2, fontWeight: 800, textTransform: "uppercase" }} />
      <div onClick={go} style={{ background: C.accent, color: "#fff", borderRadius: 9, padding: "0 14px", display: "flex", alignItems: "center", fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "→"}</div>
    </div>
  );
}

function ResendLink({ form, contact, tr }: any) {
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const go = async (channel: "email" | "sms") => {
    setPick(false); if (busy) return; setBusy(true);
    const r = await cf.sendInvites(form, contact, channel); setBusy(false);
    if (r?.ok) alert(tr(L("Invite resent.", "Invitation renvoyée.")));
    else alert(tr(L("Couldn't resend: ", "Échec du renvoi : ")) + (r?.failed?.[0]?.error || r?.error || "unknown"));
  };
  if (busy) return <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: C.faint }}>…</span>;
  if (pick) return (
    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span onClick={() => go("email")} style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{tr(L("Email", "Courriel"))}</span>
      <span onClick={() => go("sms")} style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}>SMS</span>
      <span onClick={() => setPick(false)} style={{ fontSize: 11, color: C.faint, cursor: "pointer" }}>✕</span>
    </span>
  );
  return <span onClick={() => setPick(true)} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer" }}>{tr(L("Resend", "Renvoyer"))}</span>;
}

function Invite({ form, tr, onDone }: any) {
  const [v, setV] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!v.trim()) return; setBusy(true);
    try {
      const r = await cf.invite(form, v.trim());
      if (r && r.ok === false) {
        alert(r.error === "already_invited" ? tr(L("That email or phone is already on this form.", "Ce courriel ou téléphone est déjà sur ce formulaire."))
          : r.error === "invalid_contact" ? tr(L("Enter a valid email or phone.", "Entrez un courriel ou téléphone valide."))
          : (r.error || "Failed"));
      } else {
        const d = r?.delivery;
        if (d && d.ok === false) alert(tr(L("Member added, but the invite couldn't be delivered: ", "Membre ajouté, mais l'invitation n'a pu être envoyée : ")) + (d.failed?.[0]?.error || d.error || "unknown"));
        setV(""); onDone();
      }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <div style={{ ...railLbl, margin: "0 2px 2px" }}>{tr(L("Add member", "Ajouter un membre"))}</div>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={tr(L("Email or phone", "Courriel ou téléphone"))} style={{ ...inp, marginTop: 8 }} />
      <div onClick={send} style={{ background: C.accent, color: "#fff", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 12.5, fontWeight: 800, marginTop: 8, cursor: "pointer", opacity: busy ? .6 : 1 }}>{tr(L("Send invite", "Envoyer l'invitation"))}</div>
    </div>
  );
}

function NewEntry({ form, tr, onDone }: any) {
  const canPost = form.is_admin || form.features?.member_entries;
  // When the form defines no structured fields, give a single free-text "Note" area.
  const fields = (form.features?.fields && (form.fields?.length ?? 0) > 0) ? form.fields : [{ id: "__note", label: "Note", type: "longtext" }];
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!Object.values(vals).some((v) => String(v ?? "").trim())) { alert(tr(L("Enter something first.", "Entrez d'abord du contenu."))); return; }
    setBusy(true);
    try {
      const r = await cf.addEntry(form.id, vals);
      if (r && r.ok === false) alert(r.error === "entries_not_allowed" ? tr(L("The admin hasn't allowed members to add entries.", "L'admin n'a pas autorisé les membres à ajouter des entrées.")) : (r.error || "Failed"));
      else { setVals({}); setOpen(false); onDone(); }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  if (!canPost) return null;
  if (!open) return <div onClick={() => setOpen(true)} style={{ border: `1px dashed ${C.line}`, borderRadius: 11, padding: 12, textAlign: "center", fontWeight: 700, fontSize: 13, color: C.accent, cursor: "pointer" }}>{tr(L("+ New entry", "+ Nouvelle entrée"))}</div>;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {fields.map((f: any) => (
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

function EntryCard({ e, form, lang, tr, mobile, memberOf, reload }: any) {
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
      <div style={{ padding: "4px 16px 12px", display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "10px 18px" }}>
        {(() => {
          const defined = (form.fields ?? []) as any[];
          const labels = defined.map((f) => f.label);
          const extras = Object.keys(e.values ?? {}).filter((k) => !labels.includes(k)).map((k) => ({ id: `x_${k}`, label: k, type: "longtext" }));
          const all = [...defined, ...extras];
          return all.map((f: any) => (
            <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: f.type === "longtext" ? "1 / -1" : "auto" }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{f.label}</span>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: f.type === "longtext" ? 500 : 600, whiteSpace: "pre-wrap" }}>{String(e.values?.[f.label] ?? "—")}</span>
            </div>
          ));
        })()}
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
