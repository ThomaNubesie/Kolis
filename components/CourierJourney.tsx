// On-the-road view of a picked-up parcel (design E-2): the journey so far — pickup
// and each stop with its photo and "Partager la carte" — and the delivery as the
// open step. Shown while the courier is more than 25 km from the drop-off; within
// 25 km the carrying screen switches to the delivery flow by itself. "Livrer
// maintenant" switches early (GPS off, wrong coordinates, short trip), and the
// delivery view has a way back here.
import { View, Text, Pressable, Image, Share } from "react-native";
import { Navigation, Check } from "lucide-react-native";
import { Colors } from "../constants/colors";
import { CourierAPI, Journey, JourneyEvent } from "../services/courier";

const fmt = (iso: string, fr: boolean) => {
  try { return new Date(iso).toLocaleTimeString(fr ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

export function CourierJourney({ j, fr, distanceKm, onDeliver, onDirections }: {
  j: Journey; fr: boolean; distanceKm: number | null; onDeliver: () => void; onDirections: () => void;
}) {
  const label = (e: JourneyEvent) => e.kind === "picked_up" ? (fr ? "Ramassé" : "Picked up")
    : e.kind === "delivered" ? (fr ? "Livré" : "Delivered") : (e.city || (fr ? "Étape" : "Stop"));
  const share = (e: JourneyEvent) => {
    if (!j.token) return;
    const url = `${CourierAPI.cardBase}/card/${j.token}/${e.id}`;
    const msg = e.kind === "picked_up"
      ? (fr ? `Votre colis ${j.code} a été ramassé : ${url}` : `Your parcel ${j.code} has been picked up: ${url}`)
      : (fr ? `Votre colis ${j.code} est à ${e.city ?? "une étape"} : ${url}` : `Your parcel ${j.code} is in ${e.city ?? "transit"}: ${url}`);
    Share.share({ message: msg }).catch(() => {});
  };
  const past = j.events.filter((e) => e.kind !== "delivered");

  return (
    <View style={{ marginTop: 2 }}>
      {/* Open step: delivery */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ alignItems: "center", width: 16 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: Colors.accent, backgroundColor: "#fff" }} />
          {past.length ? <View style={{ flex: 1, width: 2, backgroundColor: Colors.line, minHeight: 12 }} /> : null}
        </View>
        <View style={{ flex: 1, paddingBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.ink }}>{fr ? "Livraison" : "Delivery"} · {j.dropoff.city}</Text>
          <Text style={{ fontSize: 11, color: Colors.t2, marginTop: 1 }}>
            {distanceKm != null ? (fr ? `À ${Math.round(distanceKm)} km — la livraison s'ouvre à 25 km` : `${Math.round(distanceKm)} km away — delivery opens at 25 km`)
                                : (fr ? "Position inconnue" : "Position unknown")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {j.dropoff.addr ? (
              <Pressable onPress={onDirections} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Navigation size={12} color={Colors.accent} strokeWidth={2.2} />
                <Text style={{ color: Colors.accentDk, fontWeight: "800", fontSize: 12 }}>{fr ? "Itinéraire" : "Directions"}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onDeliver} style={{ backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{fr ? "Livrer maintenant" : "Deliver now"}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Done steps, newest first */}
      {[...past].reverse().map((e, i, arr) => (
        <View key={e.id} style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ alignItems: "center", width: 16 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.green }} />
            {i < arr.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: Colors.green, minHeight: 12 }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.ink }}>{label(e)} · {fmt(e.at, fr)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
              <Text style={{ fontSize: 11, color: Colors.t2 }}>
                {e.note ? `${e.note} · ` : ""}{e.shared || e.sent ? (fr ? "carte envoyée" : "card sent") : (fr ? "carte en attente" : "card pending")}
              </Text>
              {e.shared || e.sent ? <Check size={12} color="#178a5e" strokeWidth={2.6} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              {e.photo ? <Image source={{ uri: e.photo }} style={{ width: 56, height: 40, borderRadius: 7, backgroundColor: Colors.cardAlt }} /> : null}
              <Pressable onPress={() => share(e)} hitSlop={8}>
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: Colors.accentDk }}>{fr ? "Partager la carte" : "Share card"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// Great-circle distance in km (no road routing — good enough for a 25 km switch).
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number | null; lng: number | null }): number | null {
  if (b.lat == null || b.lng == null) return null;
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
