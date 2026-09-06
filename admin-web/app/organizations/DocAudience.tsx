"use client";
import { useEffect, useMemo, useState } from "react";
import { cf, type CfMember, type CfNoticeStatus } from "@/lib/cf";
import { Check, Mail, MessageSquare, Eye, EyeOff, X, AlertTriangle, Loader2 } from "lucide-react";

// Who is TOLD about a document and who may SEE it are two different questions, so this
// dialog asks them separately rather than collapsing both into one "share with" list.
// A treasurer may need to know minutes were filed without being able to open them; counsel
// may need to read something nobody should be texted about.
//
// Default is deliberately "everyone in the space, notified" — that matches what the
// product did before this existed, so a poster who ignores this dialog gets the old
// behaviour rather than a silently restricted document.

type Lang = "en" | "fr";
const T = {
  title:    { en: "Who should know about this document?", fr: "Qui doit être informé de ce document ?" },
  everyone: { en: "Everyone in this space", fr: "Tout le monde dans cet espace" },
  choose:   { en: "Choose specific people", fr: "Choisir des personnes précises" },
  notify:   { en: "Notify", fr: "Informer" },
  canView:  { en: "Can open", fr: "Peut ouvrir" },
  notifyH:  { en: "Receives an email and a text", fr: "Reçoit un courriel et un texto" },
  viewH:    { en: "Can open the document", fr: "Peut ouvrir le document" },
  urgent:   { en: "Marked urgent — anyone who has not acknowledged in 6 hours gets one reminder.",
              fr: "Marqué urgent — un seul rappel après 6 heures sans accusé de réception." },
  send:     { en: "Send notifications", fr: "Envoyer les notifications" },
  skip:     { en: "Don't notify", fr: "Ne pas notifier" },
  sending:  { en: "Sending…", fr: "Envoi…" },
  none:     { en: "Nobody selected — nothing will be sent.", fr: "Personne sélectionné — rien ne sera envoyé." },
  sentOk:   { en: "Sent", fr: "Envoyé" },
  status:   { en: "Delivery", fr: "Livraison" },
  ack:      { en: "Acknowledged", fr: "Accusé de réception" },
  waiting:  { en: "Awaiting", fr: "En attente" },
  chased:   { en: "reminded", fr: "relancé" },
  all:      { en: "All", fr: "Tous" },
  noneBtn:  { en: "None", fr: "Aucun" },
  warnView: { en: "Some people are notified but cannot open it.", fr: "Certaines personnes sont informées sans pouvoir l'ouvrir." },
};

