import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";

export default function Shipments() {
  const { t } = useStrings();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <View style={{ padding: 18 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink }}>{t("tabShipments")}</Text>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 10 }}>📦</Text>
        <Text style={{ color: Colors.t2, textAlign: "center" }}>Your shipments will appear here.</Text>
      </View>
    </SafeAreaView>
  );
}
