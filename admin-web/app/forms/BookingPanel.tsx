"use client";
// Book an officer, and publish your own hours.
//
// Members only, by construction: every RPC behind this goes through cf_is_member_deep,
// which also refuses a suspended member. Slots are computed on the server from the
// officer's weekly hours minus what is already booked and any meeting they are called
// to, so a member can never be offered a time that is not really free.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cf, type CfOfficer, type CfAvailRule } from "@/lib/cf";

const L = (en: string, fr: string) => ({ en, fr });
const C = { ink: "#14131A", ink2: "#6B6675", faint: "#A8A29A", line: "#E3DCCB", accent: "#2F3AA3", soft: "#F4F1FB" };
const two = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${two(Math.floor(min / 60))}:${two(min % 60)}`;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function BookingPanel({ orgId, tr, lang, me }: { orgId: string; tr: (o: any) => string; lang: string; me?: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<"book" | "mine">("book");
  const [officers, setOfficers] = useState<CfOfficer[]>([]);
  const [host, setHost] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ at: string; slot_min: number }[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { cf.officers(orgId).then(setOfficers).catch(() => setOfficers([])); }, [orgId]);

  useEffect(() => {
    if (!host) { setSlots([]); return; }
    setPick(null);
    cf.slots(orgId, host, 21).then((s) => {
      setSlots(s);
      const days = Array.from(new Set(s.map((x) => new Date(x.at).toDateString())));
      setDay(days[0] ?? null);
    }).catch(() => setSlots([]));
  }, [orgId, host]);

  const days = useMemo(() => Array.from(new Set(slots.map((s) => new Date(s.at).toDateString()))), [slots]);
  const daySlots = useMemo(() => slots.filter((s) => new Date(s.at).toDateString() === day), [slots, day]);

  const book = async () => {
    if (!host || !pick || busy) return;
    setBusy(true);
    try {
      const dur = slots.find((s) => s.at === pick)?.slot_min ?? 30;
      const r = await cf.book(orgId, host, pick, dur, note.trim() || undefined);
      const n = await cf.meetingNotify("booking", r.booking_id);
      setPick(null); setNote("");
      const s = await cf.slots(orgId, host, 21); setSlots(s);
      if (!n?.ok) alert(tr(L("Booked, but we couldn't send the confirmation — tell them directly.",
                             "Réservé, mais la confirmation n'a pas pu être envoyée — prévenez-les directement.")));
      else alert(tr(L("Booked. You'll both get an email and a text with the room link.",
                      "Réservé. Vous recevrez tous les deux un courriel et un SMS avec le lien de la salle.")));
      setTab("mine");
    } catch (e: any) {
      // slot_just_taken is the database's unique index refusing a race, not a bug.
      const msg = e?.message === "slot_just_taken" || e?.message === "slot_unavailable"
        ? tr(L("Someone just took that time — pick another.", "Ce créneau vient d'être pris — choisissez-en un autre."))
        : e?.message || "Failed";
      alert(msg);
      if (host) cf.slots(orgId, host, 21).then(setSlots).catch(() => {});
    }
    setBusy(false);
  };

  const tabBtn = (k: "book" | "mine", label: string): any => ({
    padding: "8px 1px", marginRight: 16, fontSize: 12.5, fontWeight: 800, cursor: "pointer",
    color: tab === k ? C.accent : C.faint, borderBottom: `2px solid ${tab === k ? C.accent : "transparent"}`,
  });

  return (
    <div>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: 14 }}>
        <div style={tabBtn("book", "")} onClick={() => setTab("book")}>{tr(L("Book an officer", "Réserver un officier"))}</div>
        <div style={tabBtn("mine", "")} onClick={() => setTab("mine")}>{tr(L("My hours", "Mes disponibilités"))}</div>
      </div>

      {tab === "book" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 240px) 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, margin: "0 2px 7px" }}>{tr(L("Officers", "Officiers"))}</div>
            {officers.filter((o) => o.bookable).length === 0 && (
              <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
                {tr(L("Nobody has published hours yet. Open “My hours” to be the first.",
                      "Personne n'a publié de disponibilités. Ouvrez « Mes disponibilités » pour être le premier."))}
              </div>
            )}
            {officers.filter((o) => o.bookable).map((o) => (
              <div key={o.user_id} onClick={() => setHost(o.user_id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: 9, border: `1px solid ${host === o.user_id ? C.accent : "#ECE9E2"}`, boxShadow: host === o.user_id ? "0 0 0 2px #E7E9F7" : "none", borderRadius: 11, background: "#fff", marginBottom: 7, cursor: "pointer" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: o.color || C.accent, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {(o.name || "?").slice(0, 2).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                  {o.title && <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{o.title}</div>}
                </div>
              </div>
            ))}
          </div>

          <div>
            {!host && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("Choose an officer to see their free times.", "Choisissez un officier pour voir ses disponibilités."))}</div>}
            {host && slots.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>{tr(L("No free times in the next three weeks.", "Aucune disponibilité dans les trois prochaines semaines."))}</div>}
            {host && slots.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {days.map((d) => {
                    const dd = new Date(d);
                    const on = d === day;
                    return (
                      <div key={d} onClick={() => { setDay(d); setPick(null); }}
                        style={{ border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : "#fff", color: on ? "#fff" : C.ink, borderRadius: 10, padding: "7px 12px", textAlign: "center", cursor: "pointer", flex: "0 0 auto" }}>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, opacity: .75 }}>{(lang === "fr" ? DAYS_FR : DAYS_EN)[dd.getDay()]}</div>
                        <div style={{ fontSize: 15, fontWeight: 900 }}>{dd.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))", gap: 7, marginTop: 12 }}>
                  {daySlots.map((s) => {
                    const t = new Date(s.at);
                    const on = pick === s.at;
                    return (
                      <div key={s.at} onClick={() => setPick(s.at)}
                        style={{ border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? C.accent : "#fff", color: on ? "#fff" : C.ink, borderRadius: 9, padding: "9px 0", textAlign: "center", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                        {two(t.getHours())}:{two(t.getMinutes())}
                      </div>
                    );
                  })}
                </div>
                {pick && (
                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: C.ink2, marginBottom: 4 }}>{tr(L("What is it about?", "De quoi s'agit-il ?"))}</label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr(L("Optional", "Facultatif"))}
                      style={{ width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", minHeight: 56, resize: "vertical" }} />
                    <div style={{ background: C.soft, border: "1px solid #D9D3F5", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, color: "#2b2570", lineHeight: 1.55, marginTop: 10 }}>
                      {new Date(pick).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                      {" — "}{tr(L("you both get the room link. Nobody types a video link.", "vous recevez tous les deux le lien de la salle."))}
                    </div>
                    <button onClick={book} disabled={busy}
                      style={{ marginTop: 10, width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>
                      {busy ? tr(L("Booking…", "Réservation…")) : tr(L("Book this time", "Réserver ce créneau"))}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <MyHours orgId={orgId} tr={tr} lang={lang} />
      )}
    </div>
  );
}

// The officer's own weekly hours. Saved as a whole week at a time: a half-applied
// timetable is worse than none, so cf_availability_set replaces the lot in one call.
function MyHours({ orgId, tr, lang }: { orgId: string; tr: (o: any) => string; lang: string }) {
  const [rules, setRules] = useState<CfAvailRule[]>([]);
  const [slotMin, setSlotMin] = useState(30);
  const [busy, setBusy] = useState(false);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto", []);

  const load = useCallback(() => {
    cf.availabilityGet(orgId).then((r) => {
      setRules(r);
      if (r[0]?.slot_min) setSlotMin(r[0].slot_min);
    }).catch(() => setRules([]));
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const forDay = (d: number) => rules.find((r) => r.weekday === d);
  const setDay = (d: number, start: string, end: string) => {
    setRules((rs) => {
      const rest = rs.filter((r) => r.weekday !== d);
      if (!start || !end) return rest;
      return [...rest, { weekday: d, start_min: toMin(start), end_min: toMin(end), slot_min: slotMin }];
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await cf.availabilitySet(orgId, rules.map((r) => ({ weekday: r.weekday, start_min: r.start_min, end_min: r.end_min, slot_min: slotMin })), tz);
      alert(tr(L("Saved. Members can book you in these hours.", "Enregistré. Les membres peuvent vous réserver sur ces plages.")));
      load();
    } catch (e: any) { alert(e?.message || "Failed"); }
    setBusy(false);
  };

  const inp: any = { border: `1.5px solid ${C.line}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, fontFamily: "inherit" };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6, marginBottom: 12 }}>
        {tr(L("When members may book you. Set it once; it repeats every week.",
              "Quand les membres peuvent vous réserver. À définir une fois ; se répète chaque semaine."))}
      </div>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const r = forDay(d);
        return (
          <div key={d} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: `1px solid #ECE9E2`, fontSize: 12.5 }}>
            <span style={{ width: 44, fontWeight: 800 }}>{(lang === "fr" ? DAYS_FR : DAYS_EN)[d]}</span>
            <input type="time" style={inp} value={r ? hhmm(r.start_min) : ""} onChange={(e) => setDay(d, e.target.value, r ? hhmm(r.end_min) : "17:00")} />
            <span style={{ color: C.faint }}>→</span>
            <input type="time" style={inp} value={r ? hhmm(r.end_min) : ""} onChange={(e) => setDay(d, r ? hhmm(r.start_min) : "09:00", e.target.value)} />
            {r && <span onClick={() => setRules((rs) => rs.filter((x) => x.weekday !== d))} style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: C.faint, cursor: "pointer" }}>{tr(L("clear", "effacer"))}</span>}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: C.ink2, marginBottom: 4 }}>{tr(L("Slot length", "Durée d'un créneau"))}</label>
          <select style={inp} value={slotMin} onChange={(e) => setSlotMin(Number(e.target.value))}>
            {[15, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 200, lineHeight: 1.55 }}>
          {tr(L("Saved in your zone", "Enregistré dans votre fuseau"))} ({tz}) — {tr(L("as wall-clock time, so 9:00 stays 9:00 when the clocks change.",
                                                                                       "en heure locale, donc 9 h reste 9 h au changement d'heure.")) }
        </div>
      </div>
      <button onClick={save} disabled={busy}
        style={{ marginTop: 14, width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>
        {busy ? tr(L("Saving…", "Enregistrement…")) : tr(L("Save my hours", "Enregistrer"))}
      </button>
    </div>
  );
}