export default function DocAudience({
  fileId, fileName, urgent, members, lang, onClose,
}: {
  fileId: string; fileName: string; urgent: boolean;
  members: CfMember[]; lang: Lang; onClose: (sent?: boolean) => void;
}) {
  const t = (k: keyof typeof T) => T[k][lang];
  const roster = useMemo(
    () => members.filter((m) => m.status === "active" && !m.suspended && (m.member_id || m.id)),
    [members],
  );
  const idOf = (m: CfMember) => (m.member_id || m.id)!;

  const [mode, setMode] = useState<"all" | "pick">("all");
  const [notify, setNotify] = useState<Set<string>>(new Set());
  const [view, setView] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ recipients: number; email: number; sms: number; failed: number } | null>(null);
  const [status, setStatus] = useState<CfNoticeStatus[] | null>(null);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  };

  // Notified-but-cannot-open is legitimate but rarely intended, so it is surfaced as a
  // warning rather than silently prevented.
  const blindSpots = mode === "pick"
    ? [...notify].filter((id) => !view.has(id)).length
    : 0;

  async function send() {
    setBusy(true); setErr(null);
    try {
      if (mode === "pick") {
        await cf.fileAudienceSet(fileId, [...notify], [...view]);
      } else {
        await cf.fileAudienceSet(fileId, [], []);     // clears any restriction
      }
      const r = await cf.fileNotify(fileId);
      setResult(r);
      setStatus(await cf.fileNoticeStatus(fileId).catch(() => []));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(!!result); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [result, onClose]);

  const S = {
    row: { display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: "1px solid #F1EDE4" } as const,
    pill: (on: boolean, col: string) => ({
      display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700,
      padding: "4px 9px", borderRadius: 20, cursor: "pointer", userSelect: "none" as const,
      border: `1.5px solid ${on ? col : "#E3DCCB"}`, background: on ? col : "#fff", color: on ? "#fff" : "#8A857C",
    }),
    btn: { padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1.5px solid #E3DCCB", background: "#fff", color: "#6B6675" } as const,
  };

  return (
    <div onClick={() => onClose(!!result)} style={{ position: "fixed", inset: 0, background: "rgba(20,19,26,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #EFEAE0", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{t("title")}</div>
            <div style={{ fontSize: 12.5, color: "#8A857C", marginTop: 2 }}>{fileName}</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#8A857C" }} onClick={() => onClose(!!result)} />
        </div>

        {urgent && !result && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FBE9E7", color: "#8E2A20", padding: "10px 20px", fontSize: 12.5, lineHeight: 1.5 }}>
            <AlertTriangle size={15} style={{ flex: "0 0 auto", marginTop: 1 }} /><span>{t("urgent")}</span>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {!result ? (
            <>
              <div style={{ display: "flex", gap: 8, padding: "14px 20px" }}>
                {(["all", "pick"] as const).map((m) => (
                  <div key={m} onClick={() => setMode(m)} style={{ ...S.btn, ...(mode === m ? { background: "#2F3AA3", borderColor: "#2F3AA3", color: "#fff" } : {}) }}>
                    {m === "all" ? t("everyone") : t("choose")}
                  </div>
                ))}
              </div>

              {mode === "pick" && (
                <div style={{ padding: "0 20px 8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#A8A29A", fontWeight: 800, letterSpacing: .4, padding: "0 10px 6px" }}>
                    <span>{roster.length} {lang === "fr" ? "membres" : "members"}</span>
                    <span style={{ display: "flex", gap: 10 }}>
                      <span title={t("notifyH")} style={{ cursor: "pointer" }} onClick={() => setNotify(new Set(roster.map(idOf)))}>{t("notify")}: {t("all")}</span>
                      <span style={{ cursor: "pointer" }} onClick={() => { setNotify(new Set()); setView(new Set()); }}>{t("noneBtn")}</span>
                    </span>
                  </div>
                  <div style={{ border: "1px solid #EFEAE0", borderRadius: 12, overflow: "hidden" }}>
                    {roster.map((m) => {
                      const id = idOf(m);
                      return (
                        <div key={id} style={S.row}>
                          <div style={{ width: 8, height: 8, borderRadius: 8, background: m.color || "#C9C3B8", flex: "0 0 auto" }} />
                          <div style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.name || m.contact || "—"}
                            {m.role === "admin" && <span style={{ fontSize: 10, color: "#A8A29A", marginLeft: 6, fontWeight: 800 }}>ADMIN</span>}
                          </div>
                          <div title={t("notifyH")} onClick={() => toggle(notify, setNotify, id)} style={S.pill(notify.has(id), "#2F3AA3")}>
                            <Mail size={12} />{t("notify")}
                          </div>
                          <div title={t("viewH")} onClick={() => toggle(view, setView, id)} style={S.pill(view.has(id), "#2F8F6B")}>
                            {view.has(id) ? <Eye size={12} /> : <EyeOff size={12} />}{t("canView")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {blindSpots > 0 && (
                    <div style={{ fontSize: 11.5, color: "#8a5a10", background: "#FBF3E3", borderRadius: 9, padding: "7px 10px", marginTop: 8 }}>
                      {t("warnView")} ({blindSpots})
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", gap: 14, fontSize: 13, marginBottom: 12 }}>
                <span><b>{result.email}</b> <Mail size={12} /> · <b>{result.sms}</b> <MessageSquare size={12} /></span>
                {result.failed > 0 && <span style={{ color: "#C0392B", fontWeight: 700 }}>{result.failed} failed</span>}
              </div>
              <div style={{ border: "1px solid #EFEAE0", borderRadius: 12, overflow: "hidden" }}>
                {(status ?? []).map((s) => (
                  <div key={s.member_id} style={S.row}>
                    <div style={{ flex: 1, fontSize: 13 }}>{s.name || "—"}</div>
                    {s.last_error && <span title={s.last_error} style={{ fontSize: 11, color: "#C0392B", fontWeight: 700 }}>!</span>}
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: s.acknowledged_at ? "#2F8F6B" : "#A8A29A" }}>
                      {s.acknowledged_at ? <><Check size={12} /> {t("ack")}</> : `${t("waiting")}${s.chased ? " · " + t("chased") : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {err && <div style={{ margin: "0 20px 12px", background: "#FBE9E7", color: "#8E2A20", padding: "9px 12px", borderRadius: 9, fontSize: 12.5 }}>{err}</div>}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #EFEAE0", display: "flex", gap: 9, justifyContent: "flex-end" }}>
          {!result ? (
            <>
              <div style={S.btn} onClick={() => onClose(false)}>{t("skip")}</div>
              <div
                onClick={() => !busy && send()}
                style={{ ...S.btn, background: "#2F3AA3", borderColor: "#2F3AA3", color: "#fff", opacity: busy ? .6 : 1, display: "flex", alignItems: "center", gap: 7 }}
              >
                {busy && <Loader2 size={14} className="spin" />}{busy ? t("sending") : t("send")}
              </div>
            </>
          ) : (
            <div style={{ ...S.btn, background: "#2F3AA3", borderColor: "#2F3AA3", color: "#fff" }} onClick={() => onClose(true)}>OK</div>
          )}
        </div>
      </div>
    </div>
  );
}
