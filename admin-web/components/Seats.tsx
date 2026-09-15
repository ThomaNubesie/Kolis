"use client";
// LoadQ — seats and money, on the sheet.
//
// A car on LoadQ cannot leave with an unpaid passenger. That rule lives in the database
// (loadq_list_depart refuses with `unpaid_seats`), so this file cannot weaken it — the worst
// a bug here can do is show the wrong thing, not let a car go owing.
//
// Two facts drive the whole design:
//   · the $5 comes OUT of the $30, so a seat pays the driver $25 and never $35;
//   · the money is LoadQ's, never the driver's — every seat settles to our Interac or
//     Stripe, and the driver is paid afterwards out of the frozen record.
// Neither is obvious to someone holding a tablet at Universal Grocery, so both are on screen.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, CreditCard, Smartphone, UserRound, Check, Trash2, Copy } from "lucide-react";
import SeatGlyph from "./SeatGlyph";
import { BRAND_AZURE as AZURE } from "./Brand";

export type Seat = {
  id: string; seat_no: number; name: string | null; phone: string | null;
  channel: "app" | "point"; method: "card" | "interac" | null;
  status: "awaiting" | "paid"; fare_cents: number; reference: string; paid_at: string | null;
};
export type CarSeats = { entry_id: string; capacity: number; fare_cents: number; seats: Seat[] };
type Pal = { ink: string; ink2: string; faint: string; line: string; rule: string;
  ruleSoft: string; sheet: string; strip: string; green: string; red: string; amber: string };

export const money = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " $";

// Has the webhook flipped this seat yet? Asked on every refresh while a link is open.
const seatsPaid = (car: CarSeats | null, seatId: string) =>
  !!car?.seats.find((s) => s.id === seatId && s.status === "paid");

// ── the strip that sits under a driver's name on the sheet ────────────────────────────────
// One dot per seat the car actually has. Filled-and-paid is solid, filled-and-owing is
// hollow amber, empty is a faint outline. At a glance: how full, and who still owes.
export function SeatStrip({ car, C, onOpen }: { car: CarSeats | undefined; C: Pal; onOpen: () => void }) {
  if (!car || car.capacity < 1) return null;
  const byNo = new Map(car.seats.map((s) => [s.seat_no, s]));
  const owing = car.seats.filter((s) => s.status !== "paid").length;
  const paid = car.seats.filter((s) => s.status === "paid");
  const takings = paid.reduce((n, s) => n + s.fare_cents, 0);

  return (
    <div onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, cursor: "pointer" }}>
      {Array.from({ length: car.capacity }, (_, i) => {
        const s = byNo.get(i + 1);
        return (
          <SeatGlyph key={i} w={15}
            state={!s ? "free" : s.status === "paid" ? "paid" : "owing"}
            color={{ paid: C.green, owing: C.amber, free: C.line }}
            title={s ? `${s.name ?? "Place " + (i + 1)} — ${s.status === "paid" ? "payé" : "à encaisser"}`
                     : `Place ${i + 1} libre`} />
        );
      })}
      <span style={{ fontSize: 12, color: owing ? C.amber : C.faint, fontWeight: owing ? 700 : 500, marginLeft: 2 }}>
        {owing ? `${owing} à encaisser` : paid.length ? `${money(takings)} encaissés` : "places libres"}
      </span>
    </div>
  );
}

