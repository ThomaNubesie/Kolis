"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// What a driver is actually told when a document is missing: who issues it, where, for how much,
// how long it takes. Sixty-five rows across Ontario, Québec and New Brunswick.
//
// Every value here was read off the issuing body's own page, and the first draft of this data —
// written from memory instead — had nine wrong values including three dead URLs and four phone
// numbers that belonged to nothing. So the fields are editable from here: when a force changes its
// fee, correcting it should not need a migration, and a blank is honest where nothing is published.
const PROVINCES = ["ON", "QC", "NB"] as const;

const DOC_LABEL: Record<string, [string, string]> = {
  drivers_license: ["Driver's licence", "Permis de conduire"],
  insurance: ["Insurance", "Assurance"],
  registration: ["Registration", "Immatriculation"],
  police_record_check: ["Police record check", "Vérification policière"],
  driving_record: ["Driving record", "Dossier de conduite"],
  charges_declaration: ["Charges declaration", "Déclaration d'accusations"],
  safety_certificate: ["Safety certificate", "Certificat de sécurité"],
};

type Src = {
  doc_type: string; province: string; city: string; also_for_province: string;
  org_en: string; org_fr: string; url: string | null; phone: string | null; address: string | null;
  cost_en: string | null; cost_fr: string | null;
  turnaround_en: string | null; turnaround_fr: string | null;
};

const FIELDS: [keyof Src, string, string][] = [
  ["phone", "Phone", "Téléphone"],
  ["address", "Address", "Adresse"],
  ["url", "Page", "Page"],
  ["cost_en", "Cost (EN)", "Coût (EN)"],
  ["cost_fr", "Cost (FR)", "Coût (FR)"],
  ["turnaround_en", "Turnaround (EN)", "Délai (EN)"],
  ["turnaround_fr", "Turnaround (FR)", "Délai (FR)"],
];

export default function DriverDocuments() {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [all, setAll] = useState<Src[]>([]);
  const [prov, setProv] = useState<string>("ON");
  const [city, setCity] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Src>>({});
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.docSourcesAll().then((d) => setAll((d as Src[]) || [])).catch(() => setAll([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cities = useMemo(
    () => [...new Set(all.filter((r) => r.province === prov && r.city).map((r) => r.city))].sort(),
    [all, prov]);

  const shown = useMemo(
    () => all.filter((r) => r.province === prov && r.city === city),
    [all, prov, city]);

  const key = (r: Src) => `${r.doc_type}|${r.province}|${r.city}`;

  const save = async (r: Src) => {
    setBusy(true);
    try {
      await api.docSourceEdit({
        p_doc_type: r.doc_type, p_province: r.province, p_city: r.city,
        p_phone: draft.phone ?? null, p_address: draft.address ?? null, p_url: draft.url ?? null,
        p_cost_en: draft.cost_en ?? null, p_cost_fr: draft.cost_fr ?? null,
        p_turnaround_en: draft.turnaround_en ?? null, p_turnaround_fr: draft.turnaround_fr ?? null,
      });
      setEditing(null); setDraft({}); load();
    } catch (e: any) { alert(e?.message || "failed"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 4 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
        {fr ? "Documents des chauffeurs" : "Driver documents"}
      </h1>
      <p style={{ color: "#667", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 720 }}>
        {fr
          ? "Ce que l'appli dit à un chauffeur pour chaque document manquant. Un champ vide est voulu : l'organisme ne publie rien, et mieux vaut ne rien afficher qu'un montant inventé."
          : "What the app tells a driver for each missing document. A blank field is deliberate — the issuing body publishes nothing, and showing nothing beats showing an invented figure."}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {PROVINCES.map((p) => (
          <button key={p} onClick={() => { setProv(p); setCity(""); }} style={{
            padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: "1px solid " + (prov === p ? "#111827" : "#e5e7eb"),
            background: prov === p ? "#111827" : "#fff", color: prov === p ? "#fff" : "#374151",
          }}>{p === "ON" ? "Ontario" : p === "QC" ? "Québec" : fr ? "Nouveau-Brunswick" : "New Brunswick"}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setCity("")} style={cityBtn(city === "")}>
          {fr ? "Règle provinciale" : "Province default"}
        </button>
        {cities.map((c) => (
          <button key={c} onClick={() => setCity(c)} style={cityBtn(city === c)}>{c}</button>
        ))}
      </div>

      {loading ? <p style={{ color: "#889" }}>{fr ? "Chargement…" : "Loading…"}</p>
        : shown.length === 0 ? <p style={{ color: "#889" }}>{fr ? "Rien pour cette sélection." : "Nothing for this selection."}</p>
        : (
        <div style={{ display: "grid", gap: 10 }}>
          {shown.map((r) => {
            const k = key(r);
            const open = editing === k;
            return (
              <div key={k} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: "#778", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {(DOC_LABEL[r.doc_type] || [r.doc_type, r.doc_type])[fr ? 1 : 0]}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>{fr ? r.org_fr : r.org_en}</div>
                  </div>
                  <button onClick={() => { setEditing(open ? null : k); setDraft(open ? {} : {}); }} style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    border: "1px solid #d1d5db", background: open ? "#f3f4f6" : "#fff", color: "#111827", height: 32,
                  }}>{open ? (fr ? "Annuler" : "Cancel") : (fr ? "Modifier" : "Edit")}</button>
                </div>

                {!open ? (
                  <div style={{ fontSize: 13, color: "#445", marginTop: 8, lineHeight: 1.6 }}>
                    {FIELDS.map(([f, en, frl]) => {
                      const v = r[f] as string | null;
                      return (
                        <div key={String(f)}>
                          <span style={{ color: "#889" }}>{fr ? frl : en}: </span>
                          {v ? String(v) : <em style={{ color: "#b45309" }}>{fr ? "non publié" : "not published"}</em>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {FIELDS.map(([f, en, frl]) => (
                      <label key={String(f)} style={{ fontSize: 12.5 }}>
                        <div style={{ color: "#778", fontWeight: 700, marginBottom: 3 }}>{fr ? frl : en}</div>
                        <input
                          defaultValue={(r[f] as string) || ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                        />
                      </label>
                    ))}
                    <div>
                      <button disabled={busy} onClick={() => save(r)} style={{
                        padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                        border: "1px solid #111827", background: "#111827", color: "#fff",
                      }}>{busy ? "…" : fr ? "Enregistrer" : "Save"}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const cityBtn = (on: boolean) => ({
  padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  border: "1px solid " + (on ? "#2563eb" : "#e5e7eb"),
  background: on ? "#eff6ff" : "#fff", color: on ? "#1d4ed8" : "#374151",
});
