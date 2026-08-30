"use client";
// Quorly — Town Hall: the org's shared "voice a concern" board (Option ① feed).
// Admin opens a topic; members post entries (text + photo/video) with a For/Against
// vote and a two-level comment thread; each entry carries a running AI summary
// (populated by the cf-th-summarize edge fn). Closing publishes a PDF + emails
// participants (cf-th-publish). Backend: th_* RPCs, org-membership gated.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cf, planLimitMsg, type CfThFeed, type CfThEntry, type CfThComment } from "@/lib/cf";
import { buildTownHallPdf } from "@/lib/pdf";
import { memberColors } from "@/lib/colors";
import { ThumbsUp, ThumbsDown, ImagePlus, Sparkles, Lock, MessageSquare, Send, Loader2 } from "lucide-react";

const C = { paper: "#F1EEE7", panel: "#FFFFFF", ink: "#14131A", ink2: "#6B6863", faint: "#9a97a4", line: "#ECE9E2", accent: "#2F3AA3", accentSoft: "#EEEBFA", yea: "#178A4E", yeaS: "#E7F6EE", nay: "#C0392B", nayS: "#FBE9E7", violet: "#6B4FA3", violetS: "#F3EFFB" };
const L = (en: string, fr: string) => ({ en, fr });
type TR = (o: { en: string; fr: string }) => string;
const inp: any = { border: `1.5px solid #E3E0D8`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, background: "#FBFAF7", color: C.ink, outline: "none", fontFamily: "inherit", width: "100%" };
const av = (color: string | null, size = 30): any => ({ width: size, height: size, borderRadius: "50%", background: color || C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.42, flex: "0 0 auto" });
const initials = (n: string) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const btn = (bg: string, fg: string, on = false): any => ({ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 12.5, padding: "8px 13px", borderRadius: 9, cursor: "pointer", background: bg, color: fg, border: `1px solid ${on ? fg : "transparent"}` });

function MediaThumb({ path, kind }: { path: string; kind: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { cf.thMediaUrl(path).then(setUrl).catch(() => {}); }, [path]);
  const box: any = { width: 108, height: 74, borderRadius: 9, background: C.line, border: `1px solid ${C.line}`, objectFit: "cover", overflow: "hidden" };
  if (!url) return <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint }}>…</div>;
  return kind === "video"
    ? <video src={url} style={box} controls preload="metadata" />
    : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" style={box} /></a>;
}

function Thread({ entry, open, tr, lang, reload, org, cmap }: { entry: CfThEntry; open: boolean; tr: TR; lang: "en" | "fr"; reload: () => void; org: string; cmap: Record<string, string> }) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async (parent: string | null, body: string, clear: () => void) => {
    if (!body.trim() || busy) return; setBusy(true);
    try {
      const r = await cf.thComment(entry.id, parent, body.trim());
      if (r?.ok === false) { const pm = planLimitMsg(r, lang); alert(pm || (r.error === "topic_closed" ? tr(L("This topic is closed.", "Ce sujet est clos.")) : r.error)); }
      else { clear(); reload(); cf.thSummarize(org, entry.id).then(() => setTimeout(reload, 1500)); }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 11, display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.faint }}>{tr(L("Comments", "Commentaires"))} · {entry.comments.length}</div>
      {entry.comments.map((c: CfThComment) => (
        <div key={c.id}>
          <div style={{ display: "flex", gap: 9 }}>
            <span style={av(cmap[c.author] ?? c.author_color, 26)}>{initials(c.author)}</span>
            <div style={{ flex: 1, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 11px" }}>
              <div style={{ fontWeight: 800, fontSize: 12 }}>{c.author}</div>
              <div style={{ fontSize: 12.5, color: "#3A3A37", marginTop: 2 }}>{c.body}</div>
              {open && <div onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(""); }} style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, cursor: "pointer", marginTop: 5 }}>{tr(L("Reply", "Répondre"))}</div>}
            </div>
          </div>
          {(c.replies ?? []).map((r) => (
            <div key={r.id} style={{ marginLeft: 35, borderLeft: `2px solid ${C.violetS}`, paddingLeft: 11, marginTop: 7, display: "flex", gap: 9 }}>
              <span style={av(cmap[r.author] ?? r.author_color, 22)}>{initials(r.author)}</span>
              <div style={{ flex: 1, background: C.violetS, border: `1px solid #E4DEF7`, borderRadius: 10, padding: "7px 10px" }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: C.violet, textTransform: "uppercase", letterSpacing: .3 }}>{tr(L("Reply", "Réponse"))} · {r.author}</div>
                <div style={{ fontSize: 12.5, color: "#3A3A37", marginTop: 2 }}>{r.body}</div>
              </div>
            </div>
          ))}
          {open && replyTo === c.id && (
            <div style={{ marginLeft: 35, marginTop: 6, display: "flex", gap: 7 }}>
              <input autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post(c.id, replyText, () => { setReplyText(""); setReplyTo(null); })} placeholder={tr(L("Reply…", "Répondre…"))} style={{ ...inp, flex: 1 }} />
              <span onClick={() => post(c.id, replyText, () => { setReplyText(""); setReplyTo(null); })} style={btn(C.accent, "#fff")}>{tr(L("Reply", "Répondre"))}</span>
            </div>
          )}
        </div>
      ))}
      {open && (
        <div style={{ display: "flex", gap: 7 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post(null, text, () => setText(""))} placeholder={tr(L("Comment on this concern…", "Commenter cette préoccupation…"))} style={{ ...inp, flex: 1 }} />
          <span onClick={() => post(null, text, () => setText(""))} style={btn(C.accent, "#fff")}>{busy ? "…" : tr(L("Post", "Publier"))}</span>
        </div>
      )}
    </div>
  );
}

