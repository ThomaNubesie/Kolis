"use client";
// /doc/<id> — the link that goes in every document email and text.
//
// Short on purpose: this ends up in an SMS, where a long /organizations?open=…&doc=…
// URL wraps badly and looks like spam. This page resolves the document to its space and
// forwards; the long form is an implementation detail the recipient never sees.
//
// Unauthenticated visitors are not redirected away. QuorlyAuthGate renders the sign-in
// card in place, and once they are in, this same page continues and forwards them to the
// document — so the link in the email survives a login instead of dumping them on a home
// screen with no idea what they were sent.
//
// Three outcomes, all of which have to read well to someone who just tapped a text:
//   can_view            → forward to the document
//   notified, no access → say so plainly, and still let them acknowledge
//   neither             → a flat "not available", with no document name leaked
import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import QuorlyAuthGate from "@/components/QuorlyAuthGate";
import { useLang } from "@/lib/i18n";
import { cf, type CfFileLocate } from "@/lib/cf";
import { FileText, EyeOff, Check, Loader2 } from "lucide-react";

const C = { bg: "#EFEAE0", paper: "#fff", line: "#E3DCCB", ink: "#14131A", mut: "#6B6675", accent: "#2F3AA3" };

function Resolve() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const tr = (o: { en: string; fr: string }) => o[lang];
  const [loc, setLoc] = useState<CfFileLocate | null | "missing">(null);
  const [acked, setAcked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await cf.fileLocate(id).catch(() => null);
      if (!r) { setLoc("missing"); return; }
      if (r.can_view) {
        // Acknowledgement is a deliberate act, so it is NOT recorded here — opening the
        // link is not the same as confirming you read the document. The banner in the
        // app asks for it explicitly.
        router.replace(`/organizations?open=${r.form_id}&doc=${id}`);
        return;
      }
      setLoc(r);
    })();
  }, [id, router]);

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: 28, maxWidth: 420, width: "100%", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );

  if (loc === null) {
    return wrap(<Loader2 size={22} style={{ color: C.accent }} className="spin" />);
  }

  if (loc === "missing" || (!loc.can_view && !loc.notified)) {
    return wrap(<>
      <FileText size={26} style={{ color: "#C9C3B8" }} />
      <h1 style={{ fontSize: 17, margin: "12px 0 6px", color: C.ink }}>
        {tr({ en: "This document is not available", fr: "Ce document n'est pas disponible" })}
      </h1>
      <p style={{ fontSize: 13.5, color: C.mut, lineHeight: 1.6, margin: 0 }}>
        {tr({
          en: "It may have been removed, or it was not shared with this account. If you were expecting it, check you are signed in with the address the message was sent to.",
          fr: "Il a peut-être été supprimé, ou il n'a pas été partagé avec ce compte. Si vous l'attendiez, vérifiez que vous êtes connecté avec l'adresse à laquelle le message a été envoyé.",
        })}
      </p>
      <a href="/organizations" style={{ display: "inline-block", marginTop: 16, color: C.accent, fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}>
        {tr({ en: "Go to Quorly →", fr: "Aller à Quorly →" })}
      </a>
    </>);
  }

  // Notified, but the poster did not grant sight. Say it plainly rather than pretending
  // the document does not exist — they were told about it by name.
  return wrap(<>
    <EyeOff size={26} style={{ color: "#B4801F" }} />
    <h1 style={{ fontSize: 17, margin: "12px 0 6px", color: C.ink }}>
      {loc.file_name || tr({ en: "Document", fr: "Document" })}
    </h1>
    <p style={{ fontSize: 13.5, color: C.mut, lineHeight: 1.6, margin: 0 }}>
      {tr({
        en: "You were notified about this document, but you have not been given permission to open it. Ask the person who posted it if you need access.",
        fr: "Vous avez été informé de ce document, mais vous n'avez pas l'autorisation de l'ouvrir. Demandez l'accès à la personne qui l'a déposé.",
      })}
      {loc.form_name ? ` — ${loc.form_name}` : ""}
    </p>
    {!acked ? (
      <div
        onClick={async () => { setBusy(true); try { await cf.fileAck(id); setAcked(true); } finally { setBusy(false); } }}
        style={{ marginTop: 16, background: C.accent, color: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "inline-flex", gap: 7, alignItems: "center" }}
      >
        {busy && <Loader2 size={14} className="spin" />}
        {tr({ en: "Acknowledge receipt", fr: "Accuser réception" })}
      </div>
    ) : (
      <div style={{ marginTop: 16, color: "#2F8F6B", fontWeight: 800, fontSize: 13.5, display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Check size={15} />{tr({ en: "Acknowledged", fr: "Réception accusée" })}
      </div>
    )}
  </>);
}

export default function DocLinkPage() {
  return (
    <Suspense fallback={null}>
      <QuorlyAuthGate><Resolve /></QuorlyAuthGate>
    </Suspense>
  );
}
