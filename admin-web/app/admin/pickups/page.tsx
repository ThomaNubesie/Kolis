"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Pickup quotes that were priced and never paid — the working queue for calling people back.
//
// The reason this page exists is that the raw count lies. Twelve abandoned quotes looked like
// $2,708 of lost business; five of them were $250–$859 for a feeder leg, quoted to riders
// hundreds of kilometres outside the service area because the fare had no distance ceiling.
// Those people were never going to pay, and calling them back would waste the call. So the list
// separates them out rather than letting them inflate a total nobody can act on.
const money = (n: number) => "$" + Number(n || 0).toFixed(2);
const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
const tel = (p?: string | null) => (p || "").replace(/[^\d+]/g, "");

type Row = {
  id: string; asked_at: string; amount: number; destination: string | null;
  drop_point: string | null; client: string | null; phone: string | null;
  seats: number | null; reminders: number; pay_ref: string | null;
  pickup_from: string | null; distance_flag: string;
  followed_up_at: string | null; admin_note: string | null;
};

const TABS: [string, string, string][] = [
  ["callable", "Worth a call", "À rappeler"],
  ["out_of_range", "Out of range", "Hors zone"],
  ["done", "Followed up", "Relancés"],
  ["all", "All", "Tous"],
];

export default function AbandonedPickups() {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState("callable");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.abandonedPickups(180)
      .then((d) => setRows((d as Row[]) || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => rows.filter((r) => {
    if (tab === "all") return true;
    if (tab === "done") return !!r.followed_up_at;
    if (tab === "out_of_range") return r.distance_flag === "out_of_range_quote";
    return r.distance_flag !== "out_of_range_quote" && !r.followed_up_at;
  }), [rows, tab]);

  // The number that matters is what a callable quote was worth, not the sum of every row.
  const callable = rows.filter((r) => r.distance_flag !== "out_of_range_quote");
  const recoverable = callable.reduce((n, r) => n + Number(r.amount || 0), 0);
  const junk = rows.length - callable.length;

  const toggle = async (r: Row) => {
    setBusy(r.id);
    try { await api.pickupFollowup(r.id); load(); }
    catch (e: any) { alert(e?.message || "failed"); }
    finally { setBusy(null); }
  };

  return (
    <div style={{ padding: 4 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
        {fr ? "Ramassages abandonnés" : "Abandoned pickups"}
      </h1>
      <p style={{ color: "#667", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 680 }}>
        {fr
          ? "Des prix donnés, jamais payés. Chacun a déjà reçu jusqu'à deux rappels par SMS automatiques — ceux qui restent ici n'ont pas répondu."
          : "Quotes given and never paid. Each one already got up to two automatic SMS reminders — the ones left here did not answer."}
      </p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat label={fr ? "À rappeler" : "Worth a call"} value={String(callable.filter((r) => !r.followed_up_at).length)} />
        <Stat label={fr ? "Valeur récupérable" : "Recoverable value"} value={money(recoverable)} />
        <Stat label={fr ? "Hors zone (prix cassé)" : "Out of range (broken quote)"} value={String(junk)} tone="#b45309" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, en, frr]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
              border: "1px solid " + (tab === k ? "#111827" : "#e5e7eb"),
              background: tab === k ? "#111827" : "#fff", color: tab === k ? "#fff" : "#374151",
            }}
          >
            {fr ? frr : en}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#889" }}>{fr ? "Chargement…" : "Loading…"}</p>
      ) : shown.length === 0 ? (
        <p style={{ color: "#889" }}>{fr ? "Rien ici." : "Nothing here."}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {shown.map((r) => {
            const far = r.distance_flag === "out_of_range_quote";
            return (
              <div key={r.id} style={{
                border: "1px solid " + (far ? "#fde68a" : "#e5e7eb"), borderRadius: 12,
                padding: 14, background: far ? "#fffbeb" : "#fff",
                opacity: r.followed_up_at ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {r.client || (fr ? "(nom non donné)" : "(no name given)")}
                    </div>
                    <div style={{ fontSize: 13, color: "#556", marginTop: 2 }}>
                      {r.phone
                        ? <a href={`tel:${tel(r.phone)}`} style={{ color: "#2563eb", fontWeight: 600 }}>{r.phone}</a>
                        : (fr ? "aucun téléphone" : "no phone")}
                      {" · "}{when(r.asked_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: far ? "#b45309" : "#111827" }}>
                      {money(r.amount)}
                    </div>
                    <div style={{ fontSize: 12, color: "#778" }}>
                      {r.destination || "—"}{r.seats ? ` · ${r.seats} ${fr ? "place" : "seat"}${r.seats > 1 ? "s" : ""}` : ""}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12.5, color: "#667", marginTop: 8, lineHeight: 1.5 }}>
                  {r.pickup_from && <>{fr ? "Départ : " : "From: "}{r.pickup_from}<br /></>}
                  {r.drop_point && <>{fr ? "Vers le point : " : "To point: "}{r.drop_point} · </>}
                  {fr ? "réf " : "ref "}<code>{r.pay_ref}</code> · {r.reminders} {fr ? "rappels" : "reminders"}
                </div>

                {far && (
                  <div style={{ fontSize: 12.5, color: "#92400e", marginTop: 8, lineHeight: 1.5 }}>
                    {fr
                      ? "Prix hors zone : ce montant vient d'une course bien au-delà du rayon desservi. Le client n'a rien refusé — on lui a montré un prix impossible. Inutile de rappeler pour vendre ça."
                      : "Out-of-range quote: this came from a trip far beyond the area we serve. The customer did not decline — they were shown an impossible price. No point calling to sell it."}
                  </div>
                )}

                {r.admin_note && (
                  <div style={{ fontSize: 12.5, color: "#374151", marginTop: 8, fontStyle: "italic" }}>
                    “{r.admin_note}”
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => toggle(r)}
                    disabled={busy === r.id}
                    style={{
                      padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                      cursor: "pointer", border: "1px solid #d1d5db",
                      background: r.followed_up_at ? "#f3f4f6" : "#111827",
                      color: r.followed_up_at ? "#374151" : "#fff",
                    }}
                  >
                    {r.followed_up_at
                      ? (fr ? "Marquer à rappeler" : "Mark as to call")
                      : (fr ? "Marquer relancé" : "Mark followed up")}
                  </button>
                  {r.phone && (
                    <a href={`tel:${tel(r.phone)}`} style={{
                      padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                      border: "1px solid #d1d5db", background: "#fff", color: "#111827", textDecoration: "none",
                    }}>
                      {fr ? "Appeler" : "Call"}
                    </a>
                  )}
                  {r.followed_up_at && (
                    <span style={{ fontSize: 12, color: "#778", alignSelf: "center" }}>
                      {fr ? "relancé le " : "followed up "}{when(r.followed_up_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 16px", minWidth: 150 }}>
      <div style={{ fontSize: 11.5, color: "#778", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: tone || "#111827" }}>{value}</div>
    </div>
  );
}
