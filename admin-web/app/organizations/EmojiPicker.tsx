"use client";
// Quorly — the emoji a department wears in the list.
//
// A curated library rather than the OS picker: an organization's departments should
// read as one set, and the system picker's 3,000 faces and flags do the opposite.
// These are institutional marks — a quill for the minutes, a fleur-de-lis for the
// vote, an amphora for the treasury — deliberately avoiding the obvious 📝 💰 📁 👥.
import { useState } from "react";

const C = { ink: "#14131A", muted: "#8a8790", line: "#ECE9E2", accent: "#2F3AA3", soft: "#EEEBFA", cream: "#FBF8F2" };
const L = (en: string, fr: string) => ({ en, fr });

export const EMOJI_GROUPS: { nm: [string, string]; items: string[] }[] = [
  { nm: ["Assembly & halls", "Assemblée & salles"], items: ["🕍", "🏯", "🏰", "⛩️", "🗼", "🏟️", "🎪", "🛖", "🗽", "🏛"] },
  { nm: ["Records & the pen", "Archives & plume"], items: ["🪶", "📜", "✒️", "🖋️", "📔", "🗞️", "🪪", "🧷", "📯", "🪧"] },
  { nm: ["Authority & vote", "Autorité & vote"], items: ["⚜️", "🛡️", "🔱", "⚔️", "🗝️", "♟️", "🎖️", "🏅", "🧿", "🧮"] },
  { nm: ["Treasury & trade", "Trésorerie & commerce"], items: ["🏺", "💎", "🪙", "⚖️", "🛒", "🧺", "⚱️", "🪝", "🎟️", "🧾"] },
  { nm: ["Craft & the road", "Métier & route"], items: ["🔩", "⚙️", "🪛", "🧰", "⛏️", "⚒️", "🚜", "🛺", "🛤️", "⚓"] },
  { nm: ["Time & watch", "Temps & veille"], items: ["🕰️", "⏳", "🧭", "🛎️", "🔭", "🕯️", "📡", "🛰️", "🌡️", "🪞"] },
  { nm: ["Living things", "Le vivant"], items: ["🦉", "🐝", "🌿", "🪵", "🌾", "🪷", "🦬", "🪸", "🍂", "🐎"] },
  { nm: ["Marks & signals", "Marques & signaux"], items: ["✴️", "🔆", "♦️", "🪩", "🧩", "🎐", "🔮", "🌀", "⚡", "🜂"] },
];

export default function EmojiPicker({ value, tr, lang, onPick, onClose }: {
  value?: string | null;
  tr: (o: { en: string; fr: string }) => string;
  lang: "en" | "fr";
  onPick: (emoji: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const groups = ql
    ? EMOJI_GROUPS.filter((g) => g.nm[0].toLowerCase().includes(ql) || g.nm[1].toLowerCase().includes(ql))
    : EMOJI_GROUPS;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,19,26,.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, width: 420, maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "13px 15px 0" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{tr(L("Choose an emoji", "Choisir un emoji"))}</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(L("Filter groups — assembly, treasury, road…", "Filtrer — assemblée, trésorerie, route…"))}
            style={{ width: "100%", border: `1.5px solid #E3E0D8`, borderRadius: 10, padding: "8px 11px", fontSize: 13, background: "#FBFAF7", color: C.ink, outline: "none", fontFamily: "inherit", margin: "9px 0 4px" }} />
        </div>
        <div style={{ overflow: "auto", padding: "6px 15px 12px" }}>
          {groups.map((g) => (
            <div key={g.nm[0]}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .05, textTransform: "uppercase", color: C.muted, margin: "10px 0 5px" }}>{lang === "fr" ? g.nm[1] : g.nm[0]}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {g.items.map((e) => (
                  <button key={e} onClick={() => { onPick(e); onClose(); }} title={e}
                    style={{ fontSize: 19, lineHeight: 1, width: 38, height: 38, padding: 0, cursor: "pointer", borderRadius: 9, background: value === e ? C.soft : C.cream, border: `1px solid ${value === e ? C.accent : C.line}` }}>{e}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 15px", display: "flex", gap: 8 }}>
          <span onClick={() => { onPick(null); onClose(); }} style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, cursor: "pointer", padding: "7px 10px" }}>{tr(L("No emoji", "Aucun emoji"))}</span>
          <span onClick={onClose} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: "pointer", padding: "7px 10px" }}>{tr(L("Close", "Fermer"))}</span>
        </div>
      </div>
    </div>
  );
}
