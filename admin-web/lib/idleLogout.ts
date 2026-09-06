"use client";
import { useEffect } from "react";
import { quorly as supabase } from "@/lib/quorly";

// Sign out after a period of inactivity.
//
// A Quorly session is a person's membership of a board: their votes, the minutes,
// the document room. Supabase keeps a session alive indefinitely by refreshing it,
// which is right for a consumer app and wrong for one opened on a shared phone in a
// depot or left on a screen in a meeting room.
//
// TIMESTAMP, NOT A TIMER. A setInterval only runs while the tab is alive, so a laptop
// closed at midnight and reopened at noon would look "active" the moment it woke.
// The last activity is written to localStorage, so the elapsed time survives a closed
// tab, a sleeping machine, and a browser restart — the check on mount is the one that
// matters most.
const KEY = "quorly-last-active";
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "visibilitychange"] as const;

export function useIdleLogout(hours = 3) {
  useEffect(() => {
    const limit = hours * 3600_000;
    const now = () => Date.now();
    let last = Number(localStorage.getItem(KEY) || 0);

    const signOut = async () => {
      localStorage.removeItem(KEY);
      // Local scope: end the session in THIS browser, not every device the member owns.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      // A hard reload rather than a state change, so nothing stale is left rendered.
      window.location.reload();
    };

    // The decisive check: how long since the last touch, however the gap happened.
    const expired = () => last > 0 && now() - last > limit;
    if (expired()) { void signOut(); return; }

    // Writing on every scroll event would hammer localStorage; once every 30s is
    // plenty when the window being measured is three hours.
    const touch = () => {
      if (document.visibilityState === "hidden") return;
      const t = now();
      if (t - last > 30_000) { last = t; localStorage.setItem(KEY, String(t)); }
    };
    touch();

    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    // Catches the case where the tab stayed open and untouched the whole time.
    const tick = setInterval(() => { if (expired()) void signOut(); }, 60_000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(tick);
    };
  }, [hours]);
}
