// Avatar colours for a group of people.
//
// A member's colour is only chosen when they join through an invite link, and
// only unique within that one form — so a roster ends up with people who have no
// colour at all (they fall back to the same indigo) and people who picked the
// same colour in different departments. Either way the group reads as a row of
// identical dots.
//
// So the colour is decided per RENDERED LIST: a stored colour is honoured the
// first time it appears, and everyone else gets the next free hue, picked from a
// hash of their id so it stays the same across renders and reloads.

const PALETTE = [
  "#2F3AA3", "#1F9D6B", "#E4632A", "#8A4FD0", "#C99A1E", "#D14D8B",
  "#0EA5A5", "#C0392B", "#2F5BA3", "#6B4FA3", "#178A4E", "#B4531F",
  "#7A8B1F", "#A3325F", "#35707F", "#6B4A2F",
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/**
 * Distinct colour per person, keyed by whatever you pass as `key`.
 * Falls back to repeating hues only past PALETTE.length people.
 */
export function memberColors(rows: { key: string; color?: string | null }[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  // Pass 1: honour a stored colour, but only for the first person holding it.
  for (const r of rows) {
    const c = (r.color || "").trim().toUpperCase();
    if (c && !used.has(c)) { used.add(c); out[r.key] = r.color as string; }
  }
  // Pass 2: everyone else gets the first free hue from their own hash onward.
  for (const r of rows) {
    if (out[r.key]) continue;
    const start = hash(r.key) % PALETTE.length;
    let pick = PALETTE[start];
    for (let i = 0; i < PALETTE.length; i++) {
      const c = PALETTE[(start + i) % PALETTE.length];
      if (!used.has(c.toUpperCase())) { pick = c; break; }
    }
    used.add(pick.toUpperCase());
    out[r.key] = pick;
  }
  return out;
}
