import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { ParcelsAPI, Parcel } from "../../services/parcels";

export default function Dispatch() {
  const { t } = useStrings();
  const router = useRouter();
  const [parcels, setParcels] = useState<Parcel[]>([]);

  const load = useCallback(() => { ParcelsAPI.atHub().then(({ parcels }) => setParcels(parcels)); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dispatch = (p: Parcel) => {
    Alert.alert(`${t("dispatchBtn")} ${p.code}`, `→ ${p.to_city}`, [
      { text: t("cancel"), style: "cancel" },
      { text: t("dispatchBtn"), onPress: async () => { await ParcelsAPI.dispatch(p.id, { external_driver_name: "Hub driver" }); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 6 }}>← {t("admin")}</Text></Pressable>
        <Text style={{ fontSize: 24, fontWeight: "800", color: Colors.ink }}>{t("adminDispatch")}</Text>
        <Text style={{ fontSize: 12.5, color: Colors.t2, marginBottom: 14 }}>{t("dispatchSub")}</Text>
        {parcels.length === 0 && <Text style={{ color: Colors.t2, textAlign: "center", marginTop: 40 }}>{t("noAwaiting")}</Text>}
        {parcels.map((p) => (
          <View key={p.id} style={{ borderWidth: 1.5, borderColor: Colors.line, borderRadius: 14, padding: 13, backgroundColor: "#fff", marginBottom: 9 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 14, color: Colors.ink }}>{p.size} → {p.to_city}</Text>
                <Text style={{ fontSize: 11, color: Colors.t3, marginTop: 2 }}>#{p.code} · 🔒 {t("senderHidden")}</Text>
              </View>
              <Pressable onPress={() => dispatch(p)} style={{ backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12.5 }}>{t("dispatchBtn")}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
