import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { supabase } from "../services/supabase";
import { Colors } from "../constants/colors";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/(app)/send");
      else router.replace("/(auth)/language");
    });
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 30, fontWeight: "900", color: Colors.accent, letterSpacing: 1 }}>Kolis</Text>
    </View>
  );
}