function EntryCard({ e, open, tr, lang, reload, org, cmap }: { e: CfThEntry; open: boolean; tr: TR; lang: "en" | "fr"; reload: () => void; org: string; cmap: Record<string, string> }) {
  const total = e.for + e.against;
  const pct = total ? Math.round((e.for / total) * 100) : 50;
  const vote = async (v: "for" | "against") => {
    try { const r = await cf.thVote(e.id, v); if (r?.ok === false) alert(r.error === "topic_closed" ? tr(L("This topic is closed.", "Ce sujet est clos.")) : r.error); else reload(); } catch (err: any) { alert(err.message); }
  };
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={av(cmap[e.author] ?? e.author_color, 34)}>{initials(e.author)}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 13.5 }}>{e.author}</div><div style={{ fontSize: 11, color: C.faint }}>#{e.seq}</div></div>
      </div>
      <div style={{ fontSize: 14.5, color: C.ink, margin: "11px 0", whiteSpace: "pre-wrap" }}>{e.body}</div>
      {e.media.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>{e.media.map((m, i) => <MediaThumb key={i} path={m.path} kind={m.kind} />)}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 7 }}>
          <span onClick={() => open && vote("for")} style={{ ...btn(C.yeaS, C.yea, e.my_vote === "for"), opacity: open ? 1 : .55, cursor: open ? "pointer" : "default" }}><ThumbsUp size={13} /> {tr(L("For", "Pour"))}</span>
          <span onClick={() => open && vote("against")} style={{ ...btn(C.nayS, C.nay, e.my_vote === "against"), opacity: open ? 1 : .55, cursor: open ? "pointer" : "default" }}><ThumbsDown size={13} /> {tr(L("Against", "Contre"))}</span>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 9, borderRadius: 99, background: C.nayS, overflow: "hidden", display: "flex" }}><span style={{ width: `${pct}%`, background: C.yea }} /></div>
          <div style={{ display: "flex", gap: 12, fontSize: 12, fontWeight: 800, marginTop: 5 }}><span style={{ color: C.yea }}>▲ {e.for} {tr(L("for", "pour"))}</span><span style={{ color: C.nay }}>▼ {e.against} {tr(L("against", "contre"))}</span><span style={{ color: C.faint }}>· {total} {tr(L("votes", "votes"))}</span></div>
        </div>
      </div>

      {e.summary && (
        <div style={{ background: C.violetS, border: `1px solid #E4DEF7`, borderRadius: 12, padding: "11px 13px", marginTop: 4 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.violet, display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={12} /> {tr(L("Running summary", "Résumé en direct"))}</div>
          <div style={{ fontSize: 12.5, color: "#3A3A37", marginTop: 5 }}>{e.summary}</div>
        </div>
      )}

      <Thread entry={e} open={open} tr={tr} lang={lang} reload={reload} org={org} cmap={cmap} />
    </div>
  );
}

