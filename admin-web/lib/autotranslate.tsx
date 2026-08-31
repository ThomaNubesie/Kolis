"use client";
// Quorly — showing a board in the reader's language, whatever it was written in.
//
// The UI's own words are bilingual at the source (the L(en, fr) pairs). What was not
// covered is everything the members WROTE: entries, comments, concerns, announcements,
// the names a group gave its departments. Pick French and half the screen stayed
// English. This translates that half on the fly.
//
// Three rules keep it cheap:
//   1. A sentence is translated ONCE for everyone — the result goes to cf_tr_cache,
//      keyed by a hash of the source, so the second reader pays nothing.
//   2. Everything a screen needs is asked for in ONE call, not one call per sentence:
//      strings queue for a tick, then go up as a batch.
//   3. Until a translation arrives the source is shown, never a spinner or a blank —
//      a board that reads slightly late is better than one that flickers.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cf } from "@/lib/cf";

// FNV-1a. Short, stable, and the key only ever has to agree with itself.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Not worth a round trip: blank, a number, a date, a handful of punctuation or emoji.
const translatable = (s: string) => {
  const t = (s || "").trim();
  if (t.length < 2 || t.length > 4000) return false;
  if (!/\p{L}/u.test(t)) return false;              // no letters at all
  if (/^\d[\d\s.,:/-]*$/.test(t)) return false;     // 12 · 2026-08-30 · 3,50
  return true;
};

type Ctx = { at: (s: string | null | undefined) => string; ready: boolean; lang: "en" | "fr" };
const AutoTrCtx = createContext<Ctx>({ at: (s) => s ?? "", ready: true, lang: "en" });

export function AutoTranslateProvider({ lang, enabled = true, children }: { lang: "en" | "fr"; enabled?: boolean; children: any }) {
  const [, force] = useState(0);
  const cache = useRef<Map<string, string>>(new Map());   // `${lang}:${hash}` -> translation
  const pending = useRef<Map<string, string>>(new Map()); // hash -> source, waiting to go up
  const asked = useRef<Set<string>>(new Set());           // never ask twice, even on failure
  const timer = useRef<any>(null);

  // Survive a reload: the same board re-read tomorrow costs nothing.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("quorly.tr." + lang);
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) cache.current.set(lang + ":" + k, v);
    } catch { /* a corrupt cache is not worth a crash */ }
    force((n) => n + 1);
  }, [lang]);

  const persist = useCallback(() => {
    try {
      const out: Record<string, string> = {};
      for (const [k, v] of cache.current) if (k.startsWith(lang + ":")) out[k.slice(lang.length + 1)] = v;
      localStorage.setItem("quorly.tr." + lang, JSON.stringify(out));
    } catch { /* quota — the in-memory cache still holds for this session */ }
  }, [lang]);

  const flush = useCallback(async () => {
    const batch = Array.from(pending.current.entries()).slice(0, 60);
    if (batch.length === 0) return;
    for (const [h] of batch) pending.current.delete(h);

    const hashes = batch.map(([h]) => h);
    let got: Record<string, string> = {};
    try { got = (await cf.trGet(hashes, lang)) || {}; } catch { got = {}; }
    for (const [h, v] of Object.entries(got)) cache.current.set(lang + ":" + h, v);

    const missing = batch.filter(([h]) => !cache.current.has(lang + ":" + h));
    if (missing.length > 0) {
      try {
        const items = missing.map(([h, src]) => ({ k: h, text: src }));
        const res = await cf.translateBatch(items, lang === "fr" ? "French" : "English");
        const store: { h: string; src: string; out: string }[] = [];
        for (const it of res?.items ?? []) {
          const src = missing.find(([h]) => h === it.k)?.[1] ?? "";
          if (!it.text) continue;
          cache.current.set(lang + ":" + it.k, it.text);
          if (it.text !== src) store.push({ h: it.k, src, out: it.text });
        }
        if (store.length) cf.trPut(store, lang).catch(() => {});
      } catch { /* leave them untranslated; the source is already on screen */ }
    }
    persist();
    force((n) => n + 1);
    if (pending.current.size > 0) flush();
  }, [lang, persist]);

  const at = useCallback((s: string | null | undefined): string => {
    const src = s ?? "";
    if (!enabled || !translatable(src)) return src;
    const h = hash(src);
    const hit = cache.current.get(lang + ":" + h);
    if (hit) return hit;
    if (!asked.current.has(lang + ":" + h)) {
      asked.current.add(lang + ":" + h);
      pending.current.set(h, src);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), 250);
    }
    return src; // show the original until its translation lands
  }, [enabled, lang, flush]);

  const value = useMemo(() => ({ at, ready: true, lang }), [at, lang]);
  return <AutoTrCtx.Provider value={value}>{children}</AutoTrCtx.Provider>;
}

/** at(text) — the text in the reader's language, or the original until it arrives. */
export const useAutoT = () => useContext(AutoTrCtx).at;

/**
 * A department's name in the reader's language.
 *
 * Town Hall is the one department Quorly creates itself, so its name is ours to
 * translate properly — a machine would render it "Hôtel de ville", which is a
 * building, not the assembly of the members. Any name a GROUP chose is still
 * machine-translated; the override only applies while the hall carries the exact
 * name we gave it, so a group that renames its hall keeps its own words.
 */
export function useDeptLabel() {
  const { at, lang } = useContext(AutoTrCtx);
  return (d: { kind?: string | null; name?: string | null } | null | undefined) => {
    const nm = d?.name ?? "";
    // "Parliament" is the name we give it; a machine would render the French as
    // "Hôtel de ville" (a building) rather than the chamber of the members. The older
    // "Town Hall" is still matched so a hall created before the rename still reads right.
    if (d?.kind === "townhall" && (nm === "Parliament" || nm === "Town Hall")) return lang === "fr" ? "Parlement" : "Parliament";
    return at(nm);
  };
}
