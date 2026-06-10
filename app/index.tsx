import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../services/supabase";
import { ProfileAPI } from "../services/profile";
import { Colors } from "../constants/colors";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/(auth)/onboarding"); return; }

      // A shared login (e.g. an existing LoadQ account) is NOT enough — Kolis
      // requires its OWN identity verification + membership fee. Gate on the
      // Kolis profile and resume at whatever step is still outstanding.
      const prof = await ProfileAPI.get();
      const verified = !!prof?.identity_verified;
      const paid = !!prof?.verification_fee_paid; // founding activation also sets this
      if (prof?.role && verified && paid) { router.replace("/(app)/send"); return; }

      // Keep the standalone verify/pay screens' AsyncStorage deps in sync.
      if (prof?.role) await AsyncStorage.setItem("userRole", prof.role);
      if (prof?.country) await AsyncStorage.setItem("userCountry", prof.country);

      if (prof?.role && verified) router.replace("/(auth)/pay");        // needs to pay
      else if (prof?.role) router.replace("/(auth)/verify");            // needs to verify
      else router.replace("/(auth)/onboarding");                       // needs a Kolis profile
    })();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 30, fontWeight: "900", color: Colors.accent, letterSpacing: 1 }}>Kolis</Text>
    </View>
  );
}
