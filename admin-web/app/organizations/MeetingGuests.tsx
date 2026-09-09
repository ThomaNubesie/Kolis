"use client";
import { useEffect, useMemo, useState } from "react";
import { cf, type CfGuestCandidate } from "@/lib/cf";
import { Check, X, Loader2, Users } from "lucide-react";

// Who is CALLED to a meeting.
//
// Until this existed the roster was the guest list: calling a meeting in Trésorerie called
// the whole organisation, and a department could not call four names out of Parliament.
//
// The default stays "everyone in this space" — the behaviour before this dialog — so a
// convener who ignores it gets what the product always did rather than a silently
// restricted meeting. Choosing nobody is not the same as choosing everyone, and the
// button says which one is about to happen.

type Lang = "en" | "fr";
const T = {
  title:    { en: "Who is called to this meeting?", fr: "Qui est convoqué à cette réunion ?" },
  everyone: { en: "Everyone in this space", fr: "Tout le monde dans cet espace" },
  choose:   { en: "Choose specific people", fr: "Choisir des personnes précises" },
  here:     { en: "In this space", fr: "Dans cet espace" },
  above:    { en: "From the organisation", fr: "Depuis l'organisation" },
  all:      { en: "All", fr: "Tous" },
  none:     { en: "None", fr: "Aucun" },
  send:     { en: "Call the meeting", fr: "Convoquer" },
  sending:  { en: "Calling…", fr: "Convocation…" },
  nobody:   { en: "Nobody selected — only you will be called.", fr: "Personne sélectionné — vous seul serez convoqué." },
  count:    { en: "will be called", fr: "seront convoqués" },
  youAlways:{ en: "You are always called to a meeting you convene.", fr: "Vous êtes toujours convoqué(e) à une réunion que vous appelez." },
  loading:  { en: "Loading people…", fr: "Chargement…" },
  filter:   { en: "Anywhere", fr: "Partout" },
  search:   { en: "Search a name…", fr: "Chercher un nom…" },
};

const C = { ink: "#14131A", ink2: "#6B6675", faint: "#A8A29A", line: "#E3DCCB", accent: "#2F3AA3", soft: "#F4F1FB" };

