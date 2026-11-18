// Ways through pickup when the printed label isn't there. Each one is independent
// of the others and of the label scan / typed code above it — if one fails (no
// GPS, sender not answering…) the courier just uses the next, and dispatch can
// always override from admin. Nobody gets stuck at the curb.
//
//   1. Scanner sans étiquette — kolis-scan with no token; the server reveals the
//      pickup code when the courier is within 1000 m of the pickup address.
//   2. Demander la remise   — the sender confirms the handover on their own phone
//      (SMS link or the Kolis app); the parcel flips to picked_up server-side.
//   3. Contacter la répartition — phone if configured, else email, with the KL code.
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Linking } from "react-native";
import { Crosshair, Handshake, Headphones } from "lucide-react-native";
import { Colors } from "../constants/colors";
import { DISPATCH_EMAIL, DISPATCH_PHONE } from "../constants/dispatch";
import { CourierAPI } from "../services/courier";
import { getMyLocation } from "../services/location";

type Props = {
  parcelId: string; code: string; fr: boolean;
  onCode: (code: string) => void;      // proximity scan filled the pickup code
  onPickedUp: () => void;              // sender confirmed the handover
};

const Row = ({ icon, title, sub, onPress, busy }: { icon: React.ReactNode; title: string; sub: string; onPress: () => void; busy?: boolean }) => (
  <Pressable onPress={onPress} disabled={busy} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: Colors.line, borderRadius: 11, padding: 10, backgroundColor: Colors.card, opacity: busy ? 0.6 : 1 }}>
    {icon}
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "800", color: Colors.ink }}>{title}</Text>
      <Text style={{ fontSize: 10.5, color: Colors.t3, marginTop: 1 }}>{sub}</Text>
    </View>
    {busy ? <ActivityIndicator color={Colors.accent} /> : null}
  </Pressable>
);

export function PickupFallbacks({ parcelId, code, fr, onCode, onPickedUp }: Props) {
  const [busy, setBusy] = useState<"near" | "handover" | null>(null);
  const [waiting, setWaiting] = useState(false);   // handover requested, polling for the answer
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const scanNear = async () => {
    setBusy("near");
    const pos = await getMyLocation();
    const r = await CourierAPI.scanNoLabel(parcelId, pos?.lat ?? null, pos?.lng ?? null).catch(() => null);
    setBusy(null);
    if (r?.in_range && r.code) { onCode(r.code); return; }
    const km = r?.distance_m != null ? (r.distance_m >= 1000 ? `${(r.distance_m / 1000).toFixed(1)} km` : `${r.distance_m} m`) : null;
    Alert.alert("Kolis", r?.reason === "location_off" || !pos
      ? (fr ? "Activez la localisation pour scanner sans étiquette — ou utilisez une autre option." : "Turn on location to scan without a label — or use another option.")
      : r?.reason === "too_far"
      ? (fr ? `Vous êtes à ${km} du point de ramassage. Rapprochez-vous à moins de 1000 m — ou utilisez une autre option.` : `You're ${km} from the pickup point. Get within 1000 m — or use another option.`)
      : (fr ? "Scan impossible pour l'instant — utilisez une autre option." : "Couldn't scan right now — use another option."));
  };

  const askHandover = async () => {
    setBusy("handover");
    const pos = await getMyLocation();
    const r = await CourierAPI.requestHandover(parcelId, pos?.lat ?? null, pos?.lng ?? null);
    setBusy(null);
    if (r.error) { Alert.alert("Kolis", fr ? "Demande non envoyée — utilisez une autre option." : "Request not sent — use another option."); return; }
    setWaiting(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const s = await CourierAPI.handoverStatus(parcelId).catch(() => null);
      if (s === "pending" || s === null) return;
      if (timer.current) clearInterval(timer.current);
      setWaiting(false);
      if (s === "confirmed") onPickedUp();
      else Alert.alert("Kolis", s === "declined"
        ? (fr ? "L'expéditeur a refusé la remise. Vérifiez avec lui, ou utilisez une autre option." : "The sender refused the handover. Check with them, or use another option.")
        : (fr ? "Pas de réponse à temps. Redemandez, ou utilisez une autre option." : "No answer in time. Ask again, or use another option."));
    }, 4000);
  };

  const dispatch = () => {
    if (DISPATCH_PHONE) { Linking.openURL(`tel:${DISPATCH_PHONE}`).catch(() => {}); return; }
    const subj = encodeURIComponent(`${code} — ${fr ? "aide au ramassage" : "pickup help"}`);
    Linking.openURL(`mailto:${DISPATCH_EMAIL}?subject=${subj}`).catch(() => {});
  };

  return (
    <View style={{ gap: 7, marginTop: 10 }}>
      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.6 }}>{fr ? "Pas d'étiquette ? Autres options" : "No label? Other options"}</Text>
      <Row busy={busy === "near"} onPress={scanNear}
        icon={<Crosshair size={18} color={Colors.accent} strokeWidth={2.2} />}
        title={fr ? "Scanner sans étiquette" : "Scan without a label"}
        sub={fr ? "Remplit le code si vous êtes à moins de 1000 m" : "Fills the code when you're within 1000 m"} />
      <Row busy={busy === "handover" || waiting} onPress={askHandover}
        icon={<Handshake size={18} color={Colors.accent} strokeWidth={2.2} />}
        title={waiting ? (fr ? "En attente de l'expéditeur…" : "Waiting for the sender…") : (fr ? "Demander la remise" : "Request handover")}
        sub={waiting ? (fr ? "Il confirme sur son téléphone (lien par SMS)" : "They confirm on their phone (SMS link)") : (fr ? "L'expéditeur confirme sur son téléphone" : "The sender confirms on their phone")} />
      <Row onPress={dispatch}
        icon={<Headphones size={18} color={Colors.t2} strokeWidth={2.2} />}
        title={fr ? "Contacter la répartition" : "Contact dispatch"}
        sub={fr ? "La répartition peut confirmer le ramassage pour vous" : "Dispatch can confirm the pickup for you"} />
    </View>
  );
}
