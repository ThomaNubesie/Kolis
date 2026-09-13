"use client";
// LoadQ operating switches — admin.loadq.ca/settings
//
// Every gate built into LoadQ is a row in loadq_settings: whether new drivers must sign the
// engagement, whether the $100 is enforced, how long each grace period runs. Until now none
// of them had an interface, so changing how long a driver has to pay meant a developer at a
// psql prompt. That is not a thing an operator should need.
//
// The catalogue lives in the database (loadq_setting_defs) rather than here, so a new switch
// appears on this page without a deploy — and so the page cannot offer a key that does not
// exist. Values are validated server-side in loadq_admin_set_setting; this page only asks.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Setting = {
  key: string; kind: "bool" | "int" | "date"; group: string;
  label_en: string; label_fr: string; help_en: string; help_fr: string;
  min: number | null; max: number | null;
  value: string | null; updated_at: string | null;
};

export default function SettingsPage() {
  const [rows, setRows] = useState<Setting[] | null>(null);
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const [flash, setFlash] = useState<string>("");

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setErr("Sign in as an admin to change these."); setRows([]); return; }
    const { data, error } = await supabase.rpc("loadq_admin_settings");
    if (error) { setErr(error.message); setRows([]); return; }
    if (!data?.ok) { setErr("You are not an admin on this account."); setRows([]); return; }
    setErr(""); setRows(data.settings as Setting[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (s: Setting, value: string) => {
    setBusy(s.key); setFlash("");
    const { data, error } = await supabase.rpc("loadq_admin_set_setting", { p_key: s.key, p_value: value });
    setBusy("");
    if (error) { setErr(error.message); return; }
    if (!data?.ok) { setErr(`${s.label_en}: ${data?.error ?? "rejected"}`); return; }
    setErr(""); setFlash(`${s.label_en} → ${data.value}`);
    setRows((r) => r?.map((x) => x.key === s.key ? { ...x, value: data.value } : x) ?? r);
    setTimeout(() => setFlash(""), 2600);
  };

  if (rows === null) return <div style={S.wrap}><div style={S.muted}>Loading…</div></div>;

  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.logo}>Load<span style={{ color: "#FF8A1A" }}>Q</span></span>
        <span style={S.crumb}>Operating switches</span>
      </div>

      {err && <div style={S.err}>{err}</div>}
      {flash && <div style={S.ok}>✓ {flash}</div>}

      {groups.map((g) => (
        <div key={g} style={S.group}>
          <div style={S.gname}>{g}</div>
          {rows.filter((r) => r.group === g).map((s) => (
            <div key={s.key} style={S.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.label}>{s.label_en}</div>
                <div style={S.help}>{s.help_en}</div>
                <div style={S.key}>{s.key}{s.updated_at ? ` · changed ${new Date(s.updated_at).toLocaleDateString()}` : ""}</div>
              </div>
              <div style={S.ctl}>
                {s.kind === "bool" ? (
                  <button
                    onClick={() => save(s, s.value === "true" ? "false" : "true")}
                    disabled={busy === s.key}
                    style={{ ...S.toggle, background: s.value === "true" ? "#12A150" : "#C9CCD4" }}
                    aria-label={s.label_en}
                  >
                    <span style={{ ...S.knob, transform: s.value === "true" ? "translateX(22px)" : "translateX(2px)" }} />
                  </button>
                ) : (
                  <input
                    defaultValue={s.value ?? ""}
                    onBlur={(e) => { if (e.target.value !== (s.value ?? "")) save(s, e.target.value); }}
                    inputMode={s.kind === "int" ? "numeric" : "text"}
                    placeholder={s.kind === "date" ? "YYYY-MM-DD" : ""}
                    style={S.input}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={S.foot}>
        Changes take effect immediately — the gates read these on every check.
        Turning a gate on before drivers have been notified will lock them out.
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap:  { maxWidth: 620, margin: "0 auto", padding: "18px 16px 60px",
           fontFamily: "-apple-system,'Segoe UI',Roboto,Arial,sans-serif", color: "#15171C" },
  head:  { display: "flex", alignItems: "center", gap: 10, paddingBottom: 12,
           borderBottom: "1px solid #E6E9E7", marginBottom: 16 },
  logo:  { fontSize: 20, fontWeight: 900, letterSpacing: -0.5 },
  crumb: { fontSize: 13, color: "#6B7280", fontWeight: 700 },
  group: { marginBottom: 22 },
  gname: { fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
           color: "#98A0AE", margin: "0 2px 8px" },
  row:   { display: "flex", alignItems: "flex-start", gap: 14, padding: "13px 0",
           borderBottom: "1px solid #EFF1F4" },
  label: { fontSize: 14.5, fontWeight: 700 },
  help:  { fontSize: 12.5, color: "#5A6273", lineHeight: 1.45, marginTop: 2 },
  key:   { fontSize: 10.5, color: "#A8A29A", marginTop: 4, fontFamily: "ui-monospace,Menlo,monospace" },
  ctl:   { flex: "none", paddingTop: 2 },
  toggle:{ width: 46, height: 26, borderRadius: 20, border: "none", position: "relative",
           cursor: "pointer", padding: 0, transition: "background .15s" },
  knob:  { position: "absolute", top: 2, left: 0, width: 22, height: 22, borderRadius: "50%",
           background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "transform .15s" },
  input: { width: 116, padding: "9px 10px", fontSize: 14, borderRadius: 9,
           border: "1.5px solid #E0E6F0", textAlign: "right", fontFamily: "inherit" },
  err:   { background: "#FDECEA", border: "1px solid #F5C6C2", color: "#B4231A",
           borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 14 },
  ok:    { background: "#EAF7F0", border: "1px solid #9FD9BE", color: "#1F7A4D",
           borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 14, fontWeight: 700 },
  foot:  { fontSize: 12, color: "#6B7280", lineHeight: 1.55, borderTop: "1px solid #E6E9E7",
           paddingTop: 12 },
  muted: { color: "#98A0AE", fontSize: 14 },
};
