import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text } from "react-native";
import { initLang } from "../hooks/useStrings";
import { Colors } from "../constants/colors";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => { initLang().then(() => setReady(true)); }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 30, fontWeight: "900", color: Colors.accent, letterSpacing: 1 }}>Kolis</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </SafeAreaProvider>
  );
}
