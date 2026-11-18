import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Image, Linking } from "react-native";
import { Printer, Tag, Radio, Check, ChevronRight } from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Region } from "react-native-maps";
import { AlertTriangle } from "lucide-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI, Parcel, ParcelStatus, ParcelTracking } from "../../services/parcels";
import { supabase } from "../../services/supabase";

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
  const { t, lang } = useStrings();
  const t2 = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState<ParcelTracking | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelMsg, setLabelMsg] = useState<string | null>(null);
  // A courier at the door asking this sender to confirm the handover (e-label option 5).
  const [handover, setHandover] = useState<{ courier: string | null } | null>(null);
  const [hBusy, setHBusy] = useState(false);
  // Journey timeline (same steps the courier and admin see). Signed-in sender gets
  // photos + card links; the live map opens from the "Suivi en direct" button.
  const [journey, setJourney] = useState<{ token: string | null; events: { id: string | null; kind: string; city: string | null; at: string; photo: string | null }[] } | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);

  const emailLabel = async () => {
    if (!parcel || labelBusy) return;
    setLabelBusy(true); setLabelMsg(null);
    const r = await ParcelsAPI.emailLabel(parcel.code);
    setLabelBusy(false);
    setLabelMsg(r.ok ? t("emailLabelSent", { email: r.to ?? "" }) : (r.error || t("emailLabelFailed")));
  };

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    ParcelsAPI.get(id).then(({ parcel }) => { setParcel(parcel); setLoading(false); });
  }, [id]);

  // Pending handover request for this parcel — polled while the screen is open, so
  // the sender can confirm in the app as well as from the SMS link.
  useEffect(() => {
    if (!id) return;
    let active = true;
    const poll = () => supabase.rpc("kolis_sender_pending_handovers").then(({ data }) => {
      if (!active) return;
      const mine = ((data as any[]) || []).find((h) => h.parcel_id === id);
      setHandover(mine ? { courier: mine.courier ?? null } : null);
    });
    poll();
    const iv = setInterval(poll, 8000);
    return () => { active = false; clearInterval(iv); };
  }, [id]);
  const decideHandover = async (ok: boolean) => {
    if (!id) return;
    setHBusy(true);
    await supabase.rpc("kolis_sender_handover", { p_id: id, p_ok: ok });
    setHBusy(false); setHandover(null);
    ParcelsAPI.get(id).then(({ parcel }) => setParcel(parcel));
  };

  useEffect(() => {
    if (!parcel?.code) return;
    supabase.rpc("kolis_track_events", { p_code: parcel.code, p_token: null }).then(({ data }) => setJourney((data as any) ?? null));
  }, [parcel?.code, parcel?.status]);

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

        {handover ? (
          <View style={{ backgroundColor: "#FDECF3", borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 14, padding: 14, marginBottom: 18 }}>
            <Text style={{ fontSize: 15, fontWeight: "900", color: Colors.ink }}>{t2(`${handover.courier || "Votre livreur"} est là pour votre colis`, `${handover.courier || "Your courier"} is here for your parcel`)}</Text>
            <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 4 }}>{t2("Remettez le colis, puis confirmez. Cela remplace le code de ramassage.", "Hand the parcel over, then confirm. This replaces the pickup code.")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable disabled={hBusy} onPress={() => decideHandover(true)} style={{ flex: 1, backgroundColor: Colors.accent, borderRadius: 11, padding: 12, alignItems: "center", opacity: hBusy ? 0.6 : 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>{t2("Confirmer la remise", "Confirm handover")}</Text>
              </Pressable>
              <Pressable disabled={hBusy} onPress={() => decideHandover(false)} style={{ flex: 1, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 11, padding: 12, alignItems: "center", backgroundColor: "#fff" }}>
                <Text style={{ color: Colors.accentDk, fontWeight: "800" }}>{t2("Ce n'est pas moi", "Not me")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {["requested", "received_at_hub", "matched", "dispatched"].includes(parcel.status) ? (
          <Pressable onPress={() => router.push({ pathname: "/(app)/elabel", params: { id: parcel.id } })} style={{ backgroundColor: Colors.accent, borderRadius: 12, padding: 13, alignItems: "center", marginBottom: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Tag size={16} color="#fff" strokeWidth={2.2} />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{t2("Étiquette électronique", "Electronic label")}</Text>
            </View>
            <Text style={{ color: "#fff", opacity: 0.85, fontSize: 11.5, marginTop: 2 }}>{t2("Pas d'imprimante ? Montrez-la au livreur.", "No printer? Show it to the courier.")}</Text>
          </Pressable>
        ) : null}

        {journey && journey.events.length > 0 ? (
          <View style={{ marginBottom: 18 }}>
            {!["delivered", "cancelled"].includes(parcel.status) ? (
              <TlRow color={Colors.accent} last={false} title={`${t2("Livraison", "Delivery")} · ${parcel.to_city}`}
                sub={track?.eta_minutes != null ? t2(`Arrivée dans environ ${track.eta_minutes} min`, `Arriving in about ${track.eta_minutes} min`) : t2("En route", "On its way")}>
                {showMap ? (
                  <Pressable onPress={() => setLiveOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 }}>
                    <Radio size={14} color="#fff" strokeWidth={2.4} />
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12.5 }}>{liveOpen ? t2("Masquer le suivi", "Hide live tracking") : t2("Suivi en direct", "Live tracking")}</Text>
                  </Pressable>
                ) : null}
              </TlRow>
            ) : null}
            {[...journey.events].reverse().map((e, i, arr) => (
              <TlRow key={i} color={Colors.green} done last={i === arr.length - 1}
                title={`${e.kind === "picked_up" ? t2("Ramassé", "Picked up") : e.kind === "delivered" ? t2("Livré", "Delivered") : (e.city || t2("Étape", "Stop"))} · ${new Date(e.at).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" })}`}
                sub={e.kind === "picked_up" ? parcel.from_city : e.kind === "delivered" ? parcel.to_city : t2(`En route vers ${parcel.to_city}`, `On the way to ${parcel.to_city}`)}>
                {e.photo || (e.id && journey.token) ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 }}>
                    {e.photo ? <Image source={{ uri: e.photo }} style={{ width: 64, height: 46, borderRadius: 8, backgroundColor: Colors.cardAlt }} /> : null}
                    {e.id && journey.token ? (
                      <Pressable onPress={() => Linking.openURL(`https://business.kolis.ca/card/${journey.token}/${e.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 2 }} hitSlop={8}>
                        <Text style={{ color: Colors.accentDk, fontWeight: "800", fontSize: 12.5 }}>{t2("Voir la carte", "View card")}</Text>
                        <ChevronRight size={14} color={Colors.accentDk} strokeWidth={2.4} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </TlRow>
            ))}
          </View>
        ) : (
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
        )}

        {showMap && (liveOpen || !journey || journey.events.length === 0) && track && track.driver_lat != null && track.driver_lng != null && (
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={11.5} color={Colors.gold} strokeWidth={2.2} />
                  <Text style={styles.staleText}>Location updated over 10 min ago</Text>
                </View>
              ) : (
                <Text style={styles.freshText}>Updated just now</Text>
              )}
            </View>
          </View>
        )}

        {parcel.status !== "cancelled" && (
          <View style={{ marginBottom: 18 }}>
            <Pressable
              onPress={emailLabel}
              disabled={labelBusy}
              style={({ pressed }) => [styles.labelBtn, (pressed || labelBusy) && { opacity: 0.6 }]}
            >
              {labelBusy
                ? <ActivityIndicator color={Colors.accent} />
                : <Printer size={17} color={Colors.accent} strokeWidth={2.2} />}
              <Text style={styles.labelBtnText}>{labelBusy ? t("emailLabelSending") : t("emailLabel")}</Text>
            </Pressable>
            {labelMsg
              ? <Text style={styles.labelMsg}>{labelMsg}</Text>
              : <Text style={styles.labelHint}>{t("emailLabelHint")}</Text>}
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
  labelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  labelBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.accent,
  },
  labelHint: {
    fontSize: 11.5,
    color: Colors.t3,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 16,
  },
  labelMsg: {
    fontSize: 12.5,
    color: Colors.ink,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
});

// One row of the journey timeline: dot + rail, title, subtitle, optional extras.
function TlRow({ color, done, last, title, sub, children }: { color: string; done?: boolean; last: boolean; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 11 }}>
      <View style={{ alignItems: "center", width: 16 }}>
        <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: done ? color : "#fff", borderWidth: 3, borderColor: color, alignItems: "center", justifyContent: "center" }}>
          {done ? <Check size={8} color="#fff" strokeWidth={4} /> : null}
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: done ? Colors.green : Colors.line, minHeight: 14 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 1 }}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  );
}
