"use client";
import { useEffect, useRef, useState } from "react";

// Address autocomplete with a CUSTOM dropdown built on the MODERN Places API
// (AutocompleteSuggestion.fetchAutocompleteSuggestions + Place.fetchFields).
// The legacy AutocompleteService/Autocomplete widget hangs for newer keys
// (requests never return → frozen input), so we use the supported API instead.
// Reads NEXT_PUBLIC_GOOGLE_MAPS_KEY, else fetches the public key at runtime from
// the kolis-maps-key edge fn. Degrades to a plain input if Maps can't load.
let loaderPromise: Promise<void> | null = null;
function loadMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.async = true; s.defer = true;
    s.onload = () => res(); s.onerror = () => rej(new Error("maps"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export type AddressParts = { formatted: string; line1: string; city: string; region: string; country: string; postal: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pred = { description: string; pred: any };

export default function AddressInput({ value, onChange, onPlace, placeholder, className }: {
  value: string; onChange: (v: string) => void; onPlace?: (p: AddressParts) => void; placeholder?: string; className?: string;
}) {
  const [key, setKey] = useState(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "");
  const [preds, setPreds] = useState<Pred[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [apiReady, setApiReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = useRef<any>(null);
  const box = useRef<HTMLDivElement>(null);
  const justPicked = useRef(false);

  // Runtime key fetch when no build-time key.
  useEffect(() => {
    if (key) return;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    if (!base) return;
    let alive = true;
    fetch(base + "/functions/v1/kolis-maps-key").then((r) => r.json()).then((d) => { if (alive && d?.key) setKey(d.key); }).catch(() => {});
    return () => { alive = false; };
  }, [key]);

  // Load Maps + confirm the modern Places API is available.
  useEffect(() => {
    if (!key) return;
    loadMaps(key).then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (g?.maps?.places?.AutocompleteSuggestion) { session.current = new g.maps.places.AutocompleteSessionToken(); setApiReady(true); }
    }).catch(() => {});
  }, [key]);

  // Debounced suggestions as the user types (promise-based; never hangs).
  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    if (!apiReady || !value || value.trim().length < 3) { setPreds([]); setOpen(false); return; }
    let alive = true;
    const h = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google;
        const out = await g.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, includedRegionCodes: ["ca", "us"], sessionToken: session.current });
        if (!alive) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: Pred[] = (out.suggestions || []).map((s: any) => s.placePrediction).filter(Boolean).map((pp: any) => ({ description: pp.text?.text || String(pp.text || ""), pred: pp }));
        setPreds(list); setOpen(list.length > 0); setActive(-1);
      } catch { if (alive) { setPreds([]); setOpen(false); } }
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [value, apiReady]);

  const pick = async (item: Pred) => {
    justPicked.current = true; setOpen(false); setPreds([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    try {
      const place = item.pred.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "addressComponents"] });
      const fa = place.formattedAddress || item.description;
      onChange(fa);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comps: any[] = place.addressComponents || [];
      const get = (t: string, short = false) => { const c = comps.find((x) => (x.types || []).includes(t)); return c ? (short ? (c.shortText || c.short_name || "") : (c.longText || c.long_name || "")) : ""; };
      onPlace?.({
        formatted: fa,
        line1: [get("street_number"), get("route")].filter(Boolean).join(" "),
        city: get("locality") || get("sublocality") || get("administrative_area_level_2"),
        region: get("administrative_area_level_1", true),
        country: get("country", true),
        postal: get("postal_code"),
      });
      session.current = new g.maps.places.AutocompleteSessionToken();
    } catch { onChange(item.description); }
  };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !preds.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, preds.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(preds[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={box} style={{ position: "relative" }}>
      <input className={className} value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => preds.length && setOpen(true)} onKeyDown={onKey} placeholder={placeholder} autoComplete="off" />
      {open && preds.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000, background: "#fff", border: "1px solid #E2E2EA", borderRadius: 8, marginTop: 4, boxShadow: "0 12px 30px rgba(0,0,0,.15)", overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
          {preds.map((p, i) => (
            <div key={i} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
              style={{ padding: "9px 12px", fontSize: 13.5, cursor: "pointer", background: i === active ? "#F1F0F4" : "#fff", borderBottom: i < preds.length - 1 ? "1px solid #F2F2F6" : "none", color: "#1a1722" }}>
              {p.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
