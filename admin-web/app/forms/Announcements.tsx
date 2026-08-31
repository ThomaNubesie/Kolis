"use client";
// Quorly — live dated announcements. A "continuous welcome" feed of timestamped
// posts with optional deadlines. Used on the org Home (assembly feed) and on each
// department; a department admin can post to THIS department or up to the ASSEMBLY.
import { useCallback, useEffect, useState } from "react";
import { cf, type CfAnnFeed } from "@/lib/cf";
import { useAutoT } from "@/lib/autotranslate";
import { Megaphone, Clock, Trash2, Plus, X } from "lucide-react";

const C = { panel: "#FFFFFF", ink: "#14131A", ink2: "#4A4A46", faint: "#8a8790", line: "#ECE9E2", accent: "#2F3AA3", cream: "#FBF8F2", red: "#C0392B", amber: "#A86A12", green: "#178A4E" };
const L = (en: string, fr: string) => ({ en, fr });
type TR = (o: { en: string; fr: string }) => string;
const inp: any = { border: `1.5px solid #E3E0D8`, borderRadius: 9, padding: "8px 10px", fontSize: 13, background: "#fff", color: C.ink, outline: "none", fontFamily: "inherit", width: "100%" };
const initials = (n: string) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export default function Announcements({ form, orgId, tr, lang, welcome, mobile }: { form: string; orgId?: string | null; tr: TR; lang: "en" | "fr"; welcome?: boolean; mobile?: boolean }) {
  const at = useAutoT();   // announcements are written in one language, read in another
  const [feed, setFeed] = useState<CfAnnFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(""); const [deadline, setDeadline] = useState("");
  const [target, setTarget] = useState<"local" | "assembly">("local");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => cf.annList(form).then(setFeed).catch(() => setFeed(null)), [form]);
  useEffect(() => { load(); }, [load]);

  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
  const dl = (iso: string) => {
    const d = new Date(iso), now = new Date(); const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    const date = d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" });
    if (days < 0) return { txt: tr(L(`Deadline passed · ${date}`, `Échéance passée · ${date}`)), col: C.faint };
    if (days === 0) return { txt: tr(L(`Due today · ${date}`, `Échéance aujourd'hui · ${date}`)), col: C.red };
    return { txt: tr(L(`Closes in ${days} day${days > 1 ? "s" : ""} · ${date}`, `Ferme dans ${days} jour${days > 1 ? "s" : ""} · ${date}`)), col: days <= 3 ? C.red : C.amber };
  };

  const post = async () => {
    if (!body.trim() || busy) return; setBusy(true);
    const tgt = (orgId && orgId !== form && target === "assembly") ? orgId : form;
    try {
      const r = await cf.annAdd(tgt, body.trim(), deadline || null);
      if (r?.ok === false) alert(r.error === "not_admin" ? tr(L("You can't post here.", "Vous ne pouvez pas publier ici.")) : r.error);
      else {
        setBody(""); setDeadline(""); setOpen(false); setTarget("local");
        let note = tgt === form ? "" : tr(L("Posted to the whole group.", "Publié à tout le groupe."));
        if (notify && r?.id) {
          const n = await cf.annNotify(r.id);
          if (n?.ok) note = (note ? note + " " : "") + tr(L(`Notified ${n.emailed} by email, ${n.texted} by text.`, `${n.emailed} notifiés par courriel, ${n.texted} par texto.`));
        }
        if (tgt === form) load();
        if (note) alert(note);
      }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const del = async (id: string) => { if (!confirm(tr(L("Delete this announcement?", "Supprimer cette annonce ?")))) return; try { await cf.annDelete(id); load(); } catch (e: any) { alert(e.message); } };

  if (!feed || feed.error) return null;
  const items = feed.items || [];
  return (
    <div style={{ padding: "18px 0", borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".06em", color: C.faint, fontWeight: 800 }}><Megaphone size={13} /> {welcome ? tr(L("Welcome & updates", "Bienvenue & mises à jour")) : tr(L("Updates", "Mises à jour"))}</span>
        {feed.can_post && <span onClick={() => setOpen((v) => !v)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: C.accent, cursor: "pointer" }}><Plus size={14} /> {tr(L("Post", "Publier"))}</span>}
      </div>

      {open && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 12, background: C.cream }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr(L("Write an announcement… (paste text, add a deadline)", "Rédigez une annonce… (collez du texte, ajoutez une échéance)"))} style={{ ...inp, minHeight: 58, resize: "vertical" }} autoFocus />
          <div style={{ display: "flex", gap: 8, marginTop: 9, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 11.5, color: C.ink2, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}><Clock size={13} /> {tr(L("Deadline", "Échéance"))}
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inp, width: "auto", padding: "6px 8px" }} /></label>
            {orgId && orgId !== form && (
              <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
                {(["local", "assembly"] as const).map((t) => <span key={t} onClick={() => setTarget(t)} style={{ padding: "6px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", background: target === t ? C.accent : "#fff", color: target === t ? "#fff" : C.ink2 }}>{t === "local" ? tr(L("This department", "Ce département")) : tr(L("Whole group", "Tout le groupe"))}</span>)}
              </div>
            )}
            <span onClick={post} style={{ marginLeft: "auto", background: C.accent, color: "#fff", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: body.trim() && !busy ? 1 : .6 }}>{busy ? "…" : tr(L("Post", "Publier"))}</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, color: C.ink2, cursor: "pointer" }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 15, height: 15, accentColor: C.accent }} />
            {tr(L("Notify all members by text & email", "Avertir tous les membres par texto et courriel"))}
          </label>
        </div>
      )}

      {items.length === 0 && !open && <div style={{ fontSize: 13, color: C.faint }}>{tr(L("No updates yet.", "Aucune mise à jour."))}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((a) => {
          const d = a.deadline ? dl(a.deadline) : null;
          return (
            <div key={a.id} style={{ display: "flex", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: a.author_color || C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flex: "none" }}>{initials(a.author)}</span>
              <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 12.5 }}>{a.author}</span>
                  <span style={{ fontSize: 11, color: C.faint }}>{fmtDate(a.created_at)}</span>
                  {a.can_delete && <span onClick={() => del(a.id)} style={{ marginLeft: "auto", color: C.faint, cursor: "pointer", display: "flex" }}><Trash2 size={14} /></span>}
                </div>
                <div style={{ fontSize: 14, color: C.ink, marginTop: 4, whiteSpace: "pre-wrap" }}>{at(a.body)}</div>
                {d && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11.5, fontWeight: 800, color: d.col, background: "#fff", border: `1px solid ${d.col}33`, borderRadius: 999, padding: "3px 9px" }}><Clock size={12} /> {d.txt}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
