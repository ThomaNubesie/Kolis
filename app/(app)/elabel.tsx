// Electronic label (e-label option 1): for a sender with no printer or no time.
// Shows exactly the QR the printed label carries — KOLIS|<parcel id>|pickup|<token>
// — so the courier scans the sender's screen with the same scanner, no change on
// their side. Keeps the screen awake while open.
//
// One of several independent ways through pickup; if the screen can't be scanned
// the courier still has the no-label scan, the handover request and the typed code.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import QRCode from "react-native-qrcode-svg";
import { ChevronLeft, Sun } from "lucide-react-native";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { supabase } from "../../services/supabase";

type L = { id: string; code: string; from_city: string; to_city: string; recipient_name: string | null; size: string; dropoff_type: string; scan_token: string | null; pickup_code: string | null; status: string };

export default function ELabel() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useStrings();
  const fr = lang === "fr";
  const [l, setL] = useState<L | null | undefined>(undefined);

  useEffect(() => {
    // Sender RLS (kolis_parcels_sender_select) covers reading their own parcel.
    supabase.from("kolis_parcels")
      .select("id, code, from_city, to_city, recipient_name, size, dropoff_type, scan_token, pickup_code, status")
      .eq("id", String(id)).maybeSingle()
      .then(({ data }) => setL((data as L) ?? null));
  }, [id]);

  const picked = l && !["requested", "received_at_hub", "matched", "dispatched"].includes(l.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.line }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} /></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: Colors.ink, marginRight: 22 }}>{fr ? "Étiquette électronique" : "Electronic label"}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
        {l === undefined ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        : !l || !l.scan_token ? <Text style={{ color: Colors.t2, marginTop: 40 }}>{fr ? "Étiquette indisponible pour ce colis." : "No label available for this parcel."}</Text>
        : (
          <View style={{ width: "100%", borderWidth: 2, borderColor: Colors.ink, borderRadius: 18, overflow: "hidden" }}>
            <View style={{ backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{picked ? (fr ? "Colis déjà ramassé" : "Already picked up") : (fr ? "Colis à ramasser" : "Parcel for pickup")}</Text>
              <Text style={{ backgroundColor: "#0A0A0C", color: Colors.accent, fontWeight: "800", fontSize: 11, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: "hidden" }}>KOLIS</Text>
            </View>
            <View style={{ padding: 16, alignItems: "center", opacity: picked ? 0.35 : 1 }}>
              <QRCode value={`KOLIS|${l.id}|pickup|${l.scan_token}`} size={240} backgroundColor="#fff" color={Colors.ink} />
              <Text style={{ fontSize: 28, fontWeight: "900", color: Colors.ink, marginTop: 12, letterSpacing: 1 }}>{l.code}</Text>
              <View style={{ width: "100%", marginTop: 10, gap: 4 }}>
                <Row k={fr ? "De" : "From"} v={l.from_city} />
                <Row k={fr ? "Vers" : "To"} v={`${l.recipient_name ? l.recipient_name.split(" ")[0] + " · " : ""}${l.to_city}`} />
                <Row k={fr ? "Format" : "Size"} v={`${l.size} · ${l.dropoff_type === "door" ? (fr ? "porte-à-porte" : "door-to-door") : (fr ? "point relais" : "hub")}`} />
              </View>
            </View>
          </View>
        )}
        {l && l.scan_token && !picked ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}>
              <Sun size={14} color={Colors.t3} strokeWidth={2.2} />
              <Text style={{ fontSize: 12, color: Colors.t3 }}>{fr ? "Montez la luminosité et présentez cet écran au livreur." : "Turn brightness up and show this screen to the courier."}</Text>
            </View>
            {l.pickup_code ? (
              <Text style={{ fontSize: 12, color: Colors.t2, marginTop: 10, textAlign: "center" }}>
                {fr ? `Le scan ne marche pas ? Donnez-lui votre code de ramassage : ${l.pickup_code}` : `Scan not working? Give them your pickup code: ${l.pickup_code}`}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
    <Text style={{ fontSize: 12.5, color: Colors.t2 }}>{k}</Text>
    <Text style={{ fontSize: 12.5, color: Colors.ink, fontWeight: "800" }}>{v}</Text>
  </View>
);
