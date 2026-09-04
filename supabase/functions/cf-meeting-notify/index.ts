// cf-meeting-notify — tell people about a meeting or a booking, by email and MMS.
//
// POST { kind: "meeting" | "booking", id, reminder?: true, cancelled?: true }
//   meeting  → everyone active in the department, minus the caller, minus suspended
//   booking  → the two people involved, each told who the other is
//   reminder → same recipients, worded as "starting soon"
//
// Auth: the caller's JWT (must be able to see the thing) or x-kolis-secret for the
// cron. Deploy with verify_jwt=FALSE; auth is enforced here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY");
const TW_SID = Deno.env.get("KOLIS_TWILIO_SID"), TW_TOKEN = Deno.env.get("KOLIS_TWILIO_TOKEN"), TW_FROM = Deno.env.get("KOLIS_TWILIO_FROM");
const FROM = "Quorly <noreply@loadq.ca>";          // loadq.ca is the Resend-verified domain
const MMS_MEDIA = "https://quorly.ca/mms-logo";
const CF_SECRET = "kolis_notify_9f3a2c7b1e6d4084";
const SITE = "https://quorly.ca";
const TZ = "America/Toronto";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-kolis-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Both languages in one message: the roster is mixed and nobody should have to pick.
function when(iso: string) {
  const d = new Date(iso);
  const en = d.toLocaleString("en-CA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const fr = d.toLocaleString("fr-CA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return { en, fr };
}

function emailHtml(o: { kind: string; title: string; where: string; whenEn: string; whenFr: string; mins: number; link: string; note?: string | null; reminder?: boolean; cancelled?: boolean }) {
  const dots = ["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"]
    .map((c) => `<td width="10"><div style="width:9px;height:9px;border-radius:50%;background:${c};font-size:0;line-height:0">&nbsp;</div></td>`).join('<td width="5">&nbsp;</td>');
  const headFr = o.cancelled ? "Annulée." : o.reminder ? "Cela commence bientôt." : (o.kind === "booking" ? "Votre rendez-vous est confirmé." : "Vous êtes convoqué(e).");
  const headEn = o.cancelled ? "Cancelled." : o.reminder ? "Starting soon." : (o.kind === "booking" ? "Your meeting is confirmed." : "You are called to a meeting.");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:22px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <tr><td bgcolor="#2F3AA3" style="background:#2F3AA3;padding:18px 26px">
    <table role="presentation" width="100%"><tr>
      <td style="color:#fff;font-size:19px;font-weight:900">Quorly</td>
      <td align="right"><table role="presentation"><tr>${dots}</tr></table></td></tr></table></td></tr>
  <tr><td style="font-size:0;line-height:0"><table role="presentation" width="100%"><tr>
    <td bgcolor="#E0574A" height="4"></td><td bgcolor="#2F8F6B" height="4"></td><td bgcolor="#6B4FA3" height="4"></td><td bgcolor="#E0A83B" height="4"></td>
  </tr></table></td></tr>
  <tr><td style="padding:26px 30px 8px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">${esc(o.where)}</p>
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:#14131A">${esc(headFr)}</h1>
    <table role="presentation" width="100%" style="margin:0 0 16px"><tr>
      <td width="4" bgcolor="#2F3AA3"></td>
      <td style="padding:6px 0 6px 14px">
        <div style="font-size:17px;font-weight:900;color:#14131A">${esc(o.title)}</div>
        <div style="font-size:13.5px;color:#2F3AA3;font-weight:700;margin-top:3px">${esc(o.whenFr)} · ${o.mins} min</div>
      </td></tr></table>
    ${o.note ? `<p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:#1C1B19;white-space:pre-wrap">${esc(o.note)}</p>` : ""}
    ${o.cancelled
      ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#B4531F;font-weight:700">Cette réunion n'aura pas lieu. · This meeting will not take place.</p>
         <p style="margin:0 0 8px;font-size:12.5px;color:#6B6675;line-height:1.6">📅 Ouvrez <b>invite.ics</b> pour la retirer de votre calendrier.<br>Open <b>invite.ics</b> to remove it from your calendar.</p>`
      : `<p style="margin:0 0 20px"><a href="${o.link}" style="display:inline-block;background:#2F3AA3;color:#fff;text-decoration:none;font-weight:800;font-size:14.5px;padding:13px 22px;border-radius:10px">Rejoindre la salle · Join the room →</a></p>
         <p style="margin:0 0 8px;font-size:12.5px;color:#6B6675;line-height:1.6">La salle vidéo s'ouvre dans Quorly — aucun compte ni installation.<br>The video room opens inside Quorly — no account, no install.</p>
         <p style="margin:10px 0 0;font-size:12.5px;color:#6B6675;line-height:1.6">📅 Ouvrez <b>invite.ics</b> pour l'ajouter à votre calendrier (Apple, Google, Outlook) — il vous rappellera une heure avant.<br>Open <b>invite.ics</b> to add it to your calendar; it reminds you an hour before.</p>`}
  </td></tr>
  <tr><td style="padding:0 30px"><div style="border-top:1px solid #EAE4DA"></div></td></tr>
  <tr><td style="padding:14px 30px 24px">
    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#98A0AE">In English</p>
    <p style="margin:0;font-size:13.5px;line-height:1.6;color:#4a4750">${esc(headEn)} <b>${esc(o.title)}</b> — ${esc(o.whenEn)}, ${o.mins} minutes.</p>
  </td></tr>
  <tr><td bgcolor="#FBF8F2" style="background:#FBF8F2;padding:13px 30px">
    <p style="margin:0;color:#98A0AE;font-size:11px;line-height:1.6">${esc(o.link)}</p>
  </td></tr>
</table></td></tr></table>`;
}

// ---- Calendar invitation -------------------------------------------------------
//
// An .ics attachment is how the meeting reaches Apple Calendar, Google Calendar and
// Outlook without asking anyone to connect an account or grant OAuth: every mail
// client understands text/calendar. It also carries its OWN alarm, so the member's
// phone reminds them even if our email and MMS never arrive.
//
// UID is the meeting's own id, so re-sending (or the hour-before reminder) UPDATES the
// existing entry rather than creating a second one — that is what SEQUENCE is for too.
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545 caps a line at 75 octets; longer ones must continue with a leading space.
const fold = (line: string) => line.length <= 73 ? line
  : line.match(/.{1,73}/g)!.map((c, i) => (i ? " " : "") + c).join("\r\n");

function buildIcs(o: { id: string; title: string; where: string; startsAt: string; mins: number; link: string; note?: string | null; cancelled?: boolean; sequence?: number }) {
  const start = new Date(o.startsAt);
  const end = new Date(start.getTime() + o.mins * 60_000);
  const desc = [o.note || "", "", `${o.where} · Quorly`, o.link].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Quorly//Meetings//EN", "CALSCALE:GREGORIAN",
    `METHOD:${o.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${o.id}@quorly.ca`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEsc(o.title)}`,
    `DESCRIPTION:${icsEsc(desc)}`,
    `LOCATION:${icsEsc(o.link)}`,
    `URL:${icsEsc(o.link)}`,
    `ORGANIZER;CN=Quorly:mailto:noreply@loadq.ca`,
    `STATUS:${o.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    // A calendar client ignores an update whose SEQUENCE is not higher than the one
    // it already holds, so a cancellation must climb past the original 0.
    `SEQUENCE:${o.sequence ?? 0}`,
    // The calendar's own reminder, an hour ahead — independent of our email and MMS.
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(o.title)}`, "TRIGGER:-PT1H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n");
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);                                  // btoa is byte-wise; encode first for accents
};

async function sendEmail(to: string, subject: string, html: string, ics?: string) {
  if (!RESEND) return { ok: false, error: "resend_key_missing" };
  const payload: Record<string, unknown> = { from: FROM, to: [to], subject, html };
  if (ics) payload.attachments = [{ filename: "invite.ics", content: b64(ics) }];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.ok ? { ok: true } : { ok: false, error: `resend_${r.status}` };
}

async function sendSms(phone: string, body: string) {
  if (!(TW_SID && TW_TOKEN && TW_FROM)) return { ok: false, error: "twilio_not_configured" };
  let to = String(phone).replace(/[^\d+]/g, "");
  if (!to.startsWith("+")) to = to.length === 10 ? "+1" + to : "+" + to;
  const p = new URLSearchParams({ To: to, Body: body });
  TW_FROM.startsWith("MG") ? p.set("MessagingServiceSid", TW_FROM) : p.set("From", TW_FROM);
  if (MMS_MEDIA) p.set("MediaUrl", MMS_MEDIA);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  return r.ok ? { ok: true } : { ok: false, error: `twilio_${r.status}` };
}

type Person = { user_id: string | null; name: string | null; email: string | null; phone: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { kind, id, reminder, cancelled } = await req.json().catch(() => ({} as any));
    if (!id || (kind !== "meeting" && kind !== "booking")) return json({ ok: false, error: "bad_args" }, 400);

    const secretOk = req.headers.get("x-kolis-secret") === CF_SECRET;
    let uid: string | null = null;
    if (!secretOk) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      uid = u.user.id;
    }

    let title = "", where = "", startsAt = "", mins = 30, note: string | null = null, link = "";
    let people: Person[] = [];

    if (kind === "meeting") {
      const { data: m } = await admin.from("cf_meetings")
        .select("id, form_id, title, description, starts_at, duration_min, status, created_by").eq("id", id).maybeSingle();
      if (!m) return json({ ok: false, error: "not_found" }, 404);
      if (m.status !== (cancelled ? "cancelled" : "scheduled")) return json({ ok: false, error: "wrong_status" }, 409);
      const { data: f } = await admin.from("cf_forms").select("name").eq("id", m.form_id).maybeSingle();
      // Anyone who can see the meeting may announce it; the cron uses the secret.
      if (!secretOk) {
        const { data: mine } = await admin.from("cf_members").select("id")
          .eq("form_id", m.form_id).eq("user_id", uid).eq("status", "active").maybeSingle();
        if (!mine) return json({ ok: false, error: "not_allowed" }, 403);
      }
      title = m.title; where = f?.name || "Quorly"; startsAt = m.starts_at; mins = m.duration_min;
      note = m.description; link = `${SITE}/m/${m.id}`;

      // The roster IS the guest list — and a suspended member is not called.
      const { data: rows } = await admin.from("cf_members")
        .select("user_id, name, email, phone")
        .eq("form_id", m.form_id).eq("status", "active").eq("suspended", false);
      people = cancelled ? (rows ?? []) : (rows ?? []).filter((p: any) => p.user_id !== m.created_by);
    } else {
      const { data: b } = await admin.from("cf_bookings")
        .select("id, org_id, host_user_id, guest_user_id, starts_at, duration_min, note, status").eq("id", id).maybeSingle();
      if (!b) return json({ ok: false, error: "not_found" }, 404);
      if (b.status !== (cancelled ? "cancelled" : "booked")) return json({ ok: false, error: "wrong_status" }, 409);
      if (!secretOk && uid !== b.host_user_id && uid !== b.guest_user_id) return json({ ok: false, error: "not_allowed" }, 403);
      const { data: f } = await admin.from("cf_forms").select("name").eq("id", b.org_id).maybeSingle();
      const { data: rows } = await admin.from("cf_members")
        .select("user_id, name, email, phone")
        .eq("form_id", b.org_id).in("user_id", [b.host_user_id, b.guest_user_id]);
      people = rows ?? [];
      const nameOf = (u: string) => (rows ?? []).find((r: any) => r.user_id === u)?.name || "a member";
      title = `${nameOf(b.host_user_id)} · ${nameOf(b.guest_user_id)}`;
      where = f?.name || "Quorly"; startsAt = b.starts_at; mins = b.duration_min;
      note = b.note; link = `${SITE}/m/${b.id}`;
    }

    const w = when(startsAt);
    const subject = cancelled
      ? `❌ Annulée · Cancelled — ${title}`
      : reminder
        ? `⏰ ${title} — ${w.en} · ${w.fr}`
        : (kind === "booking" ? `📅 ${where} — ${w.fr}` : `📣 ${where} — ${title}`);
    const html = emailHtml({ kind, title, where, whenEn: w.en, whenFr: w.fr, mins, link, note, reminder, cancelled });
    const ics = buildIcs({ id, title, where, startsAt, mins, link, note, cancelled, sequence: cancelled ? 1 : 0 });
    const sms = cancelled
      ? `${where}\n\n❌ ANNULÉE / CANCELLED\n${title}\n${w.fr}\n\nCette réunion n'aura pas lieu.\nThis meeting will not take place.`
      : `${where}\n\n${reminder ? "⏰ Bientôt / Starting soon" : title}\n${w.fr}\n${mins} min\n\nRejoindre / Join: ${link}`;

    let emailed = 0, texted = 0; const failed: any[] = [];
    const seenE = new Set<string>(), seenP = new Set<string>();
    for (const p of people) {
      const e = String(p.email || "").trim().toLowerCase();
      if (isEmail(e) && !seenE.has(e)) {
        seenE.add(e);
        const r = await sendEmail(e, subject, html, ics);
        r.ok ? emailed++ : failed.push({ ch: "email", error: r.error });
      }
      const ph = String(p.phone || "").replace(/[^\d+]/g, "");
      if (ph.length >= 10 && !seenP.has(ph)) {
        seenP.add(ph);
        const r = await sendSms(ph, sms);
        r.ok ? texted++ : failed.push({ ch: "sms", error: r.error });
      }
      await sleep(120);
    }
    return json({ ok: true, kind, recipients: people.length, emailed, texted, failed });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