export default function MeetingGuests({
  meetingId, formId, title, lang, onDone,
}: {
  meetingId: string; formId: string; title: string; lang: Lang;
  onDone: (notified: boolean) => void;
}) {
  const tr = (o: { en: string; fr: string }) => (lang === "fr" ? o.fr : o.en);
  const [people, setPeople] = useState<CfGuestCandidate[] | null>(null);
  const [mode, setMode] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [space, setSpace] = useState<string | null>(null);   // filter by department
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cf.meetingGuestCandidates(formId).then(setPeople).catch(() => setPeople([]));
  }, [formId]);

  // Every department / hall anyone here belongs to, so the filter row is built from the
  // real structure rather than a hardcoded list.
  const spaces = useMemo(() => {
    const s = new Set<string>();
    (people ?? []).forEach((p) => (p.spaces ?? []).forEach((x) => s.add(x)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [people]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keep = (p: CfGuestCandidate) =>
      (!space || (p.spaces ?? []).includes(space)) &&
      (!needle || p.name.toLowerCase().includes(needle));
    const shown = (people ?? []).filter(keep);
    return { here: shown.filter((p) => p.here), above: shown.filter((p) => !p.here) };
  }, [people, space, q]);

  const toggle = (id: string) =>
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const setMany = (list: CfGuestCandidate[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      list.forEach((p) => (on ? n.add(p.member_id) : n.delete(p.member_id)));
      return n;
    });

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // An empty array is the "everyone" signal the database already understands, so the
      // two modes are one call rather than a branch on the server.
      await cf.meetingSetGuests(meetingId, mode === "all" ? [] : [...picked]);
      const n = await cf.meetingNotify("meeting", meetingId);
      onDone(!!n?.ok);
    } catch {
      onDone(false);
    }
  };

  const row = (p: CfGuestCandidate) => {
    const on = picked.has(p.member_id);
    return (
      <div key={p.member_id} onClick={() => toggle(p.member_id)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: 9,
                 cursor: "pointer", background: on ? C.soft : "transparent" }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, flex: "none", display: "flex",
                       alignItems: "center", justifyContent: "center",
                       border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? C.accent : "#fff" }}>
          {on && <Check size={12} color="#fff" />}
        </span>
        <span style={{ width: 9, height: 9, borderRadius: 9, flex: "none", background: p.color || C.faint }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.ink,
                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name}
          {p.title && <span style={{ fontWeight: 400, color: C.faint }}> · {p.title}</span>}
        </span>
        {(p.spaces ?? []).length > 0 &&
          <span style={{ fontSize: 10.5, color: C.faint, flex: "none", maxWidth: 150,
                         overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(p.spaces ?? []).join(" · ")}
          </span>}
      </div>
    );
  };

  const section = (label: string, list: CfGuestCandidate[]) => list.length === 0 ? null : (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 4px" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .6, textTransform: "uppercase", color: C.faint, flex: 1 }}>{label}</span>
        <span onClick={() => setMany(list, true)} style={{ fontSize: 11, fontWeight: 700, color: C.accent, cursor: "pointer" }}>{tr(T.all)}</span>
        <span onClick={() => setMany(list, false)} style={{ fontSize: 11, fontWeight: 700, color: C.faint, cursor: "pointer" }}>{tr(T.none)}</span>
      </div>
      {list.map(row)}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,19,26,.55)", display: "flex",
                  alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 460, maxWidth: "100%",
                    maxHeight: "88vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 30px 70px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "15px 17px 11px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{tr(T.title)}</div>
              <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{title}</div>
            </div>
            <span onClick={() => onDone(false)} style={{ cursor: "pointer", color: C.faint, padding: 2 }}><X size={17} /></span>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
            {(["all", "some"] as const).map((m) => (
              <span key={m} onClick={() => setMode(m)}
                style={{ flex: 1, textAlign: "center", padding: "8px 10px", borderRadius: 9, fontSize: 12.5,
                         fontWeight: 800, cursor: "pointer",
                         background: mode === m ? C.accent : "#fff", color: mode === m ? "#fff" : C.ink2,
                         border: `1px solid ${mode === m ? C.accent : C.line}` }}>
                {m === "all" ? tr(T.everyone) : tr(T.choose)}
              </span>
            ))}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "4px 12px 10px", flex: 1 }}>
          {mode === "all" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.ink2, fontSize: 13, padding: "18px 8px" }}>
              <Users size={17} color={C.accent} />
              <span>{groups.here.length} {tr(T.count)}.</span>
            </div>
          ) : people === null ? (
            <div style={{ color: C.faint, fontSize: 12.5, padding: "18px 8px" }}>{tr(T.loading)}</div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(T.search)}
                style={{ width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 9,
                         padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit", marginTop: 8 }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {[null, ...spaces].map((s) => (
                  <span key={s ?? "*"} onClick={() => setSpace(s)}
                    style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 20,
                             cursor: "pointer",
                             background: space === s ? C.accent : "#fff",
                             color: space === s ? "#fff" : C.ink2,
                             border: `1px solid ${space === s ? C.accent : C.line}` }}>
                    {s ?? tr(T.filter)}
                  </span>
                ))}
              </div>
              {section(tr(T.here), groups.here)}
              {section(tr(T.above), groups.above)}
              <div style={{ fontSize: 11, color: C.faint, margin: "12px 2px 0" }}>{tr(T.youAlways)}</div>
            </>
          )}
        </div>

        <div style={{ padding: "11px 14px", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 11.5, color: mode === "some" && picked.size === 0 ? "#B4552F" : C.faint }}>
            {mode === "some" && picked.size === 0 ? tr(T.nobody) : `${mode === "all" ? groups.here.length : picked.size} ${tr(T.count)}`}
          </span>
          <span onClick={go}
            style={{ background: C.accent, color: "#fff", fontWeight: 800, fontSize: 13, padding: "9px 16px",
                     borderRadius: 10, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1,
                     display: "inline-flex", alignItems: "center", gap: 7 }}>
            {busy && <Loader2 size={14} className="spin" />}
            {busy ? tr(T.sending) : tr(T.send)}
          </span>
        </div>
      </div>
    </div>
  );
}
