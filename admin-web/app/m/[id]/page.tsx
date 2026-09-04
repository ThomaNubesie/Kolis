"use client";
// The room. One page for both kinds of call: /m/<meeting-id> and /m/<booking-id>.
//
// Video is a Jitsi room embedded here rather than a link that throws the member out to
// another product — no account, no install, works in a phone browser. The room NAME is
// the access control: a Jitsi room is open to whoever knows it, so the name is a
// 32-character random token that the server hands out only to a member of the meeting
// (cf_meeting_room / cf_booking_room both refuse anyone else, and refuse a suspended
// member, because they go through cf_is_member_deep).
//
// The id could be either kind, and the caller may legitimately be a member of one and
// not the other, so we try the meeting first and fall back to the booking.
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cf, type CfRoom } from "@/lib/cf";
import { useLang } from "@/lib/i18n";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";

const L = (en: string, fr: string) => ({ en, fr });
const C = { paper: "#FBF8F2", ink: "#14131A", ink2: "#6B6675", line: "#E3DCCB", accent: "#2F3AA3" };

function RoomInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [room, setRoom] = useState<CfRoom | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      let r: CfRoom | null = null;
      try { r = await cf.meetingRoom(id); } catch { /* try the other kind */ }
      if (!r?.ok) { try { const b = await cf.bookingRoom(id); if (b?.ok) r = b; } catch { /* keep the first error */ } }
      if (alive) { setRoom(r); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id]);

  // Jitsi reads the display name and the starting mute state from the URL fragment, so
  // a member arrives already named — nobody has to type who they are.
  const src = useMemo(() => {
    if (!room?.room) return "";
    const cfg = [
      "config.prejoinPageEnabled=false",
      "config.disableDeepLinking=true",
      `userInfo.displayName="${encodeURIComponent(room.me || "Member")}"`,
      `config.subject="${encodeURIComponent(room.title || "Quorly")}"`,
    ].join("&");
    return `https://meet.jit.si/quorly-${room.room}#${cfg}`;
  }, [room]);

  if (loading) return <div style={{ background: "#14131A", minHeight: "100vh" }} />;

  if (!room?.ok) {
    const why = room?.error === "not_member" ? tr(L("You are not part of this meeting.", "Vous ne faites pas partie de cette réunion."))
      : room?.error === "cancelled" ? tr(L("This meeting was cancelled.", "Cette réunion a été annulée."))
      : room?.error === "not_yours" ? tr(L("This booking is not yours.", "Cette réservation n'est pas la vôtre."))
      : tr(L("This room does not exist.", "Cette salle n'existe pas."));
    return (
      <div style={{ background: "#14131A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ display: "inline-flex", gap: 6, marginBottom: 16 }}>
            {["#E0574A", "#2F8F6B", "#6B4FA3", "#E0A83B"].map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}
          </div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{why}</div>
          <div onClick={() => router.push("/forms")} style={{ color: "#9b97a6", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginTop: 14 }}>
            ← {tr(L("Back to Quorly", "Retour à Quorly"))}
          </div>
        </div>
      </div>
    );
  }

  const starts = room.starts_at ? new Date(room.starts_at) : null;
  const early = starts ? Date.now() < starts.getTime() - 5 * 60 * 1000 : false;

  return (
    <div style={{ background: "#14131A", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", background: "#1D1B25", color: "#fff", flex: "0 0 auto" }}>
        <span onClick={() => router.push("/forms")} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#9b97a6" }}>←</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{room.title}</div>
          {room.where && <div style={{ fontSize: 11, color: "#9b97a6" }}>{room.where}</div>}
        </div>
        {starts && <div style={{ fontSize: 11.5, color: "#9b97a6", flex: "0 0 auto" }}>
          {starts.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          {room.duration_min ? ` · ${room.duration_min} min` : ""}
        </div>}
      </div>

      {early && (
        <div style={{ background: "#2F3AA3", color: "#fff", fontSize: 12, fontWeight: 700, padding: "7px 15px", textAlign: "center" }}>
          {tr(L("You are early — the room is open, others may not have joined yet.",
                "Vous êtes en avance — la salle est ouverte, les autres ne sont peut-être pas encore arrivés."))}
        </div>
      )}

      <iframe
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        style={{ flex: 1, width: "100%", border: "none", minHeight: "70vh", background: "#14131A" }}
      />
    </div>
  );
}

export default function RoomPage() {
  return <QuorlyAuthGate><RoomInner /></QuorlyAuthGate>;
}
