"use client";
import { useEffect, useState } from "react";
import { quorly } from "@/lib/quorly";

// The Canadian-landmark backdrop behind the Quorly sign-in screen.
//
// The photo is not hard-coded: it comes from quorly_login_backdrops and changes every
// two hours. The slot is computed from the SERVER's clock inside quorly_login_backdrop(),
// so every visitor in a given two-hour window sees the same landmark no matter how wrong
// their own device clock is — and so a landmark can be added, reordered or retired by
// editing a row, with no deploy.
//
// Returns null until the image has actually decoded. The caller keeps its solid
// background until then, so the card never sits on a half-painted photo, and a failed
// or slow fetch simply leaves the old plain background in place.
export type Backdrop = { url: string; label_en: string; label_fr: string };

export function useLoginBackdrop(): Backdrop | null {
  const [bd, setBd] = useState<Backdrop | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await quorly.rpc("quorly_login_backdrop");
        const row = (Array.isArray(data) ? data[0] : null) as Backdrop | null;
        if (error || !row?.url || !alive) return;
        const img = new window.Image();
        img.onload = () => { if (alive) setBd(row); };
        img.src = row.url;                       // decode first, then reveal
      } catch { /* no backdrop is a fine outcome — the plain background stands in */ }
    })();
    return () => { alive = false; };
  }, []);

  return bd;
}
