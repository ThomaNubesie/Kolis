"use client";
import { createContext, useContext, useEffect, useState } from "react";

// Lightweight bilingual layer for the admin + business web app. Strings are
// co-located at the call site: t("English", "Français"). Language is persisted
// in localStorage and defaults to the browser language. No central dictionary,
// so pages stay self-contained.
type Lang = "en" | "fr";
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (en: string, fr: string) => string };

const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (en) => en });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en"); // server + first client render = en (no hydration mismatch)

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kolis_lang") as Lang | null;
      if (saved === "en" || saved === "fr") { setLangState(saved); return; }
      if (navigator.language?.toLowerCase().startsWith("fr")) setLangState("fr");
    } catch { /* ignore */ }
  }, []);

  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("kolis_lang", l); } catch { /* ignore */ } };
  const t = (en: string, fr: string) => (lang === "fr" ? fr : en);

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

// EN | FR pill switch, drop into any header/sidebar.
export function LangToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useLang();
  return (
    <div className="row" style={{ gap: 4, ...style }}>
      {(["en", "fr"] as const).map((l) => (
        <button key={l} className={"chip" + (lang === l ? " on" : "")} style={{ padding: "4px 11px", fontSize: 12 }} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
