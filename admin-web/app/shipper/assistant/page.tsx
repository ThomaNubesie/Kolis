"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org-context";
import { useLang } from "@/lib/i18n";
import AssistantChat from "@/components/AssistantChat";

const RANK: Record<string, number> = { free: 0, business: 1, pro: 2 };

export default function Assistant() {
  const { active } = useOrg();
  const { t } = useLang();
  const router = useRouter();
  const [plan, setPlan] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.rpc("kolis_org_plan", { p_org: active.org_id }).then(
      ({ data }) => setPlan(((Array.isArray(data) ? data[0] : data) as any)?.plan || "free"),
      () => setPlan("free"),
    );
  }, [active.org_id]);
  const isBiz = plan !== undefined && (RANK[plan] ?? 0) >= 1;

  const perks: [string, string][] = [
    ["Answers about your shipments, clients, invoices & analytics", "Répond sur vos envois, clients, factures et statistiques"],
    ["Creates shipments and sends emails — with your confirmation", "Crée des envois et envoie des courriels — après votre confirmation"],
    ["Manages sales prospects and drafts follow-ups", "Gère les prospects et rédige des relances"],
    ["One floating “Ask AI” button on every page", "Un bouton « Demander à l'IA » sur chaque page"],
  ];

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Sparkles size={22} color="var(--accent,#E11D6B)" />
        <h1 style={{ margin: 0 }}>{t("Assistant", "Assistant")}</h1>
      </div>
      <div className="sub" style={{ marginBottom: 12 }}>{t(
        "Ask about your shipments, clients, invoices and prospects — or ask me to create a shipment or send an email. I'll always ask you to confirm before anything is created or sent.",
        "Posez des questions sur vos envois, clients, factures et prospects — ou demandez-moi de créer un envoi ou d'envoyer un courriel. Je demande toujours votre confirmation avant toute action.")}</div>

      {plan === undefined ? (
        <div className="center" style={{ padding: 40, color: "#9b97a6" }}>{t("Loading…", "Chargement…")}</div>
      ) : isBiz ? (
        <AssistantChat variant="page" />
      ) : (
        // Teaser for Basic — visible but not active; upsell to Business.
        <div className="card" style={{ maxWidth: 560, background: "linear-gradient(180deg,#FBF3F7,#fff)", border: "1px solid #F3D6E4", padding: 22 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(225,29,107,.12)", color: "#B21561", fontWeight: 800, fontSize: 12, padding: "4px 10px", borderRadius: 20, marginBottom: 12 }}>
            <Sparkles size={14} /> {t("Business feature", "Fonction Business")}
          </div>
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{t("Meet your AI assistant", "Voici votre assistant IA")}</h2>
          <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.6, color: "#3a3744" }}>{t(
            "An assistant that knows your whole account and helps you run shipping — ask questions in plain language and let it do the busywork.",
            "Un assistant qui connaît tout votre compte et vous aide à gérer vos expéditions — posez vos questions en langage naturel et laissez-le faire le travail.")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
            {perks.map(([en, fr], i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, color: "#3a3744" }}>
                <Check size={17} color="#16A34A" style={{ flex: "none", marginTop: 1 }} />{t(en, fr)}
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" onClick={() => router.push("/shipper/plans")}>{t("Upgrade to Business", "Passer à Business")}</button>
            <button className="btn ghost" onClick={() => router.push("/shipper/plans")}>{t("See plans", "Voir les forfaits")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