// ── the panel: fill seats, take the money, then let the car go ────────────────────────────
export function SeatPanel({ entryId, driver, C, onClose, onChanged, onDeparted }: {
  entryId: string; driver: string; C: Pal;
  onClose: () => void; onChanged: () => void;
  onDeparted: (receipt: any) => void;
}) {
  const [car, setCar] = useState<CarSeats | null>(null);
  const [fee, setFee] = useState(500);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  // A live Stripe payment link for one seat. Held open until the webhook flips the seat,
  // which is why the panel polls while it is showing.
  const [pay, setPay] = useState<{ seat: string; url: string; reference: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("loadq_seats_for_entry", { p_entry: entryId });
    if (data?.ok) {
      setCar({ entry_id: entryId, capacity: data.capacity, fare_cents: data.fare_cents, seats: data.seats ?? [] });
      setFee(data.fee_cents ?? 500);
    } else setMsg({ t: data?.error ?? "erreur", bad: true });
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entryId]);

  const say = (t: string, bad?: boolean) => { setMsg({ t, bad }); setTimeout(() => setMsg(null), 4000); };
  const run = async (fn: () => PromiseLike<any>) => {
    setBusy(true); const d = await fn(); setBusy(false);
    await load(); onChanged();
    return d;
  };

  const openSeat = async (n: number) => {
    if (!name.trim()) return say("Le nom du passager, au moins un prénom.", true);
    const d = await run(() => supabase.rpc("loadq_seat_open", {
      p_entry: entryId, p_seat_no: n, p_name: name.trim(),
      p_phone: phone.trim() || null, p_channel: "point",
    }).then((r) => r.data));
    if (!d?.ok) return say(errText(d?.error), true);
    setAdding(null); setName(""); setPhone("");
  };

  const markPaid = async (s: Seat, method: "card" | "interac") => {
    const ref = window.prompt(
      method === "interac"
        ? `Virement reçu pour ${s.name ?? "place " + s.seat_no}.\nNuméro de référence Interac :`
        : `Marquer payé à la main pour ${s.name ?? "place " + s.seat_no}.\n` +
          `⚠ Aucune preuve Stripe ne sera attachée : le versement au chauffeur restera bloqué ` +
          `à la vérification.\nRéférence :`,
      s.reference);
    if (ref === null) return;
    const d = await run(() => supabase.rpc("loadq_seat_mark_paid", {
      p_seat: s.id, p_method: method, p_reference: ref.trim() || s.reference,
    }).then((r) => r.data));
    if (!d?.ok) say(errText(d?.error), true);
  };

  // There is no card reader at the pickup point: the passenger pays on their own phone.
  // Nobody types "paid" — the seat flips itself when Stripe confirms the charge.
  const cardLink = async (s: Seat) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("loadq-seat-pay", { body: { seat_id: s.id } });
    setBusy(false);
    if (error || !data?.ok) return say(errText(data?.error) ?? error?.message ?? "lien impossible", true);
    setPay({ seat: s.id, url: data.url, reference: data.reference });
    setCopied(false);
  };

  const textLink = async (s: Seat, url: string) => {
    if (!s.phone) return say("Aucun numéro pour ce passager.", true);
    const { data, error } = await supabase.functions.invoke("loadq-send-sms", {
      body: {
        to: s.phone,
        body: `LoadQ — votre place (${money(s.fare_cents)}). Payez ici : ${url}\n\n`
            + `Your LoadQ seat. Pay here: ${url}`,
      },
    });
    say(error || !data?.ok ? "SMS non envoyé." : `Lien envoyé au ${s.phone}.`, !!(error || !data?.ok));
  };

  // While a link is open the seat can change without us: Stripe's webhook, not this tablet,
  // is what marks it paid.
  useEffect(() => {
    if (!pay) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pay]);
  useEffect(() => {
    if (pay && seatsPaid(car, pay.seat)) { setPay(null); say("Paiement reçu — place payée."); }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [car]);

  const release = async (s: Seat) => {
    if (s.status === "paid") return say("Une place payée ne se libère pas ici — il faut un remboursement.", true);
    if (!confirm(`Libérer la place ${s.seat_no} (${s.name ?? "sans nom"}) ?`)) return;
    const d = await run(() => supabase.rpc("loadq_seat_release", { p_seat: s.id, p_reason: "libérée sur la feuille" }).then((r) => r.data));
    if (!d?.ok) say(errText(d?.error), true);
  };

  const depart = async () => {
    const paid = car?.seats.filter((s) => s.status === "paid").length ?? 0;
    if (!confirm(`Faire partir ${driver} avec ${paid} place(s) payée(s) ?\nLe montant sera figé et ne changera plus.`)) return;
    setBusy(true);
    const { data } = await supabase.rpc("loadq_list_depart", { p_entry: entryId, p_seats: paid });
    setBusy(false);
    if (!data?.ok) {
      await load();
      return say(data?.error === "unpaid_seats"
        ? "Des places ne sont pas encaissées — encaissez-les ou libérez-les."
        : errText(data?.error), true);
    }
    onDeparted(data.receipt);
  };

  const seats = car?.seats ?? [];
  const byNo = new Map(seats.map((s) => [s.seat_no, s]));
  const owing = seats.filter((s) => s.status !== "paid");
  const paid = seats.filter((s) => s.status === "paid");
  const gross = paid.reduce((n, s) => n + s.fare_cents, 0);
  const toDriver = gross - paid.length * fee;

  return (
    <Overlay onClose={onClose}>
      <div style={{ background: C.sheet, color: C.ink, borderRadius: 16, width: "min(560px, 94vw)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 18px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{driver}</div>
            <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 1 }}>
              {car ? `${car.capacity} places · ${money(car.fare_cents)} la place` : "…"}
            </div>
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.faint, padding: 4 }}><X size={20} /></span>
        </div>

        {car?.fare_cents === 0 && (
          <Note C={C} bad>Aucun tarif n'est réglé pour cette ligne — impossible d'ouvrir une place.</Note>
        )}

        <div style={{ padding: "6px 0" }}>
          {Array.from({ length: car?.capacity ?? 0 }, (_, i) => {
            const n = i + 1; const s = byNo.get(n);
            if (adding === n) return (
              <div key={n} style={{ padding: "11px 18px", borderBottom: `1px solid ${C.ruleSoft}`, background: C.strip }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.ink2, marginBottom: 7 }}>PLACE {n}</div>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du passager"
                  style={inp(C)} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone (facultatif)"
                  inputMode="tel" style={{ ...inp(C), marginTop: 7 }} />
                <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                  <button disabled={busy} onClick={() => openSeat(n)} style={btn(C, "dark")}>Ajouter</button>
                  <button onClick={() => { setAdding(null); setName(""); setPhone(""); }} style={btn(C, "ghost")}>Annuler</button>
                </div>
              </div>
            );
            if (!s) return (
              <div key={n} onClick={() => car?.fare_cents ? setAdding(n) : null}
                style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 18px",
                  borderBottom: `1px solid ${C.ruleSoft}`, cursor: car?.fare_cents ? "pointer" : "default", opacity: car?.fare_cents ? 1 : .4 }}>
                <Dot C={C} kind="empty">{n}</Dot>
                <span style={{ color: C.faint, fontSize: 14 }}>Place libre — toucher pour remplir</span>
              </div>
            );
            return (
              <div key={n}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px",
                  borderBottom: pay?.seat === s.id ? "none" : `1px solid ${C.ruleSoft}` }}>
                <Dot C={C} kind={s.status === "paid" ? "paid" : "owing"}>{n}</Dot>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.name ?? `Place ${n}`}
                    {s.channel === "app" && <span style={{ fontSize: 10, fontWeight: 800, color: C.ink2, background: C.strip, border: `1px solid ${C.line}`, borderRadius: 5, padding: "1.5px 6px", marginLeft: 7 }}>APP</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.ink2, marginTop: 1 }}>
                    {s.status === "paid"
                      ? <>Payé {s.method === "card" ? "par carte" : "par Interac"} · <code>{s.reference}</code></>
                      : <>À encaisser · {money(s.fare_cents)} · réf. <code>{s.reference}</code></>}
                  </div>
                </div>
                {s.status === "paid" ? (
                  <span style={{ color: C.green, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800 }}>
                    <Check size={15} /> {money(s.fare_cents)}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                    <PayBtn C={C} title="Carte — créer le lien de paiement" onClick={() => cardLink(s)} />
                    <Mini C={C} label="Interac" title="Virement Interac reçu" onClick={() => markPaid(s, "interac")}><Smartphone size={15} /></Mini>
                    <Mini C={C} label="Libérer" title="Libérer la place" danger onClick={() => release(s)}><Trash2 size={15} /></Mini>
                  </div>
                )}
                </div>
                {pay?.seat === s.id && (
                  <div style={{ padding: "11px 18px 13px 59px", background: C.strip, borderBottom: `1px solid ${C.ruleSoft}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>
                      Lien de paiement — {money(s.fare_cents)}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.ink2, wordBreak: "break-all", background: C.sheet,
                      border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" }}>{pay.url}</div>
                    <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                      <button onClick={() => { navigator.clipboard?.writeText(pay.url); setCopied(true); }}
                        style={btn(C, "ghost")}><Copy size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                        {copied ? "Copié" : "Copier"}</button>
                      {s.phone && <button disabled={busy} onClick={() => textLink(s, pay.url)} style={btn(C, "dark")}>
                        Texter au {s.phone}</button>}
                      <button onClick={() => setPay(null)} style={btn(C, "ghost")}>Fermer</button>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 9, lineHeight: 1.5 }}>
                      Le passager paie sur son téléphone. <b>Ne marquez rien à la main</b> — la place
                      passe à « payé » d'elle-même dès que Stripe confirme, et c'est cette
                      confirmation qui sert de preuve au moment de payer le chauffeur.
                      Le lien expire dans 30 minutes.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "13px 18px", borderTop: `1px solid ${C.line}`, background: C.strip }}>
          <Row C={C} k={`Encaissé par LoadQ · ${paid.length} place(s)`} v={money(gross)} />
          <Row C={C} k={`Frais LoadQ · ${money(fee)} × ${paid.length}`} v={"−" + money(paid.length * fee)} dim />
          <Row C={C} k="Revient au chauffeur" v={money(Math.max(0, toDriver))} big />
          <div style={{ fontSize: 11.5, color: C.ink2, lineHeight: 1.5, marginTop: 8 }}>
            Le frais est <b>pris dans le tarif, non ajouté</b> : une place à {money(car?.fare_cents ?? 3000)} verse
            {" "}{money(Math.max(0, (car?.fare_cents ?? 3000) - fee))} au chauffeur. L'argent va à LoadQ —
            jamais dans la main du chauffeur — et lui est versé après le départ.
          </div>
        </div>

        <div style={{ padding: "13px 18px", borderTop: `1px solid ${C.line}` }}>
          {owing.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.amber, fontWeight: 700, marginBottom: 9 }}>
              {owing.length} place(s) non encaissée(s) — la voiture ne peut pas partir.
            </div>
          )}
          <button disabled={busy || owing.length > 0 || paid.length === 0} onClick={depart}
            style={{ ...btn(C, "dark"), width: "100%", padding: "13px 0", fontSize: 15,
              opacity: busy || owing.length > 0 || paid.length === 0 ? .4 : 1 }}>
            Partir — figer {money(gross)}
          </button>
        </div>

        {msg && <Note C={C} bad={msg.bad}>{msg.t}</Note>}
      </div>
    </Overlay>
  );
}

// ── the frozen record, shown the moment the car goes ──────────────────────────────────────
export function DepartureReceipt({ receipt, entryId, C, onClose }: {
  receipt: any; entryId: string; C: Pal; onClose: () => void;
}) {
  const [sent, setSent] = useState<string | null>(receipt?.receipt_sent_at ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const r = receipt ?? {};

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("loadq-driver-receipt", { body: { entry_id: entryId } });
    setBusy(false);
    if (error || !data?.ok) return setMsg(data?.error ?? error?.message ?? "envoi impossible");
    setSent(new Date().toISOString());
    setMsg(`Reçu envoyé à ${r.driver ?? "le chauffeur"}.`);
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ background: C.sheet, color: C.ink, borderRadius: 16, width: "min(460px, 94vw)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 18px 13px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.5 }}>Load<span style={{ color: "#FF8A1A" }}>Q</span></div>
          <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>Départ enregistré · {r.driver}</div>
        </div>
        <div style={{ padding: "13px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 16px", fontSize: 12.5, borderBottom: `1px solid ${C.line}` }}>
          <Meta C={C} k="Date et heure" v={fmt(r.departed_at)} />
          <Meta C={C} k="Trajet" v={`${r.zone ?? "—"} → ${r.destination ?? "—"}`} />
          <Meta C={C} k="Véhicule" v={r.vehicle ?? "—"} />
          <Meta C={C} k="Plaque" v={r.plate ?? "—"} />
        </div>
        <div style={{ padding: "12px 18px" }}>
          <Row C={C} k={`Encaissé · ${r.seats ?? 0} place(s)`} v={money(r.gross_cents ?? 0)} />
          <Row C={C} k="Frais LoadQ" v={"−" + money(r.fee_cents ?? 0)} dim />
          <Row C={C} k="Versé au chauffeur" v={money(r.net_cents ?? 0)} big />
          <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 7, lineHeight: 1.5 }}>
            Dont {money(r.fee_tax_cents ?? 0)} de {r.tax_label ?? "taxe"} contenue dans le frais.
            Ce montant est figé : changer un réglage plus tard ne le modifiera pas.
          </div>
        </div>
        <div style={{ padding: "13px 18px", borderTop: `1px solid ${C.line}` }}>
          <button disabled={busy} onClick={send} style={{ ...btn(C, sent ? "ghost" : "dark"), width: "100%", padding: "12px 0" }}>
            {sent ? "Renvoyer le reçu au chauffeur" : "Envoyer le reçu au chauffeur"}
          </button>
          {msg && <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 9, textAlign: "center" }}>{msg}</div>}
          <button onClick={onClose} style={{ ...btn(C, "ghost"), width: "100%", padding: "11px 0", marginTop: 8 }}>Fermer</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── small pieces ──────────────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
// The seat number sits beside the glyph rather than inside it: the glyph is a seat, not a
// badge, and the app draws it the same way.
function Dot({ C, kind, children }: { C: Pal; kind: "paid" | "owing" | "empty"; children: React.ReactNode }) {
  const col = kind === "paid" ? C.green : kind === "owing" ? C.amber : C.line;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none", width: 42 }}>
      <SeatGlyph w={22} state={kind === "empty" ? "free" : kind}
        color={{ paid: C.green, owing: C.amber, free: C.line }} />
      <span style={{ fontWeight: 800, fontSize: 11.5, color: col }}>{children}</span>
    </span>
  );
}
function Row({ C, k, v, big, dim }: { C: Pal; k: string; v: string; big?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: big ? "8px 0 2px" : "3px 0", borderTop: big ? `1px solid ${C.line}` : undefined, marginTop: big ? 6 : 0 }}>
      <span style={{ fontSize: big ? 14 : 12.5, color: dim ? C.ink2 : C.ink, fontWeight: big ? 700 : 400 }}>{k}</span>
      <span style={{ fontSize: big ? 17 : 13, fontWeight: big ? 800 : 600, color: dim ? C.red : C.ink, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}
function Meta({ C, k, v }: { C: Pal; k: string; v: string }) {
  return (<div><div style={{ fontSize: 10, letterSpacing: .5, textTransform: "uppercase", color: C.faint }}>{k}</div>
    <div style={{ fontWeight: 600, marginTop: 1 }}>{v}</div></div>);
}
// Actions are azure across the product; green is reserved for a settled state, which is why
// the button that ASKS for money is not the colour that means "paid".

// Collecting the money is the whole job of this row, so it gets the only coloured control.
//
// The icon is a CARD, deliberately. A coin or a banknote would be the one thing this button
// never means: LoadQ does not take cash, and loadq_seat_mark_paid rejects it outright. It
// creates a Stripe card link, so it shows a card.
function PayBtn({ C, onClick, title }: { C: Pal; onClick: () => void; title: string }) {
  return (
    <span title={title} onClick={onClick}
      style={{ minWidth: 58, padding: "5px 10px 4px", borderRadius: 9,
        background: AZURE + "1A", border: `1.5px solid ${AZURE}`, color: AZURE,
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 2, cursor: "pointer" }}>
      <CreditCard size={18} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .3 }}>PAYER</span>
    </span>
  );
}

function Mini({ C, children, onClick, title, danger, label }: { C: Pal; children: React.ReactNode; onClick: () => void; title: string; danger?: boolean; label?: string }) {
  return (
    <span title={title} onClick={onClick}
      style={{ minWidth: 52, padding: "5px 8px 4px", borderRadius: 9, border: `1px solid ${C.line}`,
        display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 1, cursor: "pointer", color: danger ? C.red : C.ink }}>
      {children}
      {label && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .2 }}>{label}</span>}
    </span>
  );
}
function Note({ C, children, bad }: { C: Pal; children: React.ReactNode; bad?: boolean }) {
  return (<div style={{ margin: "0 18px 13px", padding: "9px 11px", borderRadius: 9, fontSize: 12.5, lineHeight: 1.5,
    background: bad ? "#FEF2F2" : C.strip, border: `1px solid ${bad ? "#FEE2E2" : C.line}`, color: bad ? "#991B1B" : C.ink2 }}>{children}</div>);
}
const inp = (C: Pal) => ({ width: "100%", padding: "10px 11px", borderRadius: 9, border: `1px solid ${C.line}`,
  background: C.sheet, color: C.ink, fontSize: 15, outline: "none" } as const);
const btn = (C: Pal, k: "dark" | "ghost") => ({
  border: k === "dark" ? "none" : `1px solid ${C.line}`, borderRadius: 10, padding: "10px 15px",
  background: k === "dark" ? C.ink : "transparent", color: k === "dark" ? C.sheet : C.ink,
  fontSize: 14, fontWeight: 700, cursor: "pointer" } as const);
const fmt = (s?: string) => s ? new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";

// The database speaks in codes so it can be checked; the sheet speaks to a person.
function errText(e?: string) {
  return ({
    seat_taken: "Cette place est déjà prise.",
    seat_is_paid: "Une place payée ne se libère pas — il faut un remboursement.",
    bad_method: "Carte ou Interac seulement — pas d'argent comptant.",
    no_fare_for_route: "Aucun tarif réglé pour cette ligne.",
    no_vehicle_on_entry: "Ce chauffeur n'a pas de véhicule sur la feuille.",
    seat_out_of_range: "Cette voiture n'a pas autant de places.",
    unpaid_seats: "Des places ne sont pas encaissées.",
    forbidden: "Ce compte ne peut pas écrire cette feuille.",
    not_a_list_writer: "Ce compte ne peut pas écrire cette feuille.",
  } as Record<string, string>)[e ?? ""] ?? (e ?? "erreur");
}
