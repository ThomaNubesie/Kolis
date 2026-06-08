import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Colors } from "../../constants/colors";
import { AdminAPI } from "../../services/admin";

export default function AdminLayout() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    AdminAPI.isAdmin().then((admin) => {
      setOk(admin);
      if (!admin) router.replace("/(app)/profile");
    });
  }, []);

  if (ok === null) {
    return <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} /></View>;
  }
  if (!ok) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }} />;
}
