"use client";
import { useEffect, useRef, useState } from "react";

// Google Places address autocomplete. Reads NEXT_PUBLIC_GOOGLE_MAPS_KEY; if the
// key is absent it degrades to a plain text input, so the form always works.
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

export default function AddressInput({ value, onChange, onPlace, placeholder, className }: {
  value: string; onChange: (v: string) => void; onPlace?: (p: AddressParts) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Prefer the build-time key; if it's absent (env var not set at build), fetch the
  // public Maps key at runtime from the kolis-maps-key edge function so autocomplete
  // works without a Netlify env var. The key never lives in the repo/build.
  const [key, setKey] = useState(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "");
  useEffect(() => {
    if (key) return;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    if (!base) return;
    let alive = true;
    fetch(base + "/functions/v1/kolis-maps-key")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.key) setKey(d.key); })
      .catch(() => { /* stays a plain input */ });
    return () => { alive = false; };
  }, [key]);
  useEffect(() => {
    if (!key || !ref.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ac: any;
    loadMaps(key).then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (!g?.maps?.places || !ref.current) return;
      ac = new g.maps.places.Autocomplete(ref.current, {
        componentRestrictions: { country: ["ca", "us"] },
        fields: ["formatted_address", "address_components"],
        types: ["address"],
      });
      ac.addListener("place_changed", () => {
        const p = ac.getPlace();
        if (p?.formatted_address) onChange(p.formatted_address);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const comps: any[] = p?.address_components || [];
        const get = (type: string, short = false) => { const c = comps.find((x) => x.types.includes(type)); return c ? (short ? c.short_name : c.long_name) : ""; };
        if (onPlace) onPlace({
          formatted: p?.formatted_address || "",
          line1: [get("street_number"), get("route")].filter(Boolean).join(" "),
          city: get("locality") || get("sublocality") || get("administrative_area_level_2"),
          region: get("administrative_area_level_1", true),
          country: get("country", true),
          postal: get("postal_code"),
        });
      });
    }).catch(() => { /* fallback to plain input */ });
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (ac && g?.maps?.event) g.maps.event.clearInstanceListeners(ac);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <input ref={ref} className={className} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />;
}
