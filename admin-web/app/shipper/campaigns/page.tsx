"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

type Promo = { id: string; name: string };
type Campaign = { id: string; subject: string; status: string; audience: string; recipients_count: number; sent_count: number; created_at: string };

const previewHtml = (html: string) => html.replaceAll("{{first_name}}", "Amara");

function Campaigns() {
  const { active } = useOrg();
  const { t } = useLang();
  const qs = useSearchParams();

  const [promos, setPromos] = useState<Promo[]>([]);
  const [list, setList] = useState<Campaign[]>([]);
  const [promoId, setPromoId] = useState(qs.get("promo") || "");
  const [audience, setAudience] = useState("all_consented");
  const [tone, setTone] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ sent: number; failed: number; recipients: number } | null>(null);

  const loadList = () => org.campaigns(active.org_id).then(setList).catch(() => {});
  useEffect(() => {
    org.promotions(active.org_id).then(setPromos).catch(() => {});
    loadList();
    // eslint-disable-next-line
  }, [active.org_id]);
  useEffect(() => { org.campaignAudience(active.org_id, audience).then(setCount).catch(() => setCount(null)); /* eslint-disable-next-line */ }, [active.org_id, audience]);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };
  const dirty = () => { setCampaignId(null); setResult(null); }; // edits invalidate a saved draft

  const draftAI = async () => {
    setDrafting(true); setErr("");
    try {
      const res = await org.composeEmail(active.org_id, { promotion_id: promoId || null, tone: tone || undefined, audience });
      if (res.error) { setErr(res.message || res.error); }
      else { setSubject(res.subject || ""); setBody(res.html || ""); dirty(); }
    } catch (e: any) { setErr(e?.message || t("AI draft failed.", "Échec du brouillon IA.")); }
    setDrafting(false);
  };
  const saveDraft = async (): Promise<string | null> => {
    if (!subject.trim()) { setErr(t("Subject is required.", "Le sujet est requis.")); return null; }
    const c = await org.campaignSave(active.org_id, { id: campaignId, promotion_id: promoId || null, subject, body_html: body, audience });
    setCampaignId(c.id); return c.id;
  };
  const onSaveClick = async () => { setBusy(true); setErr(""); try { await saveDraft(); flash(t("Draft saved.", "Brouillon enregistré.")); loadList(); } catch (e: any) { setErr(e?.message || ""); } setBusy(false); };
  const onSend = async () => {
    if (!confirm(t(`Send to ${count ?? 0} consented client(s)?`, `Envoyer à ${count ?? 0} client(s) ayant consenti ?`))) return;
    setBusy(true); setErr("");
    try {
      const id = campaignId || (await saveDraft());
      if (!id) { setBusy(false); return; }
      const res = await org.sendCampaign(active.org_id, id);
      if (res.error) setErr(res.error);
      else { setResult({ sent: res.sent || 0, failed: res.failed || 0, recipients: res.recipients || 0 }); setCampaignId(null); loadList(); }
    } catch (e: any) { setErr(e?.message || t("Send failed.", "Échec de l’envoi.")); }
    setBusy(false);
  };

  const pill = (s: string) => s === "sent" ? "pg" : s === "sending" ? "pgold" : "pgrey";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>{t("Campaigns", "Campagnes")}</h1><div className="sub">{active.name} · {t("AI-drafted promo emails — you review, then send", "courriels promo rédigés par IA — révisez, puis envoyez")}</div></div>
      </div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", margin: "8px 0" }}>{msg}</div> : null}
      {err ? <div className="pill pred" style={{ display: "inline-block", margin: "8px 0" }}>{err}</div> : null}

      <div className="cols" style={{ gap: 16, marginTop: 8, alignItems: "flex-start" }}>
        {/* Compose */}
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}><label className="mono">{t("Promotion", "Promotion")}</label>
              <select className="input" value={promoId} onChange={(e) => { setPromoId(e.target.value); dirty(); }}>
                <option value="">{t("— none / general —", "— aucune / générale —")}</option>
                {promos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div style={{ flex: 1 }}><label className="mono">{t("Audience", "Public")}</label>
              <select className="input" value={audience} onChange={(e) => { setAudience(e.target.value); dirty(); }}>
                <option value="all_consented">{t("All opted-in clients", "Tous les clients inscrits")}</option>
                <option value="past_customers">{t("Past customers", "Anciens clients")}</option>
              </select></div>
          </div>
          <div className="row" style={{ gap: 12, marginTop: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}><label className="mono">{t("Tone (optional)", "Ton (optionnel)")}</label><input className="input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder={t("warm, playful, urgent…", "chaleureux, ludique, urgent…")} /></div>
            <button className="btn" disabled={drafting} onClick={draftAI}>{drafting ? t("Drafting…", "Rédaction…") : t("✦ Draft with AI", "✦ Rédiger avec l’IA")}</button>
          </div>
          <div style={{ marginTop: 14 }}><label className="mono">{t("Subject", "Sujet")}</label><input className="input" value={subject} onChange={(e) => { setSubject(e.target.value); dirty(); }} /></div>
          <div style={{ marginTop: 12 }}><label className="mono">{t("Body (HTML)", "Corps (HTML)")}</label>
            <textarea className="input" style={{ height: 170, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} value={body} onChange={(e) => { setBody(e.target.value); dirty(); }} /></div>
          <div className="sub" style={{ marginTop: 8 }}>{t("Recipients", "Destinataires")}: <b>{count ?? "…"}</b> {t("consented", "ayant consenti")} · {t("Kolis logo + unsubscribe added automatically", "logo Kolis + désabonnement ajoutés automatiquement")}</div>
          <div className="row" style={{ gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn ghost" disabled={busy || !subject.trim()} onClick={onSaveClick}>{t("Save draft", "Enregistrer")}</button>
            <button className="btn" disabled={busy || !subject.trim() || !body.trim() || !count} onClick={onSend}>{busy ? t("Sending…", "Envoi…") : t(`Send to ${count ?? 0}`, `Envoyer à ${count ?? 0}`)}</button>
          </div>
          {result ? <div className="pill pg" style={{ display: "inline-block", marginTop: 10 }}>{t("Sent", "Envoyé")} {result.sent}/{result.recipients}{result.failed ? ` · ${result.failed} ${t("failed", "échoués")}` : ""}</div> : null}
        </div>

        {/* Live preview */}
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <label className="mono">{t("Preview", "Aperçu")}</label>
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff", minHeight: 160 }}>
            <img src="https://kzjptcpjpwlxfofzhyku.supabase.co/storage/v1/object/public/marketing/brand/kolis-logo.png" width={40} height={40} style={{ borderRadius: 10, marginBottom: 12 }} alt="" />
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{previewHtml(subject) || t("(subject)", "(sujet)")}</div>
            <div dangerouslySetInnerHTML={{ __html: previewHtml(body) || `<p class="sub">${t("Draft with AI or write HTML to preview.", "Rédigez avec l’IA ou écrivez du HTML.")}</p>` }} />
            <p style={{ color: "#8A978F", fontSize: 12, marginTop: 16, borderTop: "1px solid #eee", paddingTop: 10 }}>{t("Sent by", "Envoyé par")} {active.name} via Kolis · {t("Unsubscribe", "Se désabonner")}</p>
          </div>
        </div>
      </div>

      {/* Past campaigns */}
      <h2 style={{ fontSize: 15, marginTop: 28 }}>{t("Sent & drafts", "Envoyées et brouillons")}</h2>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>{t("Subject", "Sujet")}</th><th>{t("Audience", "Public")}</th><th>{t("Status", "Statut")}</th><th>{t("Sent", "Envoyés")}</th><th>{t("Created", "Créée")}</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td><b>{c.subject}</b></td>
              <td className="sub" style={{ fontSize: 12 }}>{c.audience === "past_customers" ? t("Past customers", "Anciens clients") : t("All opted-in", "Tous inscrits")}</td>
              <td><span className={"pill " + pill(c.status)}>{c.status}</span></td>
              <td>{c.status === "sent" ? `${c.sent_count}/${c.recipients_count}` : "—"}</td>
              <td className="sub" style={{ fontSize: 12 }}>{c.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={5} className="sub">{t("No campaigns yet.", "Aucune campagne.")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}

export default function CampaignsPage() {
  return <Suspense fallback={null}><Campaigns /></Suspense>;
}
