// Prominent disclosure for background location (Google Play policy): shown IN the
// app, BEFORE the system "Allow all the time / Always" prompt, explaining what is
// collected, why, and that it continues when the app is closed. The system prompt
// is only requested if the courier taps Continue; "Not now" asks nothing.
import { Modal, View, Text, Pressable } from "react-native";
import { MapPin, Clock, ShieldCheck } from "lucide-react-native";
import { Colors } from "../constants/colors";

export function LocationDisclosure({ visible, fr, onAccept, onDecline }: {
  visible: boolean; fr: boolean; onAccept: () => void; onDecline: () => void;
}) {
  const Row = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 12 }}>
      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: "#FDECF3", alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <Text style={{ flex: 1, fontSize: 14, color: Colors.ink, lineHeight: 20 }}>{text}</Text>
    </View>
  );
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onDecline}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.55)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: Colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 34 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" }}>
            <MapPin size={26} color="#fff" strokeWidth={2.2} />
          </View>
          <Text style={{ fontSize: 21, fontWeight: "900", color: Colors.ink, marginTop: 14 }}>
            {fr ? "Partager votre position pendant la livraison" : "Share your location while delivering"}
          </Text>
          <Text style={{ fontSize: 14.5, color: Colors.ink, marginTop: 10, lineHeight: 21 }}>
            {fr
              ? "Kolis collecte votre position pour le suivi en direct des colis, même lorsque l'appli est fermée ou n'est pas utilisée."
              : "Kolis collects location data to enable live parcel tracking, even when the app is closed or not in use."}
          </Text>
          <Row icon={<MapPin size={16} color={Colors.accent} strokeWidth={2.4} />}
            text={fr ? "L'expéditeur, le destinataire et la répartition voient où est le colis et son heure d'arrivée." : "The sender, the recipient and dispatch see where the parcel is and when it will arrive."} />
          <Row icon={<Clock size={16} color={Colors.accent} strokeWidth={2.4} />}
            text={fr ? "Uniquement pendant que vous transportez un colis — s'arrête automatiquement après la dernière livraison." : "Only while you're carrying a parcel — it stops automatically after your last delivery."} />
          <Row icon={<ShieldCheck size={16} color={Colors.accent} strokeWidth={2.4} />}
            text={fr ? "Jamais utilisée pour la publicité. Vous pouvez la désactiver à tout moment dans Réglages." : "Never used for advertising. You can turn it off at any time in Settings."} />
          <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 14, lineHeight: 18 }}>
            {fr ? "À l'étape suivante, choisissez « Toujours autoriser » (Android : « Toujours autoriser » / « Autoriser tout le temps »)."
                : "On the next screen, choose \"Allow all the time\" (iPhone: \"Always\")."}
          </Text>
          <Pressable onPress={onAccept} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 15, alignItems: "center", marginTop: 18 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{fr ? "Continuer" : "Continue"}</Text>
          </Pressable>
          <Pressable onPress={onDecline} style={{ padding: 13, alignItems: "center", marginTop: 4 }}>
            <Text style={{ color: Colors.t2, fontWeight: "700", fontSize: 14 }}>{fr ? "Pas maintenant" : "Not now"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
