"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { org } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";

// Business account details — phone, email, and business address are REQUIRED.
// The shipper layout gates the whole portal here until these are complete.
export default function Account() {
  const { active } = useOrg();
  const { t } = useLang();
  const router = useRouter();
  const [a, setA] = useState<any | null>(null);
  const [f, setF] = useState({ phone: "", email: "", address: "", city: "", postal: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    org.account(active.org_id).then((r) => {
      setA(r);
      setF({ phone: r?.phone || "", email: r?.billing_email || "", address: r?.address || "", city: r?.city || "", postal: r?.postal || "" });
    }).catch(() => setA(null));
  }, [active.org_id]);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const incomplete = a && !a.complete;
  const canEdit = a?.role === "owner" || a?.role === "admin";

  const errMsg = (e: string) => ({
    phone_required: t("Phone number is required.", "Le numéro de téléphone est requis."),
    email_required: t("Email address is required.", "L’adresse courriel est requise."),
    address_required: t("Business address is required.", "L’adresse d’affaires est requise."),
    forbidden: t("Only an owner or admin can edit account details.", "Seul un propriétaire ou administrateur peut modifier ces détails."),
  } as Record<string, string>)[e] || e;

  const save = async () => {
    if (!f.phone.trim() || !f.email.trim() || !f.address.trim()) {
      setErr(t("Phone, email and business address are all required.", "Téléphone, courriel et adresse d’affaires sont tous requis.")); return;
    }
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await org.accountSave(active.org_id, f);
      setA(r); setMsg(t("Saved.", "Enregistré."));
      if (incomplete) { router.replace("/shipper"); } // completion gate satisfied
    } catch (e: any) { setErr(errMsg(String(e?.message || "").replace(/^.*: /, "")) || t("Failed.", "Échec.")); }
    setBusy(false);
  };

  if (!a) return <div style={{ padding: 24 }}>{t("Loading…", "Chargement…")}</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>{t("Account details", "Détails du compte")}</h1>
      <div className="sub">{a.name}</div>

      {incomplete ? (
        <div className="card" style={{ marginTop: 12, background: "#FBF3F7", border: "1px solid #f0d8e5" }}>
          <b>⚠️ {t("Complete your account to continue", "Complétez votre compte pour continuer")}</b>
          <div className="sub" style={{ marginTop: 4 }}>{t("A phone number, email address and business address are required for every Kolis Business account.", "Un numéro de téléphone, une adresse courriel et une adresse d’affaires sont requis pour chaque compte Kolis Business.")}</div>
        </div>
      ) : null}

      {!canEdit ? (
        <div className="warn" style={{ marginTop: 12 }}>{t("Only an owner or admin can edit these details — ask them to complete the account.", "Seul un propriétaire ou administrateur peut modifier ces détails.")}</div>
      ) : null}

      <div className="card" style={{ marginTop: 12, opacity: canEdit ? 1 : 0.6 }}>
        <div className="mono">{t("Phone number *", "Numéro de téléphone *")}</div>
        <input className="input" value={f.phone} disabled={!canEdit} onChange={(e) => set("phone", e.target.value)} placeholder="+1 613 555 0192" inputMode="tel" />
        <div className="mono" style={{ marginTop: 10 }}>{t("Email address *", "Adresse courriel *")}</div>
        <input className="input" type="email" value={f.email} disabled={!canEdit} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" />
        <div className="mono" style={{ marginTop: 10 }}>{t("Business address *", "Adresse d’affaires *")}</div>
        <input className="input" value={f.address} disabled={!canEdit} onChange={(e) => set("address", e.target.value)} placeholder={t("Street, unit", "Rue, unité")} />
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <div style={{ flex: 2 }}><div className="mono">{t("City", "Ville")}</div><input className="input" value={f.city} disabled={!canEdit} onChange={(e) => set("city", e.target.value)} /></div>
          <div style={{ flex: 1 }}><div className="mono">{t("Postal", "Code postal")}</div><input className="input" value={f.postal} disabled={!canEdit} onChange={(e) => set("postal", e.target.value)} /></div>
        </div>
        {err ? <div className="warn" style={{ marginTop: 10 }}>{err}</div> : null}
        {msg ? <div className="pill pg" style={{ display: "inline-block", marginTop: 10 }}>{msg}</div> : null}
        {canEdit ? (
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy} onClick={save}>{busy ? t("Saving…", "Enregistrement…") : incomplete ? t("Save & continue", "Enregistrer et continuer") : t("Save", "Enregistrer")}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
