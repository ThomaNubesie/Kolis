// Pickup / delivery confirmation — the courier sees the card the customer gets
// (Card 4 at pickup, Card 1 at delivery), and can pass it on themselves. If they don't, the server sends it anyway (cron fallback 10 min
// after delivery), so the customer is never left without proof; sharing here just
// marks the parcel so they don't receive it twice.
//
// Reached two ways: straight after a delivery (carrying.tsx), and from the history
// list, where it's the record of a job already done.
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Image, ScrollView, Share, Linking, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, MessageCircle, Share2 } from "lucide-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { CourierAPI } from "../../services/courier";
import { BlockingOverlay } from "../../components/BlockingOverlay";

export default function DeliveryCard() {
  const { parcel, recipient, kind: kindParam } = useLocalSearchParams<{ parcel?: string; recipient?: string; kind?: string }>();
  const kind: "picked_up" | "delivered" = kindParam === "picked_up" ? "picked_up" : "delivered";
  const atPickup = kind === "picked_up";
  const router = useRouter();
  const { lang } = useStrings();
  const fr = lang === "fr";
  const [info, setInfo] = useState<{ url: string; code: string; shared: boolean; photo: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);
  // Frozen until the card image has actually loaded (it's rendered on demand by
  // business.kolis.ca), so nothing can be shared or closed before it exists.
  // After 20 s or an error the overlay offers Retry / Continue — never a trap.
  const [ready, setReady] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [released, setReleased] = useState(false);
  useEffect(() => {
    if (ready || released || !info) return;
    setStuck(false);
    const tm = setTimeout(() => setStuck(true), 20000);
    return () => clearTimeout(tm);
  }, [info, ready, released, attempt]);
  const frozen = !released && (loading || (!!info && !ready));

  useEffect(() => {
    // This screen stays mounted between visits (it's a hidden tab), so start every
    // visit clean — otherwise the previous card (e.g. the pickup card) showed,
    // unfrozen, on the delivery screen until the new one loaded.
    setInfo(null); setLoading(true); setShared(false);
    setReady(false); setStuck(false); setReleased(false); setAttempt(0);
    if (!parcel) { setLoading(false); return; }
    CourierAPI.cardInfo(String(parcel), kind)
      .then((i) => { setInfo(i); setShared(!!i?.shared); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [parcel, kind]);

  const note = atPickup
    ? (fr ? `Votre colis ${info?.code ?? ""} a été ramassé et est en route : ${info?.url ?? ""}`
          : `Your parcel ${info?.code ?? ""} has been picked up and is on its way: ${info?.url ?? ""}`)
    : (fr ? `Votre colis ${info?.code ?? ""} a été livré. Voici la confirmation : ${info?.url ?? ""}`
          : `Your parcel ${info?.code ?? ""} has been delivered. Here is the confirmation: ${info?.url ?? ""}`);

  const done = useCallback(async () => {
    if (!parcel) return;
    try { await CourierAPI.markCardShared(String(parcel), kind); setShared(true); } catch { /* fallback still covers it */ }
  }, [parcel, kind]);

  // Don't ask iOS whether WhatsApp is installed: canOpenURL answers "no" for any
  // scheme not pre-declared in Info.plist (LSApplicationQueriesSchemes), so it
  // claimed WhatsApp was missing on phones that have it. Open the app scheme
  // directly; if that fails, the wa.me universal link opens WhatsApp (or its page).
  const viaWhatsApp = async () => {
    const text = encodeURIComponent(note);
    try { await Linking.openURL(`whatsapp://send?text=${text}`); }
    catch {
      try { await Linking.openURL(`https://wa.me/?text=${text}`); }
      catch { Alert.alert("Kolis", fr ? "Impossible d'ouvrir WhatsApp — utilisez SMS ou Partager." : "Couldn't open WhatsApp — use SMS or Share."); return; }
    }
    done();
  };
  const viaSms = async () => {
    await Linking.openURL(`sms:&body=${encodeURIComponent(note)}`).catch(() => {});
    done();
  };
  const viaShare = async () => {
    await Share.share({ message: note }).catch(() => {});
    done();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 12, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} /></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: Colors.ink, marginRight: 22 }}>
          {atPickup ? (fr ? "Ramassage confirmé" : "Pickup confirmed") : (fr ? "Livraison confirmée" : "Delivery confirmed")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
        <CheckCircle2 size={42} color={Colors.green} strokeWidth={2} />
        <Text style={{ fontSize: 19, fontWeight: "900", color: Colors.ink, marginTop: 8 }}>
          {info?.code ? `${info.code} ${atPickup ? (fr ? "ramassé" : "picked up") : (fr ? "livré" : "delivered")}` : (atPickup ? (fr ? "Ramassé" : "Picked up") : (fr ? "Livré" : "Delivered"))}
        </Text>
        <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 4, textAlign: "center" }}>
          {shared
            ? (fr ? "Carte envoyée au client." : "Card sent to the customer.")
            : (fr ? `La carte part automatiquement${recipient ? ` à ${recipient}` : ""} — ou envoyez-la maintenant.`
                  : `The card is sent automatically${recipient ? ` to ${recipient}` : ""} — or send it now.`)}
        </Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 28 }} />
        ) : info ? (
          <Image key={attempt} source={{ uri: attempt ? `${info.url}?r=${attempt}` : info.url }} resizeMode="contain"
            onLoad={() => setReady(true)} onError={() => setStuck(true)}
            style={{ width: "100%", aspectRatio: atPickup ? 1080 / 760 : (info.photo ? 1080 / 1680 : 1080 / 1180), borderRadius: 14, marginTop: 18, backgroundColor: Colors.cardAlt }} />
        ) : (
          <Text style={{ fontSize: 12.5, color: Colors.t3, marginTop: 28, textAlign: "center" }}>
            {fr ? "Carte indisponible pour ce colis." : "No card available for this parcel."}
          </Text>
        )}

        {info ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 16, width: "100%" }}>
            <Pressable onPress={viaWhatsApp} style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, backgroundColor: "#25D366", borderRadius: 12, paddingVertical: 12 }}>
              <MessageCircle size={15} color="#fff" strokeWidth={2.4} />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>WhatsApp</Text>
            </Pressable>
            <Pressable onPress={viaSms} style={{ flex: 1, alignItems: "center", borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 12, paddingVertical: 12, backgroundColor: Colors.card }}>
              <Text style={{ color: Colors.accentDk, fontWeight: "800", fontSize: 13 }}>SMS</Text>
            </Pressable>
            <Pressable onPress={viaShare} style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 12, paddingVertical: 12, backgroundColor: Colors.card }}>
              <Share2 size={15} color={Colors.accentDk} strokeWidth={2.4} />
              <Text style={{ color: Colors.accentDk, fontWeight: "800", fontSize: 13 }}>{fr ? "Partager" : "Share"}</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={() => router.back()} style={{ width: "100%", backgroundColor: Colors.accent, borderRadius: 13, padding: 15, alignItems: "center", marginTop: 14 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{fr ? "Terminé" : "Done"}</Text>
        </Pressable>
      </ScrollView>
      <BlockingOverlay visible={frozen}
        message={fr ? "Génération de la carte…" : "Generating the card…"}
        sub={stuck ? (fr ? "La carte tarde à arriver. Elle sera aussi envoyée automatiquement au client." : "The card is taking a while. It will also be sent to the customer automatically.")
                   : (fr ? "Un instant — la carte avec votre photo est en préparation." : "One moment — the card with your photo is being prepared.")}
        actions={stuck ? [
          { label: fr ? "Réessayer" : "Retry", primary: true, onPress: () => { setReady(false); setAttempt((a) => a + 1); } },
          { label: fr ? "Continuer sans la carte" : "Continue without the card", onPress: () => setReleased(true) },
        ] : undefined} />
    </SafeAreaView>
  );
}
