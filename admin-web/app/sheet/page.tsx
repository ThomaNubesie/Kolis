"use client";
// LoadQ — the daily sheet, for a tablet at the pickup point.
//
// The electronic version of the paper LOAD Q form: numbered rows, orange rules,
// one driver per line. It deliberately looks like the paper it replaces.
//
// Typing, not handwriting. Two or three letters and the matching drivers appear
// WITH their car — which is what tells the two Kia Sedona drivers apart, or the
// two Yannicks. The alias table means "sedrona", "pobosky" and "prince" all find
// the right person, and typos fall back to trigram matching.
//
// Gated on `loadq_can_write_list`, NOT on Kolis staff roles: the writer is Thomas
// or Dieudonné, and Dieudonné is not Kolis staff.
//
// Each (zone, destination) is its own numbered line — UG→Montréal #5 and
// UG→Québec #5 are different cars, which is why the picker sets both.
//
// It never replaces the line. Drivers also sign themselves in through the app, so
// every action here touches ONE row; a whole-line replace would delete a
// self-joined driver mid-load, which has already happened once.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getVehicleImageUrl } from "@/lib/vehicleImage";
import {
  Search, X, ArrowLeftRight, Undo2, LogOut, RefreshCw, KeyRound,
  UserPlus, ShieldAlert, WifiOff, Camera, Check, Sun, SunMoon, Moon,
} from "lucide-react";

// Three themes, chosen on the tablet and remembered there. A parking lot at
// midday and a car at dusk are different rooms, so the writer picks.
//   light  — like the printed form; most legible in direct sun
//   medium — LoadQ black header, white rows: brand up top, paper below
//   dark   — the LoadQ app palette, easiest on the eyes at night
export type ThemeName = "light" | "medium" | "dark";
export type Palette = {
  ink: string; ink2: string; faint: string; line: string; rule: string;
  ruleSoft: string; bg: string; sheet: string; band: string; bandInk: string;
  strip: string; loadRow: string; green: string; red: string; amber: string;
};

const THEMES: Record<ThemeName, Palette> = {
  light: {
    ink: "#1A1917", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA",
    rule: "#D2601A", ruleSoft: "#F5E4D6", bg: "#F4F1EC", sheet: "#FFFFFF",
    band: "#D2601A", bandInk: "#FFFFFF", strip: "#FDF7F2", loadRow: "#F2FAF5",
    green: "#1F8A55", red: "#B4431F", amber: "#B4801F",
  },
  medium: {
    ink: "#1A1917", ink2: "#6B6863", faint: "#A8A29A", line: "#EAE4DA",
    rule: "#F97316", ruleSoft: "#EFE7DE", bg: "#F4F1EC", sheet: "#FFFFFF",
    band: "#0B0C0F", bandInk: "#F97316", strip: "#FBF7F3", loadRow: "#F2FAF5",
    green: "#1F8A55", red: "#B4431F", amber: "#B4801F",
  },
  dark: {
    ink: "#FFFFFF", ink2: "#8A909C", faint: "#6B7280", line: "#232833",
    rule: "#F97316", ruleSoft: "#232833", bg: "#000000", sheet: "#0B0C0F",
    band: "#0B0C0F", bandInk: "#F97316", strip: "#12141A", loadRow: "#141A16",
    green: "#34D399", red: "#F87171", amber: "#FBBF24",
  },
};

const ThemeCtx = createContext<Palette>(THEMES.medium);
const useC = () => useContext(ThemeCtx);

function useThemeName(): [ThemeName, (t: ThemeName) => void] {
  const [name, setName] = useState<ThemeName>("medium");
  useEffect(() => {
    try {
      const v = localStorage.getItem("loadq-sheet-theme") as ThemeName | null;
      if (v && THEMES[v]) setName(v);
    } catch { /* private browsing — keep the default */ }
  }, []);
  const set = (t: ThemeName) => {
    setName(t);
    try { localStorage.setItem("loadq-sheet-theme", t); } catch { /* ignore */ }
  };
  return [name, set];
}

