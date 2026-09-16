"use client";
// The passenger's page — admin.loadq.ca/t/LQ-XXXX
//
// Ottawa's PTC guide requires the platform to let a passenger "track the location and route of
// the PTC Vehicle" and to "provide the ability for the passenger to rate the PTC Driver and
// PTC Vehicle". A seat sold at a pickup point has no app and no account, so both work from the
// reference already printed on the receipt.
//
// That makes the reference a bearer token, which is why loadq_track_seat returns the driver's
// FIRST NAME only and nothing about payment or other seats. A passenger needs to identify
// their car, not trace a person.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Star, MapPin, Car, Clock, CheckCircle2 } from "lucide-react";

const AZURE = "#4C82F0";
const ORANGE = "#FF8A1A";
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " $";
const title = (s: string) => (s ?? "").replace(/\b\w/g, (m) => m.toUpperCase());

type Trip = {
  ok: boolean; error?: string;
  reference: string; status: "awaiting_payment" | "boarding" | "departed";
  seat_no: number; fare_cents: number; surcharge_cents: number;
  driver_first: string; driver_photo: string | null; driver_rating: number | null;
  make: string | null; model: string | null; colour: string | null;
  plate: string | null; year: number | null;
  origin: string; destination: string;
  distance_km: number | null; duration_minutes: number | null;
  departed_at: string | null;
  vehicle_lat: number | null; vehicle_lng: number | null; located_at: string | null;
  can_rate: boolean; rated: boolean;
};

