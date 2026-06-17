"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

const SWATCHES = ["#0E9F6E", "#2563EB", "#E11D6B", "#7C3AED", "#F59E0B", "#0F172A", "#DC2626", "#0891B2"];

export default function Branding() {
  const { active } = useOrg();
  const { t } = useLang();
  const owner = active.role === "owner" || active.role === "admin";
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [color, setColor] = useState("#E11D6B");
  const [name, setName] = useState("");
  const [tracking, setTracking] = useState(true);
  const [emails, setEmails] = useState(true);
  const [poweredBy, setPoweredBy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    org.branding(active.org_id).then((b) => {
      if (!b) return;
      setLogo(b.logo_url ?? null); setColor(b.color || "#E11D6B"); setName(b.name || "");
      setTracking(b.tracking !== false); setEmails(b.emails !== false); setPoweredBy(b.powered_by !== false);
    }).catch(() => {});
  }, [active.org_id]);

  const upload = async (f: File) => {
    setBusy(true); setMsg("");
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      const path = `${active.org_id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("org-logos").upload(path, f, { upsert: true, contentType: f.type });
      if (error) throw error;
      const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
      setLogo(data.publicUrl);
    } catch (e: any) { setMsg(e?.message || t("Upload failed.", "Échec du téléversement.")); }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await org.setBranding(active.org_id, { logo_url: logo, color, name: name.trim() || null, tracking, emails, powered_by: poweredBy });
      setMsg(t("Saved — refresh to see it across the portal.", "Enregistré — actualisez pour le voir dans le portail."));
    } catch (e: any) { setMsg(e?.message || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  const Toggle = ({ on, set, label }: { on: boolean; set: (b: boolean) => void; label: string }) => (
    <div className="row" style={{ alignItems: "center", gap: 10, marginTop: 10 }}>
      <div onClick={() => owner && set(!on)} style={{ width: 46, height: 26, borderRadius: 13, background: on ? color : "#D7D7DE", position: "relative", cursor: owner ? "pointer" : "default", transition: "background .15s" }}>
        <div style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: "#fff" }} />
      </div>
      <span>{label}</span>
    </div>
  );

  if (!owner) return <><h1>{t("Branding", "Image de marque")}</h1><div className="sub">{t("Only owners and admins can edit branding.", "Seuls les propriétaires et administrateurs peuvent modifier l’image de marque.")}</div></>;

  return (
    <>
      <h1>{t("Branding", "Image de marque")}</h1>
      <div className="sub">{t("Your logo and color appear across your dashboard and everything your customers see.", "Votre logo et votre couleur apparaissent dans votre tableau de bord et dans tout ce que vos clients voient.")}</div>
      {msg ? <div className="pill pg" style={{ display: "inline-block", margin: "10px 0" }}>{msg}</div> : null}

      <div className="cols">
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <div className="mono">{t("Company logo", "Logo de l’entreprise")}</div>
          <div className="row" style={{ gap: 14, alignItems: "center", margin: "8px 0 4px" }}>
            <div style={{ width: 72, height: 72, borderRadius: 16, background: logo ? "#fff" : color, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {logo ? <img src={logo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ color: "#fff", fontWeight: 800, fontSize: 26 }}>{(name || "K")[0].toUpperCase()}</span>}
            </div>
            <div>
              <button className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>{logo ? t("Change logo", "Changer le logo") : t("Upload logo", "Téléverser un logo")}</button>
              {logo ? <button className="btn ghost" onClick={() => setLogo(null)} style={{ marginLeft: 6 }}>{t("Remove", "Retirer")}</button> : null}
              <div className="sub" style={{ fontSize: 11, marginTop: 4 }}>PNG / SVG · ≤ 1 MB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>

          <div className="mono" style={{ marginTop: 14 }}>{t("Brand color", "Couleur de marque")}</div>
          <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {SWATCHES.map((c) => <div key={c} onClick={() => setColor(c)} style={{ width: 38, height: 38, borderRadius: 10, background: c, cursor: "pointer", outline: color.toLowerCase() === c.toLowerCase() ? "3px solid var(--ink)" : "none", outlineOffset: 2 }} />)}
          </div>
          <input className="input" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 140, marginTop: 10 }} placeholder="#0E9F6E" />

          <div className="mono" style={{ marginTop: 14 }}>{t("Display name", "Nom affiché")}</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={active.name} />

          <Toggle on={tracking} set={setTracking} label={t("Brand the customer tracking page", "Personnaliser la page de suivi client")} />
          <Toggle on={emails} set={setEmails} label={t("Brand recipient emails", "Personnaliser les courriels aux destinataires")} />
          <Toggle on={poweredBy} set={setPoweredBy} label={t("Show “Powered by Kolis”", "Afficher « Propulsé par Kolis »")} />

          <button className="btn" style={{ marginTop: 18, background: color }} disabled={busy} onClick={save}>{busy ? "…" : t("Save branding", "Enregistrer")}</button>
        </div>

        {/* Live preview */}
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <div className="mono">{t("Preview — customer tracking", "Aperçu — suivi client")}</div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 18, marginTop: 8 }}>
            <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 12 }}>
              {logo ? <img src={logo} alt="" style={{ height: 26, objectFit: "contain" }} /> : <div style={{ fontWeight: 900, fontSize: 18, color }}>{name || active.name}</div>}
            </div>
            <div className="mono">{t("Tracking", "Suivi")}</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>#KL-9024</div>
            {["Requested", "Picked up", "Out for delivery"].map((s, i) => (
              <div key={s} className="row" style={{ alignItems: "center", gap: 10, marginTop: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: i < 2 ? "#178a5e" : color, color: "#fff", textAlign: "center", fontSize: 12, fontWeight: 800, lineHeight: "22px" }}>{i < 2 ? "✓" : ""}</div>
                <span style={{ fontWeight: i === 2 ? 800 : 500 }}>{s}</span>
              </div>
            ))}
            <div className="sub" style={{ marginTop: 14, fontSize: 11 }}>{t("Delivered by", "Livré par")} {name || active.name}{poweredBy ? " · powered by Kolis" : ""}</div>
          </div>
        </div>
      </div>
    </>
  );
}
