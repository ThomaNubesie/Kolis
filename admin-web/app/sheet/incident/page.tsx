"use client";
// LoadQ — Registre d'incident / Incident Log, on the tablet.
//
// The paper form (Concord Express letterhead, Ottawa Vehicle-for-Hire By-law
// 2016-272) filled in at the kerb when an unlicensed car works the queue.
//
// Reached from the day sheet: the LOAD Q header carries the tabs
//   Feuille du jour · Registre d'incident
// so the writer never leaves the tablet's one app to report something.
//
// Three things the paper cannot do, and the reason this exists:
//   * the number, date, time, place and writer fill themselves — and stay
//     editable, because the form is usually written twenty minutes later
//   * photo AND video come off the tablet camera, timestamped, filed under the
//     incident instead of living in somebody's camera roll
//   * it emails itself the moment it is signed, to addresses saved once
//
// `capture="environment"` is what opens the rear camera directly on a tablet
// rather than a file browser; `accept="video/*"` on the second input is what
// makes it record instead of photograph.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Camera, Video, X, Send, Save, FileDown, Plus, ShieldAlert, WifiOff, Check,
} from "lucide-react";

const C = {
  ink: "#1A1917", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA",
  rule: "#FF6B00", bg: "#F4F1EC", sheet: "#FFFFFF", strip: "#FBF7F3",
  green: "#1F8A55", red: "#B4431F", blue: "#2F5BA3", auto: "#F6FBF8",
};

type Media = { id: string; kind: "photo" | "video"; path: string; label: string | null; taken_at: string; bytes: number | null };
type Recip = { id: string; label: string; email: string; default_on: boolean };
type Recent = {
  id: string; incident_no: string; occurred_at: string; plate: string | null; car: string | null;
  recorded_by_name: string | null; status: string; photos: number; videos: number; sends: number;
};

const ZONE = "ottawa-universal-grocery";
const DEFAULT_LOCATION = "140, rue George, Ottawa (Ontario)";