export default function TrackPage({ params }: { params: { ref: string } }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stars, setStars] = useState(0);
  const [vstars, setVstars] = useState(0);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("loadq_track_seat", { p_reference: decodeURIComponent(params.ref) });
    setTrip(data as Trip);
  }, [params.ref]);

  useEffect(() => { load(); }, [load]);
  // The car moves. Before it leaves, so does the answer to "where is it?".
  useEffect(() => {
    if (!trip || trip.status === "departed") return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [trip, load]);

  const rate = async () => {
    if (!stars) return;
    setBusy(true);
    const { data } = await supabase.rpc("loadq_rate_seat", {
      p_reference: decodeURIComponent(params.ref),
      p_driver_stars: stars, p_vehicle_stars: vstars || null, p_comment: note.trim() || null,
    });
    setBusy(false);
    if (data?.ok) { setSent(true); load(); }
  };

  if (!trip) return <Shell><p style={{ color: "#6B7280" }}>Chargement…</p></Shell>;

  if (!trip.ok) return (
    <Shell>
      <h1 style={h1}>Introuvable</h1>
      <p style={{ color: "#6B7280", lineHeight: 1.6 }}>
        Aucune place ne correspond à cette référence. Vérifiez le code sur votre reçu.<br />
        <span style={{ color: "#9AA0A6" }}>No seat matches this reference. Check the code on your receipt.</span>
      </p>
    </Shell>
  );

  const car = [trip.year, trip.make, trip.model].filter(Boolean).join(" ");
  const maps = trip.vehicle_lat && trip.vehicle_lng
    ? `https://www.google.com/maps?q=${trip.vehicle_lat},${trip.vehicle_lng}`
    : null;

  return (
    <Shell>
      <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: -0.5, marginBottom: 2 }}>
        Load<span style={{ color: ORANGE }}>Q</span>
      </div>
      <div style={{ color: "#6B7280", fontSize: 13, marginBottom: 18 }}>
        Réf. <b style={{ color: "#15171C" }}>{trip.reference}</b> · Place {trip.seat_no}
      </div>

      <Badge status={trip.status} />

      {/* driver and vehicle — the by-law's pre-trip disclosure, still useful after */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          {trip.driver_photo
            ? <img src={trip.driver_photo} alt="" width={54} height={54}
                   style={{ borderRadius: "50%", objectFit: "cover", flex: "none" }} />
            : <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#EEF1F4",
                            display: "grid", placeItems: "center", flex: "none", fontWeight: 800,
                            color: "#6B7280", fontSize: 19 }}>{trip.driver_first?.[0] ?? "?"}</div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{trip.driver_first}</div>
            <div style={{ color: "#6B7280", fontSize: 13.5 }}>
              {car}{trip.colour ? ` · ${title(trip.colour)}` : ""}
            </div>
            {trip.plate && (
              <div style={{ display: "inline-block", marginTop: 4, border: "1.5px solid #15171C",
                            borderRadius: 5, padding: "1px 8px", fontWeight: 800, letterSpacing: 1 }}>
                {trip.plate}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={card}>
        <Row icon={<MapPin size={15} />} label="Trajet · Route"
             value={`${trip.origin} → ${title(trip.destination)}`} />
        {trip.distance_km != null && (
          <Row icon={<Car size={15} />} label="Distance" value={`${trip.distance_km} km`} />
        )}
        {trip.duration_minutes != null && (
          <Row icon={<Clock size={15} />} label="Durée · Duration"
               value={`${Math.floor(trip.duration_minutes / 60)} h ${trip.duration_minutes % 60} min`} />
        )}
        <Row icon={<span style={{ fontWeight: 800 }}>$</span>} label="Payé · Paid"
             value={`${money(trip.fare_cents)} (dont ${money(trip.surcharge_cents)} de supplément)`} />
      </div>

      {/* location — only meaningful before it goes */}
      {trip.status !== "departed" && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>Où est la voiture ? · Where is the car?</div>
          {maps ? (
            <>
              <a href={maps} target="_blank" rel="noopener noreferrer"
                 style={{ color: AZURE, fontWeight: 700, textDecoration: "none" }}>
                Voir sur la carte · View on map →
              </a>
              <div style={{ color: "#9AA0A6", fontSize: 12, marginTop: 4 }}>
                Position transmise {trip.located_at ? new Date(trip.located_at).toLocaleTimeString("fr-CA",
                  { hour: "2-digit", minute: "2-digit" }) : "—"} · mise à jour automatique
              </div>
            </>
          ) : (
            <div style={{ color: "#6B7280", fontSize: 13.5 }}>
              Le chauffeur ne transmet pas sa position pour l&apos;instant.<br />
              <span style={{ color: "#9AA0A6" }}>The driver is not sharing a location right now.</span>
            </div>
          )}
        </div>
      )}

      {/* rating — required by the guide, and only once the trip has happened */}
      {trip.can_rate && (
        <div style={card}>
          {trip.rated || sent ? (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#1F8A55", fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Merci pour votre évaluation. · Thank you for rating.
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 7 }}>Évaluer · Rate this trip</div>
              <Stars label="Chauffeur · Driver" value={stars} onChange={setStars} />
              <Stars label="Véhicule · Vehicle" value={vstars} onChange={setVstars} />
              <textarea value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Commentaire (facultatif) · Comment (optional)"
                style={{ width: "100%", marginTop: 9, minHeight: 64, padding: "9px 11px",
                         border: "1px solid #E5E7EB", borderRadius: 9, fontSize: 14,
                         fontFamily: "inherit", resize: "vertical" }} />
              <button disabled={!stars || busy} onClick={rate}
                style={{ marginTop: 9, width: "100%", padding: "12px 0", borderRadius: 10, border: 0,
                         background: stars ? AZURE : "#C9CDD4", color: "#fff", fontWeight: 800,
                         fontSize: 15, cursor: stars ? "pointer" : "default" }}>
                Envoyer · Send
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ color: "#9AA0A6", fontSize: 11.5, textAlign: "center", marginTop: 22, lineHeight: 1.7 }}>
        Concord Express Co Inc. o/a LoadQ · support@loadq.ca<br />
        Ottawa, Ontario, Canada
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7", padding: "26px 16px 40px",
                  fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
                  color: "#15171C" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Badge({ status }: { status: Trip["status"] }) {
  const map = {
    awaiting_payment: { t: "En attente de paiement · Awaiting payment", c: "#B4801F", b: "#FEF3C7" },
    boarding: { t: "Place confirmée · Seat confirmed", c: "#1F8A55", b: "#E7F5EE" },
    departed: { t: "Voyage terminé · Trip complete", c: "#4C82F0", b: "#E8EFFD" },
  }[status];
  return (
    <div style={{ background: map.b, color: map.c, fontWeight: 800, fontSize: 13,
                  padding: "9px 13px", borderRadius: 9, marginBottom: 13 }}>{map.t}</div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "5px 0", alignItems: "flex-start" }}>
      <span style={{ color: "#9AA0A6", marginTop: 2, width: 16, flex: "none" }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#6B7280", fontSize: 11.5 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <div style={{ color: "#6B7280", fontSize: 12.5, width: 130 }}>{label}</div>
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} onClick={() => onChange(n)} style={{ cursor: "pointer", lineHeight: 1 }}>
            <Star size={25} fill={n <= value ? ORANGE : "none"} color={n <= value ? ORANGE : "#C9CDD4"} />
          </span>
        ))}
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 19, margin: "0 0 8px" };
const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
  padding: "13px 15px", marginBottom: 11,
};
