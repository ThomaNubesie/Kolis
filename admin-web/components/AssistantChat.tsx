"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import { Send, Check, X, Loader2 } from "lucide-react";

type Proposal = { id: string; name: string; input: any };
type Msg = { role: "user" | "assistant"; content: string; proposals?: Proposal[]; done?: Record<string, string> };

const SUGGEST: [string, string][] = [
  ["How many shipments did I send in the last 30 days?", "Combien d'envois ai-je faits dans les 30 derniers jours ?"],
  ["Which invoices are outstanding?", "Quelles factures sont impayées ?"],
  ["Quote a small parcel from Ottawa to Montréal, door drop-off.", "Cotez un petit colis d'Ottawa à Montréal, livraison à domicile."],
  ["Create a shipment to a client and draft the recipient an email.", "Créez un envoi pour un client et rédigez un courriel au destinataire."],
];
const ACTION_LABEL: Record<string, [string, string]> = {
  create_shipment: ["Create shipment", "Créer un envoi"],
  edit_shipment: ["Edit shipment", "Modifier l'envoi"],
  charge_shipment: ["Charge shipment", "Débiter l'envoi"],
  email_label: ["Email the label", "Envoyer l'étiquette"],
  send_email: ["Send email", "Envoyer un courriel"],
  create_campaign: ["Create campaign", "Créer une campagne"],
  send_campaign: ["Send campaign", "Envoyer la campagne"],
  set_prospect_stage: ["Move prospect stage", "Changer l'étape du prospect"],
  reopen_prospect: ["Reopen prospect", "Rouvrir le prospect"],
  draft_prospect_followup: ["Draft prospect follow-up", "Rédiger une relance"],
};

function okSummary(name: string, res: any, fr: boolean): string {
  const r = res.result ?? res;
  if (name === "create_shipment") { const code = r?.code || r?.parcel_code || (typeof r === "string" ? r : ""); return (fr ? "✓ Envoi créé" : "✓ Shipment created") + (code ? " · " + code : ""); }
  if (name === "edit_shipment") return fr ? "✓ Envoi mis à jour" : "✓ Shipment updated";
  if (name === "charge_shipment") { const c = r?.charged_cents ?? r?.total_cents; return (fr ? "✓ Débité" : "✓ Charged") + (c ? " · $" + (c / 100).toFixed(2) : ""); }
  if (name === "email_label") return fr ? "✓ Étiquette envoyée" : "✓ Label emailed";
  if (name === "send_email") return fr ? "✓ Courriel envoyé" : "✓ Email sent";
  if (name === "create_campaign") return fr ? "✓ Campagne créée (brouillon)" : "✓ Campaign draft created";
  if (name === "send_campaign") return fr ? "✓ Campagne envoyée" : "✓ Campaign sent";
  if (name === "set_prospect_stage") return fr ? "✓ Étape mise à jour" : "✓ Stage updated";
  if (name === "reopen_prospect") return fr ? "✓ Prospect rouvert" : "✓ Prospect reopened";
  if (name === "draft_prospect_followup") return fr ? "✓ Brouillon envoyé pour approbation" : "✓ Draft sent for approval";
  return fr ? "✓ Fait" : "✓ Done";
}

export default function AssistantChat({ variant = "page" }: { variant?: "page" | "panel" }) {
  const { active } = useOrg();
  const { t, lang } = useLang();
  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setErr(""); setInput("");
    const next = [...chat, { role: "user" as const, content: q }];
    setChat(next); setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("kolis-assistant", {
        body: { org_id: active.org_id, messages: next.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setChat((c) => [...c, { role: "assistant", content: data.reply || "…", proposals: (data.proposals || []) as Proposal[], done: {} }]);
    } catch (e: any) { setErr(e?.message || "Error"); }
    finally { setBusy(false); }
  };

  const confirm = async (mi: number, p: Proposal) => {
    setConfirming(p.id); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("kolis-assistant", {
        body: { org_id: active.org_id, confirm: { name: p.name, input: p.input } },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const res = data.result || {};
      const summary = res.error ? `⚠︎ ${res.error}` : okSummary(p.name, res, lang === "fr");
      setChat((c) => c.map((m, i) => i === mi ? { ...m, done: { ...(m.done || {}), [p.id]: summary } } : m));
    } catch (e: any) { setErr(e?.message || "Error"); }
    finally { setConfirming(null); }
  };
  const dismiss = (mi: number, p: Proposal) =>
    setChat((c) => c.map((m, i) => i === mi ? { ...m, done: { ...(m.done || {}), [p.id]: t("Dismissed", "Ignoré") } } : m));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: variant === "page" ? "calc(100vh - 150px)" : "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 2px", display: "flex", flexDirection: "column", gap: 12 }}>
        {chat.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {SUGGEST.map(([en, fr], i) => (
              <button key={i} onClick={() => send(lang === "fr" ? fr : en)} style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--border,#e7e2d6)", borderRadius: 12, padding: "11px 13px", background: "#fff", fontSize: 13.5, color: "#3a3744" }}>
                💬 {lang === "fr" ? fr : en}
              </button>
            ))}
          </div>
        )}
        {chat.map((m, mi) => (
          <div key={mi} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
            <div style={{ padding: "10px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap",
              background: m.role === "user" ? "var(--accent,#E11D6B)" : "#fff",
              color: m.role === "user" ? "#fff" : "#242028",
              border: m.role === "user" ? "none" : "1px solid var(--border,#ECECF2)" }}>
              {m.content}
            </div>
            {(m.proposals || []).map((p) => {
              const label = (ACTION_LABEL[p.name] || [p.name, p.name])[lang === "fr" ? 1 : 0];
              const done = m.done?.[p.id];
              return (
                <div key={p.id} style={{ marginTop: 8, background: "#FBF3F7", border: "1px solid #F3D6E4", borderRadius: 12, padding: "11px 13px" }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: "#B21561", marginBottom: 6 }}>⚑ {t("Proposed action", "Action proposée")}: {label}</div>
                  <div style={{ fontSize: 12, color: "#6b1440", lineHeight: 1.6 }}>
                    {Object.entries(p.input || {}).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}><b>{k}:</b> {String(v).slice(0, 160)}</div>
                    ))}
                  </div>
                  {done ? (
                    <div style={{ marginTop: 9, fontWeight: 700, fontSize: 12.5, color: done.startsWith("⚠") ? "#b91c1c" : "#178a5e" }}>{done}</div>
                  ) : (
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <button onClick={() => confirm(mi, p)} disabled={confirming === p.id}
                        style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {confirming === p.id ? <Loader2 size={14} className="spin" /> : <Check size={15} />}{t("Confirm & run", "Confirmer et exécuter")}
                      </button>
                      <button onClick={() => dismiss(mi, p)} style={{ background: "none", border: "1px solid #e2ddd0", borderRadius: 9, padding: "8px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", color: "#6B6675", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <X size={15} />{t("Dismiss", "Ignorer")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {busy && <div style={{ alignSelf: "flex-start", color: "#9b97a6", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><Loader2 size={15} className="spin" />{t("Thinking…", "Réflexion…")}</div>}
        {err && <div className="warn">{err}</div>}
        <div ref={endRef} />
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "flex-end" }}>
        <textarea className="input" value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={t("Message the assistant…", "Écrire à l'assistant…")} style={{ resize: "none", flex: 1, marginBottom: 0 }} />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Send size={16} />{t("Send", "Envoyer")}
        </button>
      </div>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
