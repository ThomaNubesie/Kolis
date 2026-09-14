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

export type Seat = {
  id: string; seat_no: number; name: string | null; phone: string | null;
  channel: "app" | "point"; method: "card" | "interac" | null;
  status: "awaiting" | "paid"; fare_cents: number; reference: string; paid_at: string | null;
};
export type CarSeats = { entry_id: string; capacity: number; fare_cents: number; seats: Seat[] };
type Pal = { ink: string; ink2: string; faint: string; line: string; rule: string;
  ruleSoft: string; sheet: string; strip: string; green: string; red: string; amber: string };

export const money = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " $";

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
    <div onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, cursor: "pointer" }}>
      {Array.from({ length: car.capacity }, (_, i) => {
        const s = byNo.get(i + 1);
        const bg = !s ? "transparent" : s.status === "paid" ? C.green : "transparent";
        const bd = !s ? C.line : s.status === "paid" ? C.green : C.amber;
        return (
          <span key={i} title={s ? `${s.name ?? "Place " + (i + 1)} — ${s.status === "paid" ? "payé" : "à encaisser"}` : `Place ${i + 1} libre`}
            style={{ width: 19, height: 19, borderRadius: "50%", border: `1.5px solid ${bd}`,
              background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 9.5, fontWeight: 800, color: s?.status === "paid" ? "#fff" : bd }}>
            {s ? (s.name?.trim()?.[0]?.toUpperCase() ?? "•") : ""}
          </span>
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
    const ref = method === "interac"
      ? window.prompt(`Virement reçu pour ${s.name ?? "place " + s.seat_no}.\nNuméro de référence Interac :`, s.reference)
      : window.prompt(`Paiement par carte pour ${s.name ?? "place " + s.seat_no}.\nRéférence Stripe :`, s.reference);
    if (ref === null) return;
    const d = await run(() => supabase.rpc("loadq_seat_mark_paid", {
      p_seat: s.id, p_method: method, p_reference: ref.trim() || s.reference,
    }).then((r) => r.data));
    if (!d?.ok) say(errText(d?.error), true);
  };

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
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px", borderBottom: `1px solid ${C.ruleSoft}` }}>
                <Dot C={C} kind={s.status === "paid" ? "paid" : "owing"}>{s.name?.trim()?.[0]?.toUpperCase() ?? String(n)}</Dot>
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
                  <div style={{ display: "flex", gap: 6 }}>
                    <Mini C={C} title="Virement Interac reçu" onClick={() => markPaid(s, "interac")}><Smartphone size={15} /></Mini>
                    <Mini C={C} title="Payé par carte" onClick={() => markPaid(s, "card")}><CreditCard size={15} /></Mini>
                    <Mini C={C} title="Libérer la place" danger onClick={() => release(s)}><Trash2 size={15} /></Mini>
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
function Dot({ C, kind, children }: { C: Pal; kind: "paid" | "owing" | "empty"; children: React.ReactNode }) {
  const col = kind === "paid" ? C.green : kind === "owing" ? C.amber : C.line;
  return (
    <span style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", border: `1.5px solid ${col}`,
      background: kind === "paid" ? C.green : "transparent", color: kind === "paid" ? "#fff" : col,
      display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12.5 }}>
      {children}
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
function Mini({ C, children, onClick, title, danger }: { C: Pal; children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (<span title={title} onClick={onClick} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.line}`,
    display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: danger ? C.red : C.ink }}>{children}</span>);
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