export default function IncidentPage() {
  const [me, setMe] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);

  const [id, setId] = useState<string | null>(null);
  const [f, setF] = useState<any>({
    incident_no: "", date: "", time: "", location: DEFAULT_LOCATION,
    plate: "", make: "", model: "", color: "", passengers: "", driver_desc: "",
    obs_solicitation: false, obs_cash: false, obs_hailed: false, obs_no_licence: false,
    description: "", recorded_by_name: "",
  });
  const [media, setMedia] = useState<Media[]>([]);
  const [recips, setRecips] = useState<Recip[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [newMail, setNewMail] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);

  const photoIn = useRef<HTMLInputElement>(null);
  const videoIn = useRef<HTMLInputElement>(null);

  const say = (msg: string, bad = false) => {
    setToast({ msg, bad });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 5000);
  };
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase.rpc("loadq_incident_recent", { p_zone: ZONE, p_limit: 12 });
    setRecent((data ?? []) as Recent[]);
  }, []);

  // A fresh form: number, date, time, place and writer come from the server so
  // two tablets can never mint the same incident number.
  const blank = useCallback(async () => {
    const { data } = await supabase.rpc("loadq_incident_new", { p_zone: ZONE });
    if (!data?.ok) return say(data?.error === "not_a_list_writer" ? "Vous n'avez pas le droit d'écrire ce registre." : "Impossible d'ouvrir un nouvel incident.", true);
    setId(null); setMedia([]);
    setF({
      incident_no: data.incident_no, date: data.date, time: data.time,
      location: data.default_location ?? DEFAULT_LOCATION,
      plate: "", make: "", model: "", color: "", passengers: "", driver_desc: "",
      obs_solicitation: false, obs_cash: false, obs_hailed: false, obs_no_licence: false,
      description: "", recorded_by_name: data.recorded_by_name ?? "",
    });
    const rs = (data.recipients ?? []) as Recip[];
    setRecips(rs);
    setTicked(new Set(rs.filter((r) => r.default_on).map((r) => r.email)));
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setReady(true); return; }
      const { data } = await supabase.rpc("loadq_list_writer_me");
      setMe(data);
      if (data?.can_write) { await blank(); await loadRecent(); }
      setReady(true);
    })();
  }, [blank, loadRecent]);

  // Saving before uploading is deliberate: media rows need an incident to hang
  // off, and a half-filled report should survive the tablet locking itself.
  const save = async (status?: string): Promise<string | null> => {
    setBusy(true);
    const { data } = await supabase.rpc("loadq_incident_save", {
      p_id: id, p_body: { ...f, zone_id: ZONE, ...(status ? { status } : {}) },
    });
    setBusy(false);
    if (!data?.ok) { say(data?.error === "incident_no_required" ? "Le numéro d'incident est obligatoire." : "Enregistrement impossible.", true); return null; }
    setId(data.id);
    return data.id as string;
  };

  const capture = async (kind: "photo" | "video", file: File) => {
    const incId = id ?? (await save());
    if (!incId) return;
    setBusy(true);
    const ext = (file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg")).toLowerCase();
    const path = `${f.incident_no}/${Date.now()}-${kind}.${ext}`;
    const up = await supabase.storage.from("incident-media").upload(path, file, {
      contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"), upsert: false,
    });
    if (up.error) {
      setBusy(false);
      // 50 MB is the project's storage ceiling, and a long clip blows past it.
      return say(/exceed|too large|413/i.test(up.error.message)
        ? "Fichier trop lourd (max 50 Mo) — filmez plus court."
        : "Téléversement impossible.", true);
    }
    const { data } = await supabase.rpc("loadq_incident_media_add", {
      p_incident: incId, p_kind: kind, p_path: path, p_label: null,
      p_bytes: file.size, p_mime: file.type || null, p_taken_at: new Date().toISOString(),
    });
    setBusy(false);
    if (!data?.ok) return say("Fichier téléversé mais non enregistré.", true);
    setMedia((m) => [...m, { id: data.id, kind, path, label: null, taken_at: new Date().toISOString(), bytes: file.size }]);
  };

  const addRecipient = async () => {
    const email = newMail.trim();
    if (!email) return;
    const { data } = await supabase.rpc("loadq_incident_recipient_add", { p_label: "", p_email: email, p_save: true });
    if (!data?.ok) return say(data?.error === "invalid_email" ? "Adresse courriel invalide." : "Impossible d'ajouter.", true);
    const { data: rs } = await supabase.rpc("loadq_incident_recipients");
    setRecips((rs ?? []) as Recip[]);
    setTicked((s) => new Set([...s, data.email]));
    setNewMail("");
  };

  const send = async () => {
    const to = [...ticked];
    if (!to.length) return say("Cochez au moins un destinataire.", true);
    const incId = id ?? (await save("filed"));
    if (!incId) return;
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    let ok = false, detail = "";
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/loadq-incident-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ incident_id: incId, to }),
      });
      const j = await res.json();
      ok = !!j.ok; detail = j.detail ?? j.error ?? "";
    } catch (e) { detail = String(e); }
    // Logged from here, as the writer, so the record names a person and not the
    // service key that actually posted the mail.
    await supabase.rpc("loadq_incident_send_log", { p_incident: incId, p_to: to, p_ok: ok, p_detail: detail.slice(0, 300) });
    setBusy(false);
    say(ok ? `Envoyé à ${to.length} destinataire${to.length > 1 ? "s" : ""}.` : "Envoi échoué — l'incident reste enregistré.", !ok);
    loadRecent();
  };

  if (!ready) return <Center>Chargement…</Center>;
  if (!me) return <Center>Connectez-vous depuis la feuille du jour.</Center>;
  if (!me.can_write) return <Center>Ce compte ne peut pas écrire ce registre.</Center>;

  const Field = ({ k, fr, en, auto, mono, wide }: any) => (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ position: "relative", fontSize: 11, fontWeight: 800 }}>
        {fr}<span style={{ display: "block", fontWeight: 500, fontSize: 10, color: C.faint, marginTop: 1 }}>{en}</span>
        {auto && <span style={{ position: "absolute", right: 0, top: 0, fontSize: 9, fontWeight: 700, color: "#1F7A4D", background: "#EAF6F0", border: "1px solid #CFE8DC", borderRadius: 20, padding: "2px 8px" }}>auto · modifiable</span>}
      </div>
      <input value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}
        style={{ width: "100%", marginTop: 7, border: 0, borderBottom: `1px solid #D9CFC0`, background: auto ? C.auto : "transparent", fontSize: 16, padding: "6px 4px", outline: "none", fontFamily: mono ? "ui-monospace,Menlo,monospace" : undefined, letterSpacing: mono ? 1 : undefined }} />
    </div>
  );
  const Check = ({ k, fr, en }: any) => (
    <div onClick={() => set(k, !f[k])} style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
      <div style={{ width: 26, height: 26, borderRadius: 5, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", border: `1.5px solid ${f[k] ? C.green : "#C9BDA9"}`, background: f[k] ? C.green : "transparent" }}>{f[k] ? <Check size={16} /> : null}</div>
      <div><b>{fr}</b><div style={{ fontSize: 11, color: C.faint }}>{en}</div></div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 12, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif", color: C.ink }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", background: C.sheet, borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,.10)" }}>

        <div style={{ background: "#0B0C0F", color: C.rule, padding: "13px 18px", display: "flex", alignItems: "center", gap: 14 }}>
          <b style={{ fontSize: 19 }}>LOAD Q</b>
          <Link href="/sheet" style={{ textDecoration: "none", padding: "7px 13px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, color: "#8A909C" }}>Feuille du jour</Link>
          <span style={{ padding: "7px 13px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, background: "rgba(249,115,22,.18)" }}>Registre d'incident</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 13, alignItems: "center", fontSize: 13, color: "#8A909C" }}>
            {!online && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff" }}><WifiOff size={14} /> hors ligne</span>}
            <span onClick={blank} style={{ cursor: "pointer", color: C.rule, fontWeight: 800 }}>+ Nouvel incident</span>
          </span>
        </div>

        <div style={{ padding: "16px 20px", background: "#0F0A00", color: "#FFF8F0", borderBottom: `3px solid ${C.rule}`, display: "flex" }}>
          <div><div style={{ fontSize: 18, fontWeight: 800 }}>CONCORD EXPRESS CO. INC.</div>
            <div style={{ fontSize: 11, color: "#CC9966", marginTop: 4 }}>ConcordXpress · LoadQ · Kolis&nbsp;&nbsp;&nbsp;&nbsp;Ottawa (Ontario)</div></div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.rule }}>REGISTRE D'INCIDENT</div>
            <div style={{ fontSize: 11, letterSpacing: 1, marginTop: 4 }}>INCIDENT LOG</div></div>
        </div>
        <div style={{ padding: "9px 20px", background: C.strip, borderBottom: `1px solid ${C.line}`, fontSize: 11.5, color: "#8A6A44" }}>
          Sollicitation / prise en charge par un chauffeur sans permis — Solicitation / pickup by an unlicensed driver
        </div>

        {!online && (
          <div style={{ background: "#FDF4F1", padding: "10px 20px", fontSize: 13.5, color: C.red, display: "flex", gap: 9, alignItems: "center" }}>
            <ShieldAlert size={16} /> Hors ligne — photos et envoi impossibles. Notez sur papier.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "18px 24px", padding: "18px 20px" }}>
          <Field k="incident_no" fr="N° d'incident" en="Incident No." auto mono />
          <Field k="date" fr="Date" en="Date (AAAA-MM-JJ)" auto mono />
          <Field k="time" fr="Heure" en="Time" auto mono />
          <Field k="location" fr="Lieu" en="Location" auto wide />
        </div>

        <SecBar>VÉHICULE / VEHICLE</SecBar>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "18px 24px", padding: "18px 20px" }}>
          <Field k="plate" fr="N° de plaque" en="Licence plate" mono />
          <Field k="make" fr="Marque" en="Make" />
          <Field k="color" fr="Couleur" en="Colour" />
          <Field k="model" fr="Modèle" en="Model" />
          <Field k="passengers" fr="Nb de passagers" en="No. of passengers" />
          <Field k="driver_desc" fr="Description du chauffeur" en="Driver description" />
        </div>

        <SecBar>OBSERVATIONS (cocher / check all that apply)</SecBar>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", padding: "16px 20px 6px" }}>
          <Check k="obs_solicitation" fr="Sollicitation au trottoir" en="Curb / on-street solicitation" />
          <Check k="obs_cash" fr="Paiement comptant observé" en="Cash payment observed" />
          <Check k="obs_hailed" fr="Passager hélé dans la rue" en="Passenger hailed in the street" />
          <Check k="obs_no_licence" fr="Aucun permis / identification visible" en="No visible licence / ID" />
        </div>

        <div style={{ padding: "12px 20px 0", fontSize: 11, fontWeight: 800 }}>Description de l'incident
          <span style={{ display: "block", fontWeight: 500, fontSize: 10, color: C.faint }}>Description of the incident</span></div>
        <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4}
          style={{ margin: "8px 20px 0", width: "calc(100% - 40px)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", fontSize: 14.5, lineHeight: 1.6, background: "#FDFCFA", outline: "none", resize: "vertical", fontFamily: "inherit" }} />

        <SecBar top>PREUVE PHOTO / VIDÉO — PHOTO / VIDEO EVIDENCE</SecBar>
        <input ref={photoIn} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { const x = e.target.files?.[0]; if (x) capture("photo", x); e.currentTarget.value = ""; }} />
        <input ref={videoIn} type="file" accept="video/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { const x = e.target.files?.[0]; if (x) capture("video", x); e.currentTarget.value = ""; }} />
        <div style={{ display: "flex", gap: 13, padding: "16px 20px 0", flexWrap: "wrap" }}>
          <Shot onClick={() => photoIn.current?.click()} bg="#0B0C0F" icon={<Camera size={28} />}
            t="Prendre une photo" s="Caméra arrière · horodatée" disabled={!online} />
          <Shot onClick={() => videoIn.current?.click()} bg={C.red} icon={<Video size={28} />}
            t="Enregistrer une vidéo" s="Max 50 Mo · filmez court" disabled={!online} />
          {media.map((m) => (
            <div key={m.id} style={{ width: 146, height: 110, borderRadius: 10, border: `1px solid ${C.line}`, background: m.kind === "video" ? "#332f2a" : "#E7E1D6", position: "relative", overflow: "hidden" }}>
              {m.kind === "video" && <div style={{ position: "absolute", top: 6, left: 6, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 4, padding: "2px 6px" }}>VIDÉO</div>}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.62)", color: "#fff", fontSize: 9.5, padding: "4px 6px" }}>
                {new Date(m.taken_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                <br />{m.path.split("/").pop()}
              </div>
            </div>
          ))}
        </div>

        <SecBar top>ENVOI — SEND</SecBar>
        <div style={{ margin: "14px 20px 0", background: "#F4F7FB", border: "1px solid #DCE5F0", borderRadius: 12, padding: "15px 17px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>DESTINATAIRES ENREGISTRÉS · SAVED RECIPIENTS</div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
            {recips.map((r) => {
              const on = ticked.has(r.email);
              return (
                <div key={r.id} onClick={() => setTicked((s) => { const n = new Set(s); on ? n.delete(r.email) : n.add(r.email); return n; })}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #CFDCEC", borderRadius: 22, padding: "7px 13px", fontSize: 13, cursor: "pointer" }}>
                  <span style={{ width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${on ? C.blue : "#A9BFD8"}`, background: on ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{on ? <Check size={12} /> : null}</span>
                  <b>{r.label}</b><span style={{ color: C.ink2, fontSize: 11.5 }}>{r.email}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 13 }}>
            <input value={newMail} onChange={(e) => setNewMail(e.target.value)} placeholder="Ajouter un courriel…"
              style={{ flex: 1, background: "#fff", border: "1px solid #CFDCEC", borderRadius: 10, padding: "11px 14px", fontSize: 14, outline: "none" }} />
            <span onClick={addRecipient} style={{ background: C.blue, color: "#fff", borderRadius: 10, padding: "11px 17px", fontWeight: 800, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={15} /> Ajouter</span>
          </div>
          <div style={{ marginTop: 11, fontSize: 11.5, color: "#6B7E96" }}>
            L'envoi part immédiatement : le rapport bilingue, les photos en pièce jointe et un lien sécurisé (7 jours) pour chaque fichier, vidéo comprise. Chaque envoi est consigné.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: "18px 20px 0" }}>
          <Field k="recorded_by_name" fr="Consigné par (nom)" en="Recorded by (name)" auto />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "18px 20px", borderTop: `1px solid ${C.line}`, marginTop: 14, flexWrap: "wrap" }}>
          <Btn onClick={() => save().then((x) => x && say("Incident enregistré."))} bg="#0B0C0F" disabled={busy || !online}><Save size={16} /> Enregistrer</Btn>
          <Btn onClick={send} bg={C.blue} disabled={busy || !online}><Send size={16} /> Envoyer maintenant ({ticked.size})</Btn>
          <Btn onClick={() => window.print()} bg="#fff" fg={C.ink2} border><FileDown size={16} /> Imprimer / PDF</Btn>
        </div>

        <div style={{ padding: "13px 20px", background: C.strip, borderTop: `1px solid ${C.line}`, fontSize: 10.5, color: C.faint, lineHeight: 1.65 }}>
          Règlement sur les véhicules de location d'Ottawa n° 2016-272 — Ottawa Vehicle-for-Hire By-law No. 2016-272<br />
          Seuls les taxis autorisés peuvent héler dans la rue ou accepter du comptant. Only licensed taxis may accept street hails or cash.<br />
          Plaintes / Complaints — Services des règlements municipaux (BLRS), Ville d'Ottawa : 613-580-2424 · 311
        </div>

        {recent.length > 0 && (
          <div style={{ padding: "14px 20px", background: C.strip, borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
            <b>Incidents récents</b> <span style={{ color: C.faint }}>— {DEFAULT_LOCATION}</span>
            {recent.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 13, alignItems: "center", padding: "9px 0", borderTop: `1px solid #F1ECE3`, fontSize: 13 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: C.ink2, borderRadius: 5, padding: "2px 7px" }}>{r.incident_no}</span>
                <span>{new Date(r.occurred_at).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · <b>{r.plate ?? "—"}</b> {r.car}</span>
                <span style={{ color: C.faint }}>{r.photos} photo{r.photos > 1 ? "s" : ""}{r.videos ? ` · ${r.videos} vidéo${r.videos > 1 ? "s" : ""}` : ""}</span>
                {r.sends > 0
                  ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: C.blue, borderRadius: 5, padding: "2px 7px" }}>ENVOYÉ ×{r.sends}</span>
                  : <span style={{ color: C.red, fontWeight: 700 }}>non envoyé</span>}
                <span style={{ marginLeft: "auto", color: C.faint }}>{r.recorded_by_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 20, background: toast.bad ? C.red : C.ink, color: "#fff", borderRadius: 11, padding: "13px 17px", fontSize: 14.5, boxShadow: "0 10px 30px rgba(0,0,0,.3)", zIndex: 50 }}>{toast.msg}</div>
      )}
    </div>
  );
}

function SecBar({ children, top }: any) {
  return <div style={{ margin: top ? "18px 20px 0" : "4px 20px 0", background: "#FF6B00", color: "#0F0A00", fontSize: 11.5, fontWeight: 800, padding: "6px 12px", borderRadius: 5 }}>{children}</div>;
}
function Shot({ onClick, bg, icon, t, s, disabled }: any) {
  return (
    <div onClick={disabled ? undefined : onClick}
      style={{ width: 172, background: bg, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, padding: "18px 14px", color: "#fff", textAlign: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1 }}>
      {icon}<div style={{ fontSize: 14, fontWeight: 800 }}>{t}</div>
      <div style={{ fontSize: 10.5, opacity: .75, lineHeight: 1.45 }}>{s}</div>
    </div>
  );
}
function Btn({ children, onClick, bg, fg, border, disabled }: any) {
  return <span onClick={disabled ? undefined : onClick}
    style={{ background: bg, color: fg ?? "#fff", border: border ? "1px solid #EAE4DA" : 0, borderRadius: 11, padding: "13px 20px", fontWeight: 800, fontSize: 14.5, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}>{children}</span>;
}
function Center({ children }: any) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6863", fontFamily: "-apple-system,Inter,sans-serif" }}>{children}</div>;
}