type Row = {
  entry_id: string; position: number; status: string; driver_id: string; name: string;
  make: string | null; model: string | null; color: string | null; seats: number | null;
  plate: string | null; car: string | null; placeholder_plate: boolean;
  verified: boolean; self_joined: boolean; added_by_name: string | null;
  return_zone: string | null;
};
type Line = {
  zone_id: string; zone_name: string | null; destination: string;
  destination_name: string; cars: number; seats: number; trips_30d: number;
};
type Hit = {
  driver_id: string; name: string; car: string | null; make: string | null; model: string | null;
  color: string | null; seats: number | null; has_car: boolean; matched_alias: string | null;
  on_line: string | null; fuzzy?: boolean; blocked?: boolean;
  vehicles: { vehicle_id: string; car: string; plate: string; color: string; seats: number; is_default: boolean }[];
};

export default function SheetPage() {
  const [theme, setTheme] = useThemeName();
  return (
    <ThemeCtx.Provider value={THEMES[theme]}>
      <Sheet theme={theme} setTheme={setTheme} />
    </ThemeCtx.Provider>
  );
}

function Sheet({ theme, setTheme }: { theme: ThemeName; setTheme: (t: ThemeName) => void }) {
  const C = useC();
  const [me, setMe] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [line, setLine] = useState<Line | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; bad?: boolean } | null>(null);
  const [newFor, setNewFor] = useState<string | null>(null);   // prefilled name for onboarding

  const say = (msg: string, opts: { undo?: () => void; bad?: boolean } = {}) => {
    setToast({ msg, ...opts });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), opts.undo ? 10000 : 4500);
  };

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setReady(true); return; }
      const { data } = await supabase.rpc("loadq_list_writer_me");
      setMe(data);
      if (data?.can_write) {
        const { data: ls } = await supabase.rpc("loadq_sheet_lines");
        const list = (ls ?? []) as Line[];
        setLines(list);
        setLine(list[0] ?? null);
      }
      setReady(true);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!line) return;
    const { data } = await supabase.rpc("loadq_sheet", { p_zone: line.zone_id, p_dest: line.destination });
    setRows((data ?? []) as Row[]);
  }, [line]);

  useEffect(() => { load(); }, [load]);

  // The sheet is shared: someone else may add, and drivers sign themselves in.
  useEffect(() => {
    if (!line) return;
    const ch = supabase.channel(`sheet_${line.zone_id}_${line.destination}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () => load())
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [line, load]);

  if (!ready) return <Center><span style={{ color: C.faint }}>Chargement…</span></Center>;
  if (!me) return <SignIn />;
  if (!me.can_write) return (
    <Center>
      <b style={{ fontSize: 19 }}>Pas d'accès à la feuille</b>
      <div style={{ color: C.ink2, marginTop: 8, maxWidth: 400, textAlign: "center", lineHeight: 1.55 }}>
        Ce compte ne peut pas écrire la feuille du jour. Demandez à Thomas de vous ajouter.
      </div>
      <SignOut />
    </Center>
  );

  const nextPos = (rows.reduce((m, r) => Math.max(m, r.position), 0) || 0) + 1;

  const depart = async (r: Row) => {
    if (!confirm(`Rayer ${r.name} ? Cela le marque comme parti.`)) return;
    setBusy(true);
    const { data } = await supabase.rpc("loadq_list_depart", { p_entry: r.entry_id });
    setBusy(false);
    if (!data?.ok) return say(err(data?.error), { bad: true });
    await load();
    const u = data.undo;
    say(`${r.name} — parti`, {
      undo: async () => {
        await supabase.rpc("loadq_list_add", {
          p_zone: u.zone, p_dest: u.dest, p_driver: u.driver_id, p_vehicle: u.vehicle_id, p_pos: u.position,
        });
        setToast(null); load();
      },
    });
  };

  const move = async (r: Row) => {
    const to = window.prompt(`Déplacer ${r.name} du #${r.position} vers quel numéro ?`);
    if (!to || !/^\d+$/.test(to.trim())) return;
    let code: string | null = null;
    if (!me.is_admin) {
      code = window.prompt("Code d'autorisation (change deux fois par jour) :");
      if (!code) return;
    }
    setBusy(true);
    const { data } = await supabase.rpc("loadq_list_move", {
      p_entry: r.entry_id, p_new_pos: Number(to.trim()), p_code: code,
    });
    setBusy(false);
    if (!data?.ok) {
      return say(data?.error === "too_many_attempts"
        ? `Trop de codes erronés. Réessayez dans ${data.retry_after_minutes} min.` : err(data?.error), { bad: true });
    }
    say(`${data.driver} : #${data.from} → #${data.to}`);
    load();
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 12, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif", color: C.ink }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", background: C.sheet, borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,.10)" }}>

        <div style={{ background: C.band, color: C.bandInk, padding: "13px 18px", display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: .5 }}>LOAD Q</div>
          <select
            value={line ? `${line.zone_id}|${line.destination}` : ""}
            onChange={(e) => setLine(lines.find((l) => `${l.zone_id}|${l.destination}` === e.target.value) ?? null)}
            style={{ background: "rgba(255,255,255,.16)", color: C.bandInk, border: 0, borderRadius: 9, padding: "8px 11px", fontSize: 14.5, fontWeight: 700, outline: "none", maxWidth: 380 }}>
            {lines.map((l) => (
              <option key={`${l.zone_id}|${l.destination}`} value={`${l.zone_id}|${l.destination}`} style={{ color: C.ink }}>
                {(l.zone_name ?? l.zone_id)} → {l.destination_name}{l.cars ? ` (${l.cars})` : ""}
              </option>
            ))}
          </select>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 13, fontSize: 13.5 }}>
            {!online && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.22)", borderRadius: 8, padding: "5px 10px", fontWeight: 700 }}><WifiOff size={14} /> hors ligne</span>}
            <span style={{ opacity: .9 }}>{new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}</span>
            {me.is_admin && <AdminCode />}
            <ThemeSwitch theme={theme} setTheme={setTheme} />
            <RefreshCw size={17} style={{ cursor: "pointer", opacity: busy ? .4 : .9 }} onClick={load} />
          </div>
        </div>

        <div style={{ padding: "9px 18px", background: C.strip, borderBottom: `1px solid ${C.ruleSoft}`, fontSize: 13.5, color: C.ink2, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <span><b style={{ color: C.ink }}>{rows.length}</b> voitures</span>
          <span><b style={{ color: C.ink }}>{rows.reduce((a, r) => a + (r.seats ?? 0), 0)}</b> places</span>
          <span>{rows.find((r) => r.status === "loading")
            ? <><b style={{ color: C.green }}>{rows.find((r) => r.status === "loading")!.name}</b> en chargement</>
            : "personne en chargement"}</span>
          <span style={{ marginLeft: "auto" }}>écrit par <b style={{ color: C.ink }}>{me.name}</b></span>
        </div>

        {!online && (
          <div style={{ background: "#FDF4F1", borderBottom: `1px solid ${C.ruleSoft}`, padding: "10px 18px", fontSize: 13.5, color: C.red, display: "flex", alignItems: "center", gap: 9 }}>
            <ShieldAlert size={16} /> Hors ligne — la liste affichée peut être périmée et rien ne peut être enregistré. Notez sur papier.
          </div>
        )}

        <div>
          {rows.map((r) => {
            const img = getVehicleImageUrl(r.make, r.model, r.color);
            return (
              <div key={r.entry_id} style={{
                display: "grid", gridTemplateColumns: "54px 104px 1fr auto", alignItems: "center",
                borderBottom: `1px solid ${C.ruleSoft}`, minHeight: 70,
                background: r.status === "loading" ? C.loadRow : C.sheet,
              }}>
                <div style={{ textAlign: "center", fontWeight: 800, fontSize: 17, color: C.rule, borderRight: `1px solid ${C.ruleSoft}`, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>{r.position}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 6px" }}>
                  {img
                    ? <img src={img} alt="" style={{ width: 92, height: "auto" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                    : <span style={{ fontSize: 11, color: C.faint }}>—</span>}
                </div>
                <div style={{ padding: "7px 12px", minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.name}
                    {r.status === "loading" && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: C.green, borderRadius: 5, padding: "2px 7px", marginLeft: 8 }}>EN CHARGEMENT</span>}
                    {!r.verified && <span title="non vérifié" style={{ fontSize: 10.5, fontWeight: 800, color: C.amber, background: "#FBF2DF", borderRadius: 5, padding: "2px 7px", marginLeft: 6 }}>NON VÉRIFIÉ</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink2, marginTop: 1 }}>
                    {r.car ?? "—"}{r.color ? ` · ${r.color}` : ""}{r.seats != null ? ` · ${r.seats} places` : ""}
                    {r.placeholder_plate && <span style={{ color: C.amber }}> · plaque provisoire</span>}
                    {r.self_joined
                      ? <span style={{ color: C.faint }}> · inscrit via l'app</span>
                      : r.added_by_name ? <span style={{ color: C.faint }}> · ajouté par {r.added_by_name}</span> : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, padding: "0 12px" }}>
                  <IconBtn title="Déplacer" onClick={() => move(r)} disabled={!online}><ArrowLeftRight size={17} /></IconBtn>
                  <IconBtn title="Rayer (parti)" danger onClick={() => depart(r)} disabled={!online}><X size={19} /></IconBtn>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div style={{ padding: 26, textAlign: "center", color: C.faint, fontSize: 14 }}>Personne sur cette ligne.</div>}
        </div>

        {line && (
          <AddRow line={line} nextPos={nextPos} disabled={!online}
            onAdded={(m, bad) => { say(m, { bad }); load(); }}
            onNew={(name) => setNewFor(name)} />
        )}
      </div>

      {newFor !== null && line && (
        <NewDriver initialName={newFor} line={line} nextPos={nextPos}
          onClose={() => setNewFor(null)}
          onDone={(m, bad) => { setNewFor(null); say(m, { bad }); load(); }} />
      )}

      {toast && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 20, background: toast.bad ? C.red : C.ink, color: "#fff", borderRadius: 11, padding: "13px 17px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 10px 30px rgba(0,0,0,.3)", fontSize: 14.5, maxWidth: "92vw", zIndex: 50 }}>
          <span>{toast.msg}</span>
          {toast.undo && <span onClick={toast.undo} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#FFB27A", fontWeight: 800, cursor: "pointer" }}><Undo2 size={15} /> Annuler</span>}
        </div>
      )}
    </div>
  );
}

/* --------------------------- add an existing driver ---------------------- */
function AddRow({ line, nextPos, disabled, onAdded, onNew }: {
  line: Line; nextPos: number; disabled: boolean;
  onAdded: (m: string, bad?: boolean) => void; onNew: (name: string) => void;
}) {
  const C = useC();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      const { data } = await supabase.rpc("loadq_search_drivers", { p_q: q.trim(), p_limit: 6 });
      setHits((data ?? []) as Hit[]); setSearched(true);
    }, 170);
  }, [q]);

  const add = async (h: Hit, vehicleId?: string) => {
    if (!h.has_car) return onAdded(`${h.name} n'a pas de voiture enregistrée.`, true);
    setBusy(true);
    const { data } = await supabase.rpc("loadq_list_add", {
      p_zone: line.zone_id, p_dest: line.destination, p_driver: h.driver_id,
      p_vehicle: vehicleId ?? null, p_pos: nextPos,
    });
    setBusy(false); setQ(""); setHits([]); setSearched(false);
    box.current?.focus();
    if (!data?.ok) return onAdded(data?.error === "already_queued" ? `${h.name} est déjà en file.` : err(data?.error), true);
    onAdded(`${h.name} ajouté au #${data.position}`);
  };

  return (
    <div style={{ position: "relative", borderTop: `2px solid ${C.rule}`, opacity: disabled ? .5 : 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "54px 1fr", alignItems: "center", minHeight: 62 }}>
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 17, color: C.faint }}>{nextPos}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
          <Search size={18} style={{ color: C.faint, flex: "0 0 auto" }} />
          <input ref={box} value={q} onChange={(e) => setQ(e.target.value)} disabled={busy || disabled}
            placeholder="Ajouter un chauffeur — tapez un nom…"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            style={{ border: 0, outline: 0, fontSize: 17, width: "100%", padding: "16px 0", background: "transparent", color: C.ink }} />
          {q && <X size={18} style={{ color: C.faint, cursor: "pointer" }} onClick={() => { setQ(""); setHits([]); setSearched(false); }} />}
        </div>
      </div>

      {(hits.length > 0 || (searched && q.trim().length >= 2)) && (
        <div style={{ position: "absolute", left: 54, right: 8, bottom: "100%", background: C.sheet, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 -10px 30px rgba(0,0,0,.15)", overflow: "hidden", zIndex: 20 }}>
          {hits.map((h) => (
            <div key={h.driver_id} style={{ borderBottom: `1px solid ${C.line}` }}>
              <div onClick={() => (h.vehicles?.length > 1 || h.on_line) ? null : add(h)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: h.on_line ? "default" : "pointer", opacity: h.on_line ? .55 : 1 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>
                    {h.name}
                    {h.matched_alias && <span style={{ fontSize: 11.5, color: C.ink2, fontWeight: 500 }}> · « {h.matched_alias} »</span>}
                    {h.fuzzy && <span style={{ fontSize: 11, color: C.faint }}> ≈</span>}
                  </div>
                  <div style={{ fontSize: 13, color: h.has_car ? C.ink2 : C.red, marginTop: 1 }}>
                    {h.has_car ? `${h.car} · ${h.color ?? "—"} · ${h.seats} places` : "aucune voiture enregistrée"}
                    {h.on_line && <span style={{ color: C.red }}> · déjà en file</span>}
                  </div>
                </div>
                {h.vehicles?.length <= 1 && !h.on_line && <span style={{ fontSize: 22, color: C.rule, fontWeight: 300 }}>+</span>}
              </div>
              {h.vehicles?.length > 1 && !h.on_line && (
                <div style={{ display: "flex", gap: 8, padding: "0 14px 12px", flexWrap: "wrap" }}>
                  {h.vehicles.map((v) => (
                    <span key={v.vehicle_id} onClick={() => add(h, v.vehicle_id)}
                      style={{ border: `1px solid ${v.is_default ? C.rule : C.line}`, background: v.is_default ? "#FDF3EC" : "#fff", borderRadius: 9, padding: "7px 11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {v.car} · {v.color} · {v.seats}p{v.is_default ? " ★" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div onClick={() => onNew(q.trim())}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", cursor: "pointer", color: C.rule, fontWeight: 800, fontSize: 14.5, background: C.strip }}>
            <UserPlus size={17} /> {hits.length ? "Nouvelle personne…" : `Aucun résultat — inscrire « ${q.trim()} »`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ new driver ------------------------------- */
function NewDriver({ initialName, line, nextPos, onClose, onDone }: {
  initialName: string; line: Line; nextPos: number;
  onClose: () => void; onDone: (m: string, bad?: boolean) => void;
}) {
  const C = useC();
  const [f, setF] = useState({
    name: initialName, phone: "", email: "", make: "", model: "", color: "", seats: "",
    plate: "", license_number: "", license_expires: "",
  });
  const [docs, setDocs] = useState<{ license?: string; insurance?: string }>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Photos need a driver id for the storage path, which does not exist until the
  // driver is created — so they are held here and uploaded straight after.
  const [pending, setPending] = useState<{ license?: File; insurance?: File }>({});
  const pick = (kind: "license" | "insurance") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPending((p) => ({ ...p, [kind]: file }));
    setDocs((d) => ({ ...d, [kind]: file.name }));
  };

  const submit = async () => {
    if (!f.name.trim()) return setMsg("Le nom est requis.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setMsg("Un courriel valide est requis.");
    if (!Number(f.seats)) return setMsg("Le nombre de places est requis.");
    setBusy(true); setMsg("");

    const { data, error } = await supabase.functions.invoke("loadq-onboard-driver", {
      body: {
        zone: line.zone_id, dest: line.destination, position: nextPos,
        name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim(),
        make: f.make.trim() || null, model: f.model.trim() || null, color: f.color.trim() || null,
        seats: Number(f.seats), plate: f.plate.trim() || null,
        alias: initialName && initialName.toLowerCase() !== f.name.trim().toLowerCase() ? initialName : null,
        license_number: f.license_number.trim() || null,
        license_expires: f.license_expires || null,
      },
    });
    if (error || !data?.ok) { setBusy(false); return setMsg(data?.detail || data?.error || error?.message || "Échec."); }

    // Upload the photos now that we have the driver's folder, then register them.
    for (const kind of ["license", "insurance"] as const) {
      const file = pending[kind]; if (!file) continue;
      const docType = kind === "license" ? "drivers_license" : "insurance";
      const path = `${data.driver_id}/${docType}.jpg`;
      const up = await supabase.storage.from("driver-docs").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (!up.error) {
        await supabase.rpc("loadq_list_doc_submit", {
          p_driver: data.driver_id, p_doc_type: docType, p_storage_path: path,
          p_expires_on: kind === "license" ? (f.license_expires || null) : null,
          p_doc_number: kind === "license" ? (f.license_number.trim() || null) : null,
        });
      }
    }
    setBusy(false);
    onDone(`${f.name.trim()} inscrit et ajouté au #${data.position ?? nextPos}`);
  };

  const L = ({ children }: any) => <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .7, textTransform: "uppercase", color: C.faint, margin: "0 0 6px" }}>{children}</div>;
  const I = (k: string, ph = "", type = "text") => (
    <input value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} type={type}
      style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 13px", fontSize: 15.5, width: "100%", outline: "none", marginBottom: 13, background: C.sheet, color: C.ink }} />
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,25,23,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflow: "auto", zIndex: 60 }}>
      <div style={{ width: "100%", maxWidth: 900, background: C.sheet, borderRadius: 16, marginTop: 20, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 4px", display: "flex", alignItems: "baseline", gap: 11 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>Nouveau chauffeur</div>
          <div style={{ fontSize: 13.5, color: C.faint }}>il sera le #{nextPos}</div>
          <X size={22} style={{ marginLeft: "auto", cursor: "pointer", color: C.faint }} onClick={onClose} />
        </div>
        <div style={{ padding: "12px 22px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
          <div>
            <L>Nom complet *</L>{I("name")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
              <div><L>Téléphone</L>{I("phone", "613 555 0148", "tel")}</div>
              <div><L>Courriel *</L>{I("email", "nom@exemple.com", "email")}</div>
            </div>
            <L>Voiture *</L>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr", gap: 11 }}>
              {I("make", "Honda")}{I("model", "Odyssey")}{I("color", "Gray")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
              <div><L>Plaque</L>{I("plate", "sinon provisoire")}</div>
              <div><L>Places passagers *</L>{I("seats", "7", "number")}</div>
            </div>
          </div>
          <div>
            <L>Documents</L>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(["license", "insurance"] as const).map((k) => (
                <label key={k} style={{ border: `2px ${docs[k] ? "solid" : "dashed"} ${docs[k] ? C.green : "#D6CFC3"}`, background: docs[k] ? "#F1FAF4" : "#FCFAF7", borderRadius: 12, padding: 16, textAlign: "center", cursor: "pointer", display: "block" }}>
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pick(k)} />
                  {docs[k] ? <Check size={22} color={C.green} /> : <Camera size={22} color={C.faint} />}
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{k === "license" ? "Permis de conduire" : "Assurance"}</div>
                  <div style={{ fontSize: 12, color: docs[k] ? C.green : C.faint, marginTop: 2, fontWeight: docs[k] ? 700 : 400 }}>
                    {docs[k] ? "✓ photo prise" : "toucher pour photographier"}
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 14 }}>
              <div><L>N° de permis</L>{I("license_number")}</div>
              <div><L>Expire</L>{I("license_expires", "", "date")}</div>
            </div>
            <div style={{ background: "#FBF6EF", border: "1px solid #EFE0CC", borderRadius: 11, padding: "12px 14px", fontSize: 13, color: "#7A6A55", lineHeight: 1.55 }}>
              Les photos vont dans la <b>même file de vérification</b> que tous les chauffeurs. Il reste <b>non vérifié</b> jusqu'à votre approbation.
              Un compte est créé avec <b>son courriel</b> — il pourra se connecter et terminer sa vérification. La <b>carte grise</b> restera à fournir.
            </div>
          </div>
        </div>
        {msg && <div style={{ padding: "0 22px 10px", color: C.red, fontSize: 13.5 }}>{msg}</div>}
        <div style={{ borderTop: `1px solid ${C.line}`, padding: "14px 22px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <div onClick={onClose} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 22px", fontWeight: 800, fontSize: 14.5, color: C.ink2, cursor: "pointer" }}>Annuler</div>
          <div onClick={busy ? undefined : submit} style={{ background: C.rule, color: "#fff", borderRadius: 10, padding: "13px 22px", fontWeight: 800, fontSize: 14.5, cursor: "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Création…" : `Créer et ajouter au #${nextPos}`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */
// Sun / half / moon. The writer picks by what the light is actually doing.
function ThemeSwitch({ theme, setTheme }: { theme: ThemeName; setTheme: (t: ThemeName) => void }) {
  const opts: [ThemeName, any][] = [["light", Sun], ["medium", SunMoon], ["dark", Moon]];
  return (
    <span style={{ display: "inline-flex", background: "rgba(255,255,255,.16)", borderRadius: 8, padding: 2 }}>
      {opts.map(([t, Icon]) => (
        <span key={t} onClick={() => setTheme(t)} title={t}
          style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", display: "inline-flex",
            background: theme === t ? "rgba(255,255,255,.22)" : "transparent", opacity: theme === t ? 1 : .65 }}>
          <Icon size={15} />
        </span>
      ))}
    </span>
  );
}

function AdminCode() {
  const C = useC();
  const [code, setCode] = useState<string | null>(null);
  const [mins, setMins] = useState<number | null>(null);
  const show = async () => {
    const { data } = await supabase.rpc("loadq_admin_code_current");
    if (data?.ok) { setCode(data.code); setMins(data.expires_in_minutes); }
  };
  return (
    <span onClick={show} title="Code d'autorisation pour les déplacements"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", background: "rgba(255,255,255,.18)", borderRadius: 8, padding: "5px 10px", fontWeight: 800, letterSpacing: code ? 2 : 0 }}>
      <KeyRound size={15} />{code ?? "code"}
      {code && mins != null && <span style={{ fontWeight: 500, letterSpacing: 0, opacity: .85, fontSize: 11.5 }}>{Math.floor(mins / 60)}h{String(mins % 60).padStart(2, "0")}</span>}
    </span>
  );
}

function SignIn() {
  const C = useC();
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [sent, setSent] = useState(false); const [msg, setMsg] = useState("");
  const send = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    if (error) setMsg(error.message); else { setSent(true); setMsg(""); }
  };
  const verify = async () => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) setMsg(error.message); else location.reload();
  };
  const inp: any = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 14px", fontSize: 16, width: 290, outline: "none", background: "#fff", color: C.ink };
  return (
    <Center>
      <div style={{ fontWeight: 900, fontSize: 23, color: C.rule, letterSpacing: .5 }}>LOAD Q</div>
      <div style={{ color: C.ink2, margin: "6px 0 18px" }}>Feuille du jour — connectez-vous pour écrire</div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Votre courriel" disabled={sent}
        style={inp} onKeyDown={(e) => e.key === "Enter" && send()} />
      {sent && <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code à 6 chiffres"
        style={{ ...inp, marginTop: 10, textAlign: "center", letterSpacing: 4, fontWeight: 800 }}
        onKeyDown={(e) => e.key === "Enter" && verify()} />}
      <div onClick={sent ? verify : send} style={{ marginTop: 12, background: C.rule, color: "#fff", borderRadius: 10, padding: "13px 22px", fontWeight: 800, cursor: "pointer", textAlign: "center", minWidth: 210 }}>
        {sent ? "Se connecter" : "Envoyer le code"}
      </div>
      {msg && <div style={{ color: C.red, fontSize: 13, marginTop: 10, maxWidth: 320, textAlign: "center" }}>{msg}</div>}
    </Center>
  );
}
function SignOut() {
  const C = useC();
  return <div onClick={async () => { await supabase.auth.signOut(); location.reload(); }}
    style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 7, color: C.ink2, fontWeight: 700, cursor: "pointer", fontSize: 13.5 }}>
    <LogOut size={15} /> Se déconnecter</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  const C = useC();
  return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,Inter,Segoe UI,Roboto,sans-serif", color: C.ink }}>{children}</div>;
}
function IconBtn({ children, onClick, danger, title, disabled }: any) {
  const C = useC();
  return <span title={title} onClick={disabled ? undefined : onClick}
    style={{ width: 42, height: 42, borderRadius: 10, border: `1px solid ${danger ? "#F0D5CB" : C.line}`, background: danger ? "#FDF4F1" : C.sheet, color: danger ? C.red : C.ink2, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .45 : 1 }}>{children}</span>;
}

// Backend errors are machine codes; never show them raw on a tablet.
function err(code?: string) {
  const m: Record<string, string> = {
    not_a_list_writer: "Vous n'avez pas le droit d'écrire cette feuille.",
    already_queued: "Ce chauffeur est déjà en file.",
    position_taken: "Ce numéro est déjà pris.",
    no_active_vehicle: "Ce chauffeur n'a pas de voiture enregistrée.",
    bad_code: "Code incorrect.",
    not_found: "Introuvable.",
    rejected: "Refusé par le système.",
  };
  return m[code ?? ""] ?? "Une erreur est survenue. Réessayez.";
}
