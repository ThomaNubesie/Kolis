"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

// "Book a 15-minute call" — an in-page band on quorly.ca, not a modal.
//
// The outreach email's "Réserver 15 min / Book a call" button links to ?book=1, and
// until now nothing handled it: the most interested reader we get landed on the
// marketing homepage with nothing to do. BoardsHome renders this at #book and
// scrolls to it on that parameter, so the click always arrives somewhere.
//
// Inline rather than a dialog on purpose: there is nothing to dismiss, a mis-click
// costs nothing, and the page's own words still frame the ask.
//
// Posts to the public quorly-book-call edge function, which records the request and
// emails it — and, when the address matches someone we cold-emailed, marks that
// prospect engaged and stops the cadence.
//
// Every class is namespaced `qc-*`: this renders inside the shared Kolis app
// document, whose globals.css defines generic .row/.card/.btn that would leak in.
const FN = (process.env.NEXT_PUBLIC_QUORLY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/functions/v1/quorly-book-call";
const ANON = process.env.NEXT_PUBLIC_QUORLY_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const DOTS = ["#2F3AA3", "#1F9D6B", "#E4632A", "#C99A1E"];

export default function BookCallQuorly() {
  const { t, lang } = useLang();
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", organization: "", role: "", email: "", phone: "", preferred: "", note: "", website: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const nameRef = useRef<HTMLInputElement>(null);

  // Arriving from the outreach email lands on the form itself, not the top of the page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("book") !== "1") return;
    const el = document.getElementById("book");
    if (!el) return;
    setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "center" }); nameRef.current?.focus({ preventScroll: true }); }, 250);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!f.name.trim()) { setErr(t("Your name is required.", "Votre nom est requis.")); return; }
    if (!f.phone.trim()) { setErr(t("A phone number is required — that's how we'll call you.", "Un numéro de téléphone est requis — c'est ainsi que nous vous appellerons.")); return; }
    setState("sending");
    try {
      const r = await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON },
        body: JSON.stringify({ ...f, lang }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.ok) { setState("done"); return; }
      setErr(t("Couldn't send that — please write to shaloderick@concordexpress.ca.", "Envoi impossible — écrivez à shaloderick@concordexpress.ca.")); setState("form");
    } catch {
      setErr(t("Network error — please write to shaloderick@concordexpress.ca.", "Erreur réseau — écrivez à shaloderick@concordexpress.ca.")); setState("form");
    }
  }

  return (
    <section className="qc-band" id="book">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="qc-wrap">
        <div className="qc-say">
          <div className="qc-dots">{DOTS.map((c) => <span key={c} style={{ background: c }} />)}</div>
          <h2>{t("Let's talk for 15 minutes.", "Parlons 15 minutes.")}</h2>
          <p>{t("We'll show you how your board would use it — no obligation, in English or French. We call you back within one business day.",
                "Nous vous montrons comment votre conseil l'utiliserait — sans engagement, en français ou en anglais. Nous vous rappelons en un jour ouvrable.")}</p>
        </div>

        <div className="qc-card">
          {state === "done" ? (
            <div className="qc-ok">
              <div className="ic">✓</div>
              <h3>{t("Request received!", "Demande reçue !")}</h3>
              <p>{t("Thank you — we'll call you within one business day to set a time.", "Merci — nous vous appelons en un jour ouvrable pour fixer un moment.")}</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <input className="qc-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
              <div className="qc-rw">
                <div className="qc-fld"><label>{t("Name", "Nom")}<span> *</span></label>
                  <input ref={nameRef} value={f.name} onChange={set("name")} placeholder={t("Your name", "Votre nom")} /></div>
                <div className="qc-fld"><label>{t("Organization", "Organisation")}</label>
                  <input value={f.organization} onChange={set("organization")} placeholder={t("Board, association, syndicate…", "Conseil, association, syndicat…")} /></div>
              </div>
              <div className="qc-rw">
                <div className="qc-fld"><label>{t("Phone", "Téléphone")}<span> *</span></label>
                  <input value={f.phone} onChange={set("phone")} placeholder="(613) 000-0000" inputMode="tel" /></div>
                <div className="qc-fld"><label>Email</label>
                  <input value={f.email} onChange={set("email")} placeholder="vous@organisation.ca" inputMode="email" /></div>
              </div>
              <div className="qc-rw">
                <div className="qc-fld"><label>{t("Your role", "Votre fonction")}</label>
                  <input value={f.role} onChange={set("role")} placeholder={t("President, secretary, treasurer…", "Président, secrétaire, trésorier…")} /></div>
                <div className="qc-fld"><label>{t("Best time to call", "Meilleur moment pour appeler")}</label>
                  <select value={f.preferred} onChange={set("preferred")}>
                    <option value="">{t("Choose…", "Choisir…")}</option>
                    <option value="morning">{t("Morning", "Matin")}</option>
                    <option value="afternoon">{t("Afternoon", "Après-midi")}</option>
                    <option value="evening">{t("Evening", "Soir")}</option>
                  </select></div>
              </div>
              <div className="qc-fld"><label>{t("Anything we should know?", "Un mot pour nous ?")}</label>
                <textarea value={f.note} onChange={set("note")} placeholder={t("Optional", "Facultatif")} /></div>
              {err && <div className="qc-err">{err}</div>}
              <button className="qc-sb" disabled={state === "sending"}>
                {state === "sending" ? t("Sending…", "Envoi…") : t("Request my call", "Demander mon appel")}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

const CSS = `
.qc-band{background:#FBF8F2;border-top:1px solid #E3DCCB;border-bottom:1px solid #E3DCCB;padding:44px 20px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#14131A}
.qc-wrap{max-width:1000px;margin:0 auto;display:flex;gap:34px;align-items:flex-start;flex-wrap:wrap}
.qc-say{flex:1 1 300px;min-width:280px;padding-top:4px}
.qc-dots{display:flex;gap:5px;margin-bottom:12px}
.qc-dots span{width:8px;height:8px;border-radius:50%;display:block}
.qc-say h2{margin:0 0 9px;font-size:26px;letter-spacing:-.6px;line-height:1.2}
.qc-say p{margin:0;font-size:14px;color:#6B6675;line-height:1.65;max-width:32em}
.qc-card{flex:1 1 420px;min-width:300px;background:#fff;border:1px solid #ECE9E2;border-radius:16px;padding:20px}
.qc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.qc-rw{display:flex;gap:11px;flex-wrap:wrap}
.qc-fld{flex:1 1 180px;margin-bottom:11px}
.qc-card label{display:block;font-size:11.5px;font-weight:700;color:#6B6675;margin-bottom:5px}
.qc-card label span{color:#2F3AA3}
.qc-card input,.qc-card textarea,.qc-card select{width:100%;border:1.5px solid #ECE9E2;border-radius:10px;padding:10px 12px;font-size:13.5px;color:#14131A;background:#fff;font-family:inherit}
.qc-card input:focus,.qc-card textarea:focus,.qc-card select:focus{outline:none;border-color:#2F3AA3}
.qc-card textarea{resize:none;height:56px}
.qc-sb{width:100%;background:#2F3AA3;color:#fff;font-weight:800;font-size:15px;padding:13px;border-radius:12px;border:none;margin-top:4px;cursor:pointer}
.qc-sb:disabled{opacity:.6;cursor:default}
.qc-err{background:#F4F1FB;color:#2b2570;border:1px solid #D9D3F5;border-radius:9px;padding:9px 12px;font-size:12.5px;margin-bottom:10px}
.qc-ok{padding:22px 6px;text-align:center}
.qc-ok .ic{width:56px;height:56px;border-radius:50%;background:#EAF7F0;border:2px solid #1F9D6B;color:#1F9D6B;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.qc-ok h3{font-size:19px;margin:0 0 7px}
.qc-ok p{color:#6B6675;font-size:14px;line-height:1.55;max-width:320px;margin:0 auto}
@media(max-width:720px){.qc-band{padding:32px 16px}.qc-say h2{font-size:22px}}
`;
