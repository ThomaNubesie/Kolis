// Live "is my location being shared?" line on the Carrying screen. Background
// tracking used to fail silently; now the courier (and we, on a screenshot) can
// see whether it's running and, if not, why — with the fix one tap away.
import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Radio, AlertTriangle } from "lucide-react-native";
import { Colors } from "../constants/colors";
import { getTrackingStatus, startBackgroundTracking, TrackingStatus as S } from "../services/backgroundLocation";

export function TrackingStatus({ fr, carrying }: { fr: boolean; carrying: boolean }) {
  const [st, setSt] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!carrying) return;
    let alive = true;
    const tick = () => getTrackingStatus().then((s) => { if (alive) setSt(s); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [carrying]);

  if (!carrying || !st) return null;

  const ok = st.active && st.permission === "granted";
  const fix = async () => {
    if (st.permission === "denied") { Linking.openSettings().catch(() => {}); return; }
    setBusy(true);
    await startBackgroundTracking({ request: st.permission !== "granted" });
    setSt(await getTrackingStatus());
    setBusy(false);
  };

  const title = ok ? (fr ? "Position partagée" : "Location shared")
    : (fr ? "Position non partagée" : "Location not shared");
  const sub = ok
    ? (fr ? "L'expéditeur et la répartition voient votre trajet. Vous pouvez ouvrir d'autres applis — ne fermez pas Kolis." : "The sender and dispatch can follow you. You can use other apps — just don't swipe Kolis closed.")
    : st.permission === "denied"
      ? (fr ? "La localisation est refusée pour Kolis. Autorisez-la dans Réglages." : "Location is turned off for Kolis. Allow it in Settings.")
      : st.permission === "undetermined"
        ? (fr ? "Autorisez la localisation pour que le client suive son colis." : "Allow location so the customer can follow their parcel.")
        : (fr ? `Le suivi n'a pas démarré${st.error ? ` (${st.error})` : ""}.` : `Tracking didn't start${st.error ? ` (${st.error})` : ""}.`);
  const action = ok ? null : st.permission === "denied" ? (fr ? "Réglages" : "Settings") : (fr ? "Activer" : "Turn on");

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 11, marginBottom: 12,
      backgroundColor: ok ? "rgba(23,138,94,0.10)" : "rgba(220,38,38,0.08)", borderWidth: 1, borderColor: ok ? "rgba(23,138,94,0.35)" : "rgba(220,38,38,0.35)" }}>
      {ok ? <Radio size={18} color="#178a5e" strokeWidth={2.4} /> : <AlertTriangle size={18} color={Colors.red} strokeWidth={2.4} />}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: ok ? "#178a5e" : Colors.red }}>{title}</Text>
        <Text style={{ fontSize: 11.5, color: Colors.t2, marginTop: 1 }}>{sub}</Text>
      </View>
      {action ? (
        <Pressable onPress={fix} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