// Invite straight from the assembly hall, so whoever is running the meeting can
// bring someone in without leaving for the Members tab.
function InviteBar({ org, tr, lang }: { org: string; tr: TR; lang: "en" | "fr" }) {
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const send = async () => {
    const c = contact.trim(); if (!c || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await cf.orgInvite(org, c, null, lang);
      if (r?.ok === false) {
        const pm = planLimitMsg(r, lang);
        setMsg(pm || (r.error === "already_invited" ? tr(L("Already invited.", "Déjà invité.")) : r.error === "not_admin" ? tr(L("You don't have permission to invite.", "Vous n'avez pas la permission d'inviter.")) : r.error || "Failed"));
      } else { setContact(""); setMsg(tr(L("Invitation sent.", "Invitation envoyée."))); }
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px", marginTop: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint, marginBottom: 7 }}>{tr(L("Invite to the assembly", "Inviter à l'assemblée"))}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={contact} onChange={(e) => setContact(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={tr(L("Email or phone", "Courriel ou téléphone"))} style={{ ...inp, flex: 1, minWidth: 180 }} />
        <span onClick={send} style={{ ...btn(C.accent, "#fff"), opacity: contact.trim() && !busy ? 1 : .6 }}><Send size={13} /> {busy ? "…" : tr(L("Invite", "Inviter"))}</span>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 7, color: /sent|envoyée/i.test(msg) ? C.yea : "#B4531F" }}>{msg}</div>}
    </div>
  );
}

