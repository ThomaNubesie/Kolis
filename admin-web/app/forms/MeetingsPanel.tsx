"use client";
// Meetings, inside the department that calls them.
//
// A meeting called in Parliament invites Parliament — the same roster that staffs its
// offices — so there is no separate guest list to keep in step. Only an admin may call
// one; any member may say whether they are coming.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cf, type CfMeeting } from "@/lib/cf";

const L = (en: string, fr: string) => ({ en, fr });
const C = { ink: "#14131A", ink2: "#6B6675", faint: "#A8A29A", line: "#E3DCCB", accent: "#2F3AA3", soft: "#F4F1FB" };

const fmtDay = (d: Date, lang: string) => d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { month: "short" });
const two = (n: number) => String(n).padStart(2, "0");

// A datetime-local value is wall-clock in the BROWSER's zone; new Date() reads it that
// way and toISOString sends the true instant, so the officer and the member agree even
// when they are in different zones.
const localNowPlus = (hours: number) => {
  const d = new Date(Date.now() + hours * 3600_000);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
};

export default function MeetingsPanel({ form, tr, lang }: { form: any; tr: (o: any) => string; lang: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<CfMeeting[]>([]);
  const [past, setPast] = useState<CfMeeting[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", at: localNowPlus(24), dur: 60, desc: "" });

  const reload = useCallback(() => {
    cf.meetings(form.id).then(setRows).catch(() => setRows([]));
    cf.meetings(form.id, true).then(setPast).catch(() => setPast([]));
  }, [form.id]);
  useEffect(() => { reload(); }, [reload]);

  // A live meeting should light up without a manual refresh.
  useEffect(() => { const t = setInterval(reload, 60_000); return () => clearInterval(t); }, [reload]);

  const create = async () => {
    if (!f.title.trim() || !f.at || busy) return;
    setBusy(true);
    try {
      const r = await cf.meetingCreate(form.id, f.title.trim(), new Date(f.at).toISOString(), Number(f.dur), f.desc.trim() || undefined);
      // Telling people is separate from calling the meeting: a provider outage must not
      // undo the meeting, so a failure here is reported, not thrown.
      const n = await cf.meetingNotify("meeting", r.meeting_id);
      setAdding(false); setF({ title: "", at: localNowPlus(24), dur: 60, desc: "" });
      reload();
      if (!n?.ok) alert(tr(L("The meeting is called, but we couldn't reach everyone — tell them directly.",
                             "La réunion est convoquée, mais nous n'avons pas pu joindre tout le monde — prévenez-les directement.")));
    } catch (e: any) { alert(e?.message || "Failed"); }
    setBusy(false);
  };

  const rsvp = async (m: CfMeeting, r: "yes" | "no" | "maybe") => {
    setRows((rs) => rs.map((x) => x.id === m.id ? { ...x, my_rsvp: r } : x));   // answer immediately
    try { await cf.meetingRsvp(m.id, r); } finally { reload(); }
  };

  const cancel = async (m: CfMeeting) => {
    if (!confirm(tr(L(`Cancel "${m.title}"? Everyone called will keep the entry in their agenda until they refresh.`,
                      `Annuler « ${m.title} » ? La réunion disparaîtra de l'agenda de chacun.`)))) return;
    try { await cf.meetingCancel(m.id); reload(); } catch (e: any) { alert(e.message); }
  };

  const inp: any = { width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: C.ink };
  const lbl: any = { display: "block", fontSize: 11, fontWeight: 800, color: C.ink2, margin: "10px 0 4px" };
  const chip = (on: boolean): any => ({ border: `1.5px solid ${on ? "#2F8F6B" : C.line}`, background: on ? "#F2FAF6" : "#fff", color: on ? "#1F7A4D" : C.ink2, borderRadius: 20, padding: "4px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" });

  const card = (m: CfMeeting, dim = false) => {
    const d = new Date(m.starts_at);
    return (
      <div key={m.id} style={{ background: "#fff", border: `1px solid ${dim ? C.line : "#ECE9E2"}`, borderRadius: 13, padding: 14, marginBottom: 10, opacity: dim ? .72 : 1 }}>
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
          <div style={{ background: dim ? "#F4F1EB" : C.soft, border: `1px solid ${dim ? C.line : "#DEDCF2"}`, borderRadius: 10, width: 58, flex: "0 0 58px", textAlign: "center", padding: "7px 0" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: dim ? C.faint : C.accent, textTransform: "uppercase", letterSpacing: .5 }}>{fmtDay(d, lang)}</div>
            <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>{d.getDate()}</div>
            <div style={{ fontSize: 10, color: C.ink2 }}>{two(d.getHours())}:{two(d.getMinutes())}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 3 }}>
              {m.title}
              {m.live && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, marginLeft: 6, background: "#EAF7F0", color: "#1F7A4D", border: "1px solid #9FD9BE" }}>● {tr(L("LIVE NOW", "EN COURS"))}</span>}
              {m.status === "cancelled" && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, marginLeft: 6, background: "#FBEFE7", color: "#B4531F" }}>{tr(L("CANCELLED", "ANNULÉE"))}</span>}
            </div>
            <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.55 }}>
              {m.duration_min} min{m.called_by ? ` · ${tr(L("called by", "convoquée par"))} ${m.called_by}` : ""}
              {" · "}{m.yes} {tr(L("yes", "oui"))} · {m.no} {tr(L("no", "non"))} · {Math.max(0, m.called - m.yes - m.no - m.maybe)} {tr(L("no reply", "sans réponse"))}
            </div>
            {m.description && <div style={{ fontSize: 12.5, color: C.ink, whiteSpace: "pre-wrap", borderLeft: `3px solid ${C.soft}`, paddingLeft: 10, marginTop: 8 }}>{m.description}</div>}

            {m.status === "scheduled" && !dim && (
              <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                {m.live
                  ? <button onClick={() => router.push(`/m/${m.id}`)} style={{ background: "#1F7A4D", color: "#fff", border: "none", borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>▶ {tr(L("Join the room", "Rejoindre la salle"))}</button>
                  : <>
                      <span style={{ fontSize: 11.5, color: C.ink2, marginRight: 3 }}>{tr(L("Attending?", "Présent ?"))}</span>
                      <span style={chip(m.my_rsvp === "yes")} onClick={() => rsvp(m, "yes")}>✓ {tr(L("Yes", "Oui"))}</span>
                      <span style={chip(m.my_rsvp === "no")} onClick={() => rsvp(m, "no")}>{tr(L("No", "Non"))}</span>
                      <span style={chip(m.my_rsvp === "maybe")} onClick={() => rsvp(m, "maybe")}>{tr(L("Maybe", "Peut-être"))}</span>
                      <button onClick={() => router.push(`/m/${m.id}`)} style={{ background: "#fff", color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 9, padding: "6px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{tr(L("Open room", "Ouvrir la salle"))}</button>
                    </>}
                {form.is_admin && <span onClick={() => cancel(m)} style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: C.faint, cursor: "pointer" }}>{tr(L("cancel", "annuler"))}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: C.ink2, flex: 1, minWidth: 180 }}>
          {tr(L("Meetings of this department. Everyone active here is called — and told by email and text.",
                "Les réunions de ce département. Tous les membres actifs sont convoqués — et prévenus par courriel et SMS."))}
        </div>
        {form.is_admin && <button onClick={() => setAdding((a) => !a)} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>+ {tr(L("Call a meeting", "Convoquer"))}</button>}
      </div>

      {adding && (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 13, padding: 14, marginBottom: 12 }}>
          <label style={lbl}>{tr(L("Title", "Titre"))}</label>
          <input style={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tr(L("e.g. Monthly assembly", "ex. Assemblée mensuelle"))} autoFocus />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10 }}>
            <div><label style={lbl}>{tr(L("When", "Quand"))}</label>
              <input style={inp} type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></div>
            <div><label style={lbl}>{tr(L("Length", "Durée"))}</label>
              <select style={inp} value={f.dur} onChange={(e) => setF({ ...f, dur: Number(e.target.value) })}>
                {[30, 60, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
              </select></div>
          </div>
          <label style={lbl}>{tr(L("Agenda", "Ordre du jour"))}</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 62 }} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder={tr(L("Optional", "Facultatif"))} />
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.55 }}>
            {tr(L("Everyone called gets an email and a text now, and a reminder one hour before. Suspended members are not called.",
                  "Chaque convoqué reçoit un courriel et un SMS maintenant, puis un rappel une heure avant. Les membres suspendus ne sont pas convoqués."))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div onClick={() => setAdding(false)} style={{ flex: 1, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, color: C.ink2, cursor: "pointer" }}>{tr(L("Cancel", "Annuler"))}</div>
            <div onClick={create} style={{ flex: 2, textAlign: "center", background: f.title.trim() ? C.accent : C.line, color: "#fff", borderRadius: 9, padding: 10, fontWeight: 800, fontSize: 13, cursor: f.title.trim() ? "pointer" : "default" }}>
              {busy ? tr(L("Calling…", "Convocation…")) : tr(L("Call the meeting", "Convoquer"))}
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 && <div style={{ color: C.faint, fontSize: 13, padding: "6px 2px" }}>{tr(L("No meetings coming up.", "Aucune réunion à venir."))}</div>}
      {rows.map((m) => card(m))}

      {past.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div onClick={() => setShowPast((s) => !s)} style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, cursor: "pointer", marginBottom: 8 }}>
            {showPast ? "▾ " : "▸ "}{tr(L("Past meetings", "Réunions passées"))} · {past.length}
          </div>
          {showPast && past.map((m) => card(m, true))}
        </div>
      )}
    </div>
  );
}
