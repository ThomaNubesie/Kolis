"use client";
import { useState } from "react";
import { useLang } from "@/lib/i18n";

// "Book a quick call" modal for the business.kolis.ca landing. Posts to the
// public kolis-book-call edge function, which emails the request to the Concord
// sales inboxes and logs it to kolis_call_requests. Opened by ?book=1 (from the
// outreach email) or the landing's "Book a call" CTAs.
const FN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/functions/v1/kolis-book-call";

export default function BookCall({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", business: "", phone: "", email: "", preferred: "", note: "", website: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!f.name.trim() || !f.phone.trim()) { setErr(t("Name and phone are required.", "Le nom et le téléphone sont requis.")); return; }
    setState("sending");
    try {
      const r = await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
        body: JSON.stringify({ ...f, lang }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.ok) { setState("done"); return; }
      setErr(t("Couldn't send that — please call (613) 862-2639.", "Envoi impossible — appelez le (613) 862-2639.")); setState("form");
    } catch {
      setErr(t("Network error — please call (613) 862-2639.", "Erreur réseau — appelez le (613) 862-2639.")); setState("form");
    }
  }

  return (
    <div className="bc-bg" onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="bc" onClick={(e) => e.stopPropagation()}>
        <div className="bc-h">
          <div className="t">{t("Book a quick call", "Réserver un appel")}<small>{t("15 minutes · no obligation", "15 minutes · sans engagement")}</small></div>
          <div className="x" onClick={onClose}>✕</div>
        </div>
        {state === "done" ? (
          <div className="bc-ok">
            <div className="ic">✓</div>
            <h3>{t("Request received!", "Demande reçue !")}</h3>
            <p>{t("Thanks — we'll call you within one business day.", "Merci — nous vous rappelons en un jour ouvrable.")}</p>
            <button className="bc-sb" onClick={onClose}>{t("Close", "Fermer")}</button>
          </div>
        ) : (
          <form className="bc-b" onSubmit={submit}>
            <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
            <div className="rw">
              <div className="fld"><label>{t("Name", "Nom")} <span>*</span></label><input value={f.name} onChange={set("name")} placeholder={t("Your name", "Votre nom")} /></div>
              <div className="fld"><label>{t("Business", "Entreprise")}</label><input value={f.business} onChange={set("business")} placeholder={t("Business name", "Nom de l'entreprise")} /></div>
            </div>
            <div className="rw">
              <div className="fld"><label>{t("Phone", "Téléphone")} <span>*</span></label><input value={f.phone} onChange={set("phone")} placeholder="(613) 000-0000" /></div>
              <div className="fld"><label>Email</label><input value={f.email} onChange={set("email")} placeholder="you@business.ca" /></div>
            </div>
            <div className="fld"><label>{t("Best time to reach you", "Meilleur moment pour vous joindre")}</label>
              <select value={f.preferred} onChange={set("preferred")}>
                <option value="">{t("Choose…", "Choisir…")}</option>
                <option value="morning">{t("Morning", "Matin")}</option>
                <option value="afternoon">{t("Afternoon", "Après-midi")}</option>
                <option value="evening">{t("Evening", "Soir")}</option>
              </select></div>
            <div className="fld"><label>{t("Anything we should know?", "Un mot pour nous ?")}</label><textarea value={f.note} onChange={set("note")} placeholder={t("Optional", "Facultatif")} /></div>
            {err && <div className="err">{err}</div>}
            <button className="bc-sb" disabled={state === "sending"}>{state === "sending" ? t("Sending…", "Envoi…") : t("📞 Request my call", "📞 Demander mon appel")}</button>
            <div className="fine">{t("We'll call you back within one business day.", "Nous vous rappelons en un jour ouvrable.")}</div>
          </form>
        )}
      </div>
    </div>
  );
}

const CSS = `
.bc-bg{position:fixed;inset:0;background:rgba(26,23,34,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:18px}
.bc{width:420px;max-width:100%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(156,16,72,.35);font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1722}
.bc-h{background:#E11D6B;color:#fff;padding:15px 20px;display:flex;align-items:center;justify-content:space-between}
.bc-h .t{font-weight:800;font-size:16px}.bc-h .t small{display:block;font-weight:600;font-size:11px;color:#ffd0e4;margin-top:2px}
.bc-h .x{cursor:pointer;opacity:.85;font-size:17px}
.bc-b{padding:16px 20px 20px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.rw{display:flex;gap:10px}.rw .fld{flex:1}
.fld{margin-bottom:11px}
.bc label{display:block;font-size:11.5px;font-weight:700;color:#6B6675;margin-bottom:5px}
.bc label span{color:#E11D6B}
.bc input,.bc textarea,.bc select{width:100%;border:1.5px solid #ECECF2;border-radius:10px;padding:10px 12px;font-size:13.5px;color:#1a1722;background:#fff;font-family:inherit}
.bc input:focus,.bc textarea:focus,.bc select:focus{outline:none;border-color:#E11D6B}
.bc textarea{resize:none;height:54px}
.bc-sb{width:100%;background:#E11D6B;color:#fff;font-weight:800;font-size:15px;padding:13px;border-radius:12px;border:none;margin-top:4px;cursor:pointer}
.bc-sb:disabled{opacity:.6;cursor:default}
.err{background:#fdecf3;color:#9c1048;border:1px solid #f3cfe0;border-radius:9px;padding:8px 11px;font-size:12.5px;margin-bottom:10px}
.fine{font-size:11px;color:#9b97a6;text-align:center;margin-top:10px;line-height:1.5}
.bc-ok{padding:34px 24px;text-align:center}
.bc-ok .ic{width:60px;height:60px;border-radius:50%;background:#eafaf5;border:2px solid #178a5e;color:#178a5e;font-size:30px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.bc-ok h3{font-size:20px;margin:0 0 8px}.bc-ok p{color:#6B6675;font-size:14px;line-height:1.55;max-width:280px;margin:0 auto 18px}
`;
