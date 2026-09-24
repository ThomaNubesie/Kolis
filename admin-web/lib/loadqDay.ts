// Which day it is for LoadQ, in Toronto — the one place that decides.
//
// Everything the day drives (the flyer's palette, the board's surround, the TikTok pack's
// colour and its question card) counts days from 2026-01-01. Counting them from the UTC
// timestamp looks right all day and then flips at 20:00 ET, when UTC rolls over: the evening
// board post of 23 Sept went out in the next day's charcoal, which reads as the old dark design
// coming back. A day must end when it ends here, not five hours early.
export function torontoDayIndex(d: Date = new Date()): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const [y, m, day] = ymd.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, day) - Date.UTC(2026, 0, 1)) / 86400000);
}

// The day's entry in any list that rotates daily (e.g. the six question cards).
export function pickOfDay<T>(list: T[], d: Date = new Date()): T {
  const i = torontoDayIndex(d);
  return list[((i % list.length) + list.length) % list.length];
}

// Which palette a day wears — set by the owner, not by a cycle: Friday and Wednesday are
// orange, Monday and Saturday blue, Sunday and Tuesday cream, Thursday charcoal. Index into
// [orange, azure, charcoal, cream], the order every renderer holds them in.
//                       Sun Mon Tue Wed Thu Fri Sat
const PALETTE_BY_WEEKDAY = [3, 1, 3, 0, 2, 0, 1];

export function paletteIndexFor(d: Date = new Date()): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short" })
    .format(d).slice(0, 3).toLowerCase();
  const i = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(day);
  return PALETTE_BY_WEEKDAY[i < 0 ? 0 : i];
}
