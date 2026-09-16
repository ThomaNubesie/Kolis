"use client";
// The driver's identification card — admin.loadq.ca/card
//
// Ottawa's PTC guide: "Private Transportation Company shall ensure to every PTC Driver that
// meets the requirements of this By-law and that is affiliated with the PTC a current and
// up-to-date identification card in written or accessible electronic form."
//
// Two words in that sentence shape this page. "Current and up-to-date" — so the card is drawn
// from live conformity every time it loads, never issued once and forgotten; if a document
// lapses the card says so instead of lying. "Electronic form" — so a phone screen is the
// card, and it prints cleanly if an officer wants paper.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, AlertTriangle } from "lucide-react";

const ORANGE = "#FF8A1A";
const INK = "#0B0C0F";

type Card = {
  ok: boolean; error?: string;
  card_number: string; name: string; photo: string | null;
  affiliated_with: string; affiliated_since: string;
  vehicle: string | null;
  documents_complete: boolean;
  valid_until: string | null;
  missing: string[] | null;
  issued_at: string;
};

const LABEL: Record<string, string> = {
  drivers_license: "permis de conduire", insurance: "assurance",
  registration: "immatriculation", police_record_check: "vérification des antécédents",
  driving_record: "relevé de conduite", charges_declaration: "déclaration",
  safety_certificate: "certificat de sécurité",
};

export default function CardPage() {
  const [card, setCard] = useState<Card | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (!session) return;
      const { data } = await supabase.rpc("loadq_driver_id_card");
      setCard(data as Card);
    })();
  }, []);

  if (signedIn === false) return (
    <Shell><p style={{ color: "#6B7280", lineHeight: 1.6 }}>
      Connectez-vous dans l&apos;application LoadQ pour afficher votre carte.<br />
      <span style={{ color: "#9AA0A6" }}>Sign in to the LoadQ app to display your card.</span>
    </p></Shell>
  );
  if (!card) return <Shell><p style={{ color: "#6B7280" }}>Chargement…</p></Shell>;
  if (!card.ok) return <Shell><p style={{ color: "#B4431F" }}>{card.error}</p></Shell>;

  const valid = card.documents_complete;

  return (
    <Shell>
      <div style={{ background: INK, color: "#fff", borderRadius: 16, overflow: "hidden",
                    boxShadow: "0 10px 34px rgba(0,0,0,.22)" }}>
        <div style={{ padding: "16px 18px 13px", borderBottom: "1px solid #232833",
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.5 }}>
              Load<span style={{ color: ORANGE }}>Q</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#8A909C", marginTop: 1, letterSpacing: .4 }}>
              CARTE D&apos;IDENTITÉ · PTC DRIVER IDENTIFICATION
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: "#8A909C", textAlign: "right", lineHeight: 1.5 }}>
            {card.card_number}
          </div>
        </div>

        <div style={{ padding: "16px 18px", display: "flex", gap: 15, alignItems: "center" }}>
          {card.photo
            ? <img src={card.photo} alt="" width={78} height={78}
                   style={{ borderRadius: 11, objectFit: "cover", flex: "none" }} />
            : <div style={{ width: 78, height: 78, borderRadius: 11, background: "#232833",
                            display: "grid", placeItems: "center", flex: "none",
                            fontSize: 27, fontWeight: 800, color: "#6B7280" }}>
                {card.name?.[0] ?? "?"}
              </div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{card.name}</div>
            {card.vehicle && (
              <div style={{ color: "#8A909C", fontSize: 13, marginTop: 3 }}>{card.vehicle}</div>
            )}
            <div style={{ color: "#8A909C", fontSize: 11.5, marginTop: 5 }}>
              Affilié depuis · Affiliated since{" "}
              {new Date(card.affiliated_since).toLocaleDateString("fr-CA",
                { year: "numeric", month: "short" })}
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 18px 16px", borderTop: "1px solid #232833" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9,
                        color: valid ? "#34D399" : "#FBBF24", fontWeight: 700, fontSize: 13.5 }}>
            {valid ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
            {valid ? "Documents à jour · Documents current" : "Carte non valide · Card not valid"}
          </div>
          {valid ? (
            card.valid_until && (
              <div style={{ color: "#8A909C", fontSize: 11.5, marginTop: 4 }}>
                Valide jusqu&apos;au · Valid until{" "}
                {new Date(card.valid_until).toLocaleDateString("fr-CA",
                  { year: "numeric", month: "long", day: "numeric" })}
              </div>
            )
          ) : (
            <div style={{ color: "#8A909C", fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Manquant · Missing:{" "}
              {(card.missing ?? []).map((m) => LABEL[m] ?? m).join(", ")}
            </div>
          )}
          <div style={{ color: "#4B5563", fontSize: 10.5, marginTop: 9, lineHeight: 1.5 }}>
            {card.affiliated_with}<br />
            Émise · Issued {new Date(card.issued_at).toLocaleString("fr-CA",
              { dateStyle: "short", timeStyle: "short" })}
          </div>
        </div>
      </div>

      <p style={{ color: "#6B7280", fontSize: 11.5, lineHeight: 1.7, marginTop: 15, textAlign: "center" }}>
        Présentez cette carte sur demande d&apos;un agent de la Ville d&apos;Ottawa.<br />
        <span style={{ color: "#9AA0A6" }}>
          Present this card on request by a City of Ottawa officer.
        </span><br />
        Règlement · By-law 2016-272
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7", padding: "28px 16px 40px",
                  fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
                  color: "#15171C" }}>
      <div style={{ maxWidth: 400, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
