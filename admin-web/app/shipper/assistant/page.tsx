"use client";
import { Sparkles } from "lucide-react";
import { useLang } from "@/lib/i18n";
import AssistantChat from "@/components/AssistantChat";

export default function Assistant() {
  const { t } = useLang();
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Sparkles size={22} color="var(--accent,#E11D6B)" />
        <h1 style={{ margin: 0 }}>{t("Assistant", "Assistant")}</h1>
      </div>
      <div className="sub" style={{ marginBottom: 12 }}>{t(
        "Ask about your shipments, clients, invoices and prospects — or ask me to create a shipment or send an email. I'll always ask you to confirm before anything is created or sent.",
        "Posez des questions sur vos envois, clients, factures et prospects — ou demandez-moi de créer un envoi ou d'envoyer un courriel. Je demande toujours votre confirmation avant toute action.")}</div>
      <AssistantChat variant="page" />
    </div>
  );
}
