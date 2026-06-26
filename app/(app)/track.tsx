import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Region } from "react-native-maps";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI, Parcel, ParcelStatus, ParcelTracking } from "../../services/parcels";

const ORDER_DEFAULT: ParcelStatus[] = ["requested", "matched", "picked_up", "in_transit", "delivered"];
const ORDER_HUB: ParcelStatus[] = ["received_at_hub", "dispatched", "in_transit", "delivered"];

// States where a driver is actively moving the parcel — show the live map.
const ACTIVE_STATES: ParcelStatus[] = ["matched", "dispatched", "picked_up", "in_transit"];

function regionFor(dLat: number, dLng: number, destLat: number | null, destLng: number | null): Region {
  if (destLat != null && destLng != null) {
    const midLat = (dLat + destLat) / 2;
    const midLng = (dLng + destLng) / 2;
    const latDelta = Math.max(Math.abs(dLat - destLat) * 1.6, 0.02);
    const lngDelta = Math.max(Math.abs(dLng - destLng) * 1.6, 0.02);
    return { latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
  }
  return { latitude: dLat, longitude: dLng, latitudeDelta: 0.04, longitudeDelta: 0.04 };
}

function etaLabel(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

export default function Track() {
  const { t } = useStrings();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState<ParcelTracking | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    ParcelsAPI.get(id).then(({ parcel }) => { setParcel(parcel); setLoading(false); });
  }, [id]);

  // Poll live tracking by code every 45s while mounted.
  const code = parcel?.code;
  useEffect(() => {
    if (!code) return;
    let active = true;
    const load = () => { ParcelsAPI.tracking(code).then((tr) => { if (active) setTrack(tr); }); };
    load();
    const iv = setInterval(load, 45000);
    return () => { active = false; clearInterval(iv); };
  }, [code]);

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} /></SafeAreaView>;
  }
  if (!parcel) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><Text style={{ color: Colors.t2 }}>—</Text></SafeAreaView>;
  }

  const labels: Record<ParcelStatus, string> = {
    requested: t("statusPending"), received_at_hub: t("statusReceivedHub"), matched: t("statusMatched"),
    dispatched: t("statusDispatched"), picked_up: t("statusPickedUp"), in_transit: t("statusInTransit"),
    delivered: t("statusDelivered"), cancelled: "—",
  };
  const order = parcel.dropoff_type === "hub" ? ORDER_HUB : ORDER_DEFAULT;
  const cur = order.indexOf(parcel.status);

  // Only show the live map for active deliveries that have a driver position.
  const showMap =
    !!track &&
    ACTIVE_STATES.includes(track.status) &&
    track.driver_lat != null &&
    track.driver_lng != null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.replace("/(app)/shipments")}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("tabShipments")}</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.ink }}>{parcel.from_city} → {parcel.to_city}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t3, marginBottom: 20 }}>#{parcel.code}</Text>

        <View style={{ marginBottom: 18 }}>
          {order.map((s, i) => {
            const done = cur >= 0 && i <= cur;
            const now = i === cur;
            return (
              <View key={s} style={{ flexDirection: "row", gap: 11, alignItems: "flex-start", marginBottom: 16 }}>
                <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: done ? Colors.accent : "#fff", borderWidth: 2, borderColor: done ? Colors.accent : Colors.line, marginTop: 1 }} />
                <Text style={{ fontSize: 14, fontWeight: now ? "800" : done ? "600" : "500", color: done ? Colors.ink : Colors.t3 }}>{labels[s]}</Text>
              </View>
            );
          })}
        </View>

        {showMap && track && track.driver_lat != null && track.driver_lng != null && (
          <View style={styles.liveCard}>
            <MapView
              style={styles.map}
              initialRegion={regionFor(track.driver_lat, track.driver_lng, track.dest_lat, track.dest_lng)}
            >
              <Marker
                coordinate={{ latitude: track.driver_lat, longitude: track.driver_lng }}
                title={`${track.driver_first_name ?? t("statusInTransit")} · now`}
                pinColor={Colors.accent}
              />
              {track.dest_lat != null && track.dest_lng != null && (
                <Marker
                  coordinate={{ latitude: track.dest_lat, longitude: track.dest_lng }}
                  title={track.to_city}
                />
              )}
            </MapView>
            <View style={styles.liveMeta}>
              {track.eta_minutes != null && (
                <Text style={styles.etaText}>≈ {etaLabel(track.eta_minutes)} to delivery</Text>
              )}
              {track.distance_km != null && (
                <Text style={styles.distText}>~{Math.round(track.distance_km)} km left</Text>
              )}
              {track.stale ? (
                <Text style={styles.staleText}>⚠ Location updated over 10 min ago</Text>
              ) : (
                <Text style={styles.freshText}>Updated just now</Text>
              )}
            </View>
          </View>
        )}

        <Text style={{ fontSize: 11.5, color: Colors.t3, textAlign: "center" }}>{t("safetyNote", { city: parcel.to_city })}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  liveCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: "hidden",
    marginBottom: 18,
  },
  map: {
    height: 220,
    width: "100%",
  },
  liveMeta: {
    padding: 14,
  },
  etaText: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.ink,
  },
  distText: {
    fontSize: 13,
    color: Colors.t2,
    marginTop: 3,
  },
  freshText: {
    fontSize: 11.5,
    color: Colors.t3,
    marginTop: 6,
  },
  staleText: {
    fontSize: 11.5,
    color: Colors.gold,
    fontWeight: "600",
    marginTop: 6,
  },
});
