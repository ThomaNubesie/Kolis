// The Quorly letterhead — the canonical shape for every email Quorly sends.
//
// Approved 2026-09-04 from the meeting invitation. Import this rather than pasting a
// new layout: a member should recognise a Quorly email before reading a word of it,
// and that only holds if there is one design instead of one per function.
//
//   import { quorlyEmail, quorlyIcs } from "../_shared/quorly-email.ts";
//   const html = quorlyEmail({ eyebrow: org, headline: "…", ... });
//
// WHY TABLES: Outlook's renderer is Word. Flexbox, grid, and CSS gradients silently
// collapse there, so the whole letterhead is nested tables with inline styles and
// bgcolor attributes. Do not "modernise" this markup — it is deliberate.
//
// WHY BOTH LANGUAGES IN ONE EMAIL: the roster is mixed and we do not always know a
// member's language. French leads because most of the association reads French; the
// English block sits below a divider so neither group has to hunt.

export const QUORLY_DOTS = ["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"];
export const QUORLY_INDIGO = "#2F3AA3";
// loadq.ca is the Resend-VERIFIED sending domain. quorly.ca is NOT verified and
// returns 403 — do not switch this until Resend says otherwise.
export const QUORLY_FROM = "Quorly <noreply@loadq.ca>";
export const QUORLY_SITE = "https://quorly.ca";
export const QUORLY_MMS_BANNER = "https://quorly.ca/mms-logo";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type QuorlyEmail = {
  eyebrow?: string;        // small uppercase line above the headline — usually the org
  headline: string;        // the French headline; the point of the message
  bodyFr?: string;         // French body, HTML allowed
  /** The bordered callout: the fact the reader came for (a time, a title, an amount). */
  highlight?: { title: string; sub?: string };
  cta?: { label: string; href: string };
  /** Small print under the CTA — what the button does, what is attached. */
  footnoteFr?: string;
  english?: string;        // the English block below the divider, HTML allowed
  footer?: string;         // grey strip: raw link, why-you-got-this, opt-out
};

export function quorlyEmail(o: QuorlyEmail): string {
  const dots = QUORLY_DOTS
    .map((c) => `<td width="10"><div style="width:9px;height:9px;border-radius:50%;background:${c};font-size:0;line-height:0">&nbsp;</div></td>`)
    .join('<td width="5">&nbsp;</td>');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:22px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">

  <tr><td bgcolor="${QUORLY_INDIGO}" style="background:${QUORLY_INDIGO};padding:18px 26px">
    <table role="presentation" width="100%"><tr>
      <td style="color:#ffffff;font-size:19px;font-weight:900;letter-spacing:-.3px">Quorly</td>
      <td align="right"><table role="presentation"><tr>${dots}</tr></table></td>
    </tr></table></td></tr>

  <tr><td style="font-size:0;line-height:0"><table role="presentation" width="100%"><tr>
    ${QUORLY_DOTS.map((c) => `<td bgcolor="${c}" height="4"></td>`).join("")}
  </tr></table></td></tr>

  <tr><td style="padding:26px 30px 8px">
    ${o.eyebrow ? `<p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">${esc(o.eyebrow)}</p>` : ""}
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:#14131A">${esc(o.headline)}</h1>
    ${o.bodyFr ? `<div style="margin:0 0 14px;font-size:14.5px;line-height:1.62;color:#1C1B19">${o.bodyFr}</div>` : ""}
    ${o.highlight ? `<table role="presentation" width="100%" style="margin:0 0 16px"><tr>
      <td width="4" bgcolor="${QUORLY_INDIGO}"></td>
      <td style="padding:6px 0 6px 14px">
        <div style="font-size:17px;font-weight:900;color:#14131A">${esc(o.highlight.title)}</div>
        ${o.highlight.sub ? `<div style="font-size:13.5px;color:${QUORLY_INDIGO};font-weight:700;margin-top:3px">${esc(o.highlight.sub)}</div>` : ""}
      </td></tr></table>` : ""}
    ${o.cta ? `<p style="margin:0 0 18px"><a href="${o.cta.href}" style="display:inline-block;background:${QUORLY_INDIGO};color:#ffffff;text-decoration:none;font-weight:800;font-size:14.5px;padding:13px 22px;border-radius:10px">${esc(o.cta.label)}</a></p>` : ""}
    ${o.footnoteFr ? `<div style="margin:0 0 8px;font-size:12.5px;color:#6B6675;line-height:1.6">${o.footnoteFr}</div>` : ""}
  </td></tr>

  ${o.english ? `<tr><td style="padding:0 30px"><div style="border-top:1px solid #EAE4DA"></div></td></tr>
  <tr><td style="padding:14px 30px 24px">
    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">In English</p>
    <div style="font-size:13.5px;line-height:1.6;color:#4a4750">${o.english}</div>
  </td></tr>` : ""}

  ${o.footer ? `<tr><td bgcolor="#FBF8F2" style="background:#FBF8F2;padding:13px 30px">
    <div style="color:#98A0AE;font-size:11px;line-height:1.6">${o.footer}</div>
  </td></tr>` : ""}

</table></td></tr></table>`;
}

// ---- Calendar invitation ---------------------------------------------------------
//
// An .ics attachment reaches Apple Calendar, Google Calendar and Outlook without OAuth
// or a connected account, because every mail client understands text/calendar. It also
// carries its own alarm, so the reader is reminded even if our email and MMS go astray.
//
// UID must be the row's own id: re-sending then UPDATES the entry instead of making a
// second one. SEQUENCE must CLIMB on every change — a client ignores an update that
// does not outrank the copy it already holds, so a cancellation left at 0 looks like
// it worked and changes nothing.
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s: unknown) =>
  String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545 caps a line at 75 octets; longer ones continue with a leading space.
const fold = (line: string) => line.length <= 73 ? line
  : line.match(/.{1,73}/g)!.map((c, i) => (i ? " " : "") + c).join("\r\n");

export function quorlyIcs(o: {
  id: string; title: string; startsAt: string; mins: number;
  link: string; description?: string | null; cancelled?: boolean; sequence?: number;
}): string {
  const start = new Date(o.startsAt);
  const end = new Date(start.getTime() + o.mins * 60_000);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Quorly//Meetings//EN", "CALSCALE:GREGORIAN",
    `METHOD:${o.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${o.id}@quorly.ca`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEsc(o.title)}`,
    `DESCRIPTION:${icsEsc(o.description ?? o.link)}`,
    `LOCATION:${icsEsc(o.link)}`,
    `URL:${icsEsc(o.link)}`,
    "ORGANIZER;CN=Quorly:mailto:noreply@loadq.ca",
    `STATUS:${o.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `SEQUENCE:${o.sequence ?? 0}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(o.title)}`, "TRIGGER:-PT1H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].map(fold).join("\r\n");
}

/** btoa is byte-wise, so accented text must be encoded before it is base64'd. */
export function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/** Resend attachment for the invitation. */
export const icsAttachment = (ics: string) => ({ filename: "invite.ics", content: b64(ics) });