export default function TownHall({ org, tr, lang }: { org: string; tr: TR; lang: "en" | "fr" }) {
  const [feed, setFeed] = useState<CfThFeed | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { cf.thFeed(org).then(setFeed).catch(() => setFeed(null)); }, [org]);
  useEffect(() => { load(); }, [load]);

  // One colour per voice across the whole hall — entries, comments and replies —
  // so the same person is the same dot everywhere and no two people collide.
  const cmap = useMemo(() => {
    const seen: { key: string; color?: string | null }[] = [];
    const add = (name: string, color: string | null) => { if (name && !seen.some((x) => x.key === name)) seen.push({ key: name, color }); };
    (feed?.entries ?? []).forEach((e) => {
      add(e.author, e.author_color);
      (e.comments ?? []).forEach((c) => { add(c.author, c.author_color); (c.replies ?? []).forEach((r) => add(r.author, r.author_color)); });
    });
    return memberColors(seen);
  }, [feed]);
  const topic = feed?.topic ?? null;
  const isAdmin = !!feed?.is_admin;
  const open = topic?.status === "open";

  const openTopic = async () => {
    const t = window.prompt(tr(L("Topic of discussion (members will post concerns under this):", "Sujet de discussion (les membres publieront des préoccupations) :")), "");
    if (t === null || !t.trim()) return;
    const r = await cf.thOpenTopic(org, t.trim());
    if (r?.ok === false) alert(r.error); else load();
  };
  const closeTopic = async () => {
    if (!topic || !confirm(tr(L("Close this topic and publish the summary PDF to all participants?", "Clore ce sujet et publier le PDF de synthèse à tous les participants ?")))) return;
    const r = await cf.thCloseTopic(topic.id);
    if (r?.ok === false) { alert(r.error); return; }
    try {
      const fresh = await cf.thFeed(org);
      const b64 = await buildTownHallPdf(topic.title, fresh.entries ?? [], lang);
      const members = await cf.orgMembers(org);
      const emails = Array.from(new Set((members ?? []).map((m: any) => String(m.contact || "").trim().toLowerCase()).filter((c: string) => c.includes("@"))));
      if (b64 && emails.length) await cf.sendPdf(org, { filename: `townhall-${topic.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.pdf`, pdf_base64: b64, recipients: emails, message: tr(L(`Published summary of the Town Hall topic "${topic.title}".`, `Synthèse publiée du sujet d'assemblée « ${topic.title} ».`)) });
      alert(tr(L(`Topic closed. Summary PDF emailed to ${emails.length} participant(s).`, `Sujet clos. PDF de synthèse envoyé à ${emails.length} participant(s).`)));
    } catch (e: any) { alert(tr(L("Closed, but the summary email failed: ", "Clos, mais l'envoi de la synthèse a échoué : ")) + (e?.message || "")); }
    load();
  };
  const submitEntry = async () => {
    if (!topic || !body.trim() || busy) return; setBusy(true);
    try {
      const r = await cf.thEntryAdd(topic.id, body.trim());
      if (r?.ok === false) { const pm = planLimitMsg(r, lang); alert(pm || (r.error === "topic_closed" ? tr(L("This topic is closed.", "Ce sujet est clos.")) : r.error)); setBusy(false); return; }
      for (const f of files) { try { const m = await cf.thUploadMedia(org, f); await cf.thMediaAdd(r.entry_id, m.path, m.kind); } catch { /* skip a bad file */ } }
      setBody(""); setFiles([]); load(); cf.thSummarize(org, r.entry_id).then(() => setTimeout(load, 1500));
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  if (!feed) return <div style={{ color: C.faint, fontSize: 13, padding: 16 }}><Loader2 size={14} style={{ verticalAlign: -2 }} className="spin" /> {tr(L("Loading Town Hall…", "Chargement de l'assemblée…"))}</div>;
  if (feed.error) return <div style={{ color: C.faint, fontSize: 13, padding: 16 }}>{tr(L("You're not a member of this organization.", "Vous n'êtes pas membre de cette organisation."))}</div>;

  return (
    <div>
      {/* topic banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "15px 17px", flexWrap: "wrap" }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flex: "0 0 auto" }}>🏛️</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{tr(L("Topic of discussion", "Sujet de discussion"))}{isAdmin ? "" : ` · ${tr(L("set by admin", "défini par l'admin"))}`}</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{topic ? topic.title : tr(L("No topic open yet.", "Aucun sujet ouvert."))}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {topic && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: open ? C.yeaS : C.violetS, color: open ? C.yea : C.violet }}>{open ? tr(L("Open for entries", "Ouvert aux entrées")) : tr(L("Closed", "Clos"))}</span>}
          {isAdmin && open && <span onClick={closeTopic} style={btn(C.accent, "#fff")}><Lock size={13} /> {tr(L("Close & publish", "Clore & publier"))}</span>}
          {isAdmin && <span onClick={openTopic} style={btn("#fff", C.accent, true)}>{topic ? tr(L("New topic", "Nouveau sujet")) : tr(L("Open a topic", "Ouvrir un sujet"))}</span>}
        </div>
      </div>

      {/* Invite from the assembly hall, without leaving for the Members tab. */}
      {isAdmin && <InviteBar org={org} tr={tr} lang={lang} />}

      {/* composer */}
      {topic && open && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginTop: 14 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr(L("Voice a concern — what should the group consider?", "Exprimez une préoccupation — que devrait considérer le groupe ?"))} style={{ ...inp, minHeight: 64, resize: "vertical" }} />
          {files.length > 0 && <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 6 }}>{files.length} {tr(L("attachment(s)", "pièce(s) jointe(s)"))}: {files.map((f) => f.name).join(", ")}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <span onClick={() => fileRef.current?.click()} style={btn(C.paper, C.ink2, true)}><ImagePlus size={14} /> {tr(L("Photo / video", "Photo / vidéo"))}</span>
            <span onClick={submitEntry} style={{ ...btn(C.accent, "#fff"), marginLeft: "auto", opacity: body.trim() && !busy ? 1 : .6 }}>{busy ? "…" : tr(L("Post concern", "Publier"))}</span>
          </div>
        </div>
      )}
      {topic && !open && <div style={{ background: C.violetS, border: `1px solid #E4DEF7`, borderRadius: 12, padding: "11px 14px", marginTop: 14, fontSize: 13, color: C.violet }}>{tr(L("This topic is closed — voting and comments are locked. The summary was published to participants.", "Ce sujet est clos — votes et commentaires verrouillés. La synthèse a été publiée aux participants."))}</div>}

      {/* entries */}
      {feed.entries.length === 0 && topic && <div style={{ color: C.faint, fontSize: 13, marginTop: 16 }}>{tr(L("No concerns yet — be the first to voice one.", "Aucune préoccupation — soyez le premier à en exprimer une."))}</div>}
      {feed.entries.map((e) => <EntryCard key={e.id} e={e} open={!!open} tr={tr} lang={lang} reload={load} org={org} cmap={cmap} />)}
    </div>
  );
}
