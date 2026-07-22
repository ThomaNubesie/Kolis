import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Package, Truck, Inbox, PackageCheck, Wallet, Building2, Car, User } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { KolisRole } from "../../services/profile";
import { OrgsAPI, MyOrg } from "../../services/orgs";
import { useDeliveryTracking } from "../../hooks/useDeliveryTracking";

export default function AppLayout() {
  const { t } = useStrings();
  const [role, setRole] = useState<KolisRole>("sender");
  const [orgs, setOrgs] = useState<MyOrg[]>([]);

  // Background location while carrying a Kolis-accepted parcel; stops when idle.
  useDeliveryTracking();

  useEffect(() => {
    AsyncStorage.getItem("userRole").then((r) => {
      if (r === "sender" || r === "courier" || r === "both") setRole(r);
    });
    // Org membership drives the business-mode tabs.
    OrgsAPI.myOrgs().then(setOrgs).catch(() => {});
  }, []);

  // Role drives which tabs are visible (href: null hides a screen from the bar).
  const sends = role === "sender" || role === "both";   // Send a parcel + track Shipments
  const carries = role === "courier" || role === "both"; // courier surfaces
  const hasOrgs = orgs.length > 0;                                            // Business tab
  const hasFleet = orgs.some((o) => o.type === "carrier" || o.type === "both"); // Fleet tab

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.t3,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: Colors.line },
      }}
    >
      {/* Sender */}
      <Tabs.Screen name="send" options={{ title: t("tabSend"), href: sends ? undefined : null, tabBarIcon: ({ color, size }) => <Package color={color} size={size ?? 22} strokeWidth={2} /> }} />
      <Tabs.Screen name="shipments" options={{ title: t("tabShipments"), href: sends ? undefined : null, tabBarIcon: ({ color, size }) => <Truck color={color} size={size ?? 22} strokeWidth={2} /> }} />
      {/* Courier */}
      <Tabs.Screen name="proposals" options={{ title: t("tabProposals"), href: carries ? undefined : null, tabBarIcon: ({ color, size }) => <Inbox color={color} size={size ?? 22} strokeWidth={2} /> }} />
      <Tabs.Screen name="carrying" options={{ title: t("tabCarrying"), href: carries ? undefined : null, tabBarIcon: ({ color, size }) => <PackageCheck color={color} size={size ?? 22} strokeWidth={2} /> }} />
      <Tabs.Screen name="earnings" options={{ title: t("tabEarnings"), href: carries ? undefined : null, tabBarIcon: ({ color, size }) => <Wallet color={color} size={size ?? 22} strokeWidth={2} /> }} />
      {/* Business (org members only) */}
      <Tabs.Screen name="business" options={{ title: "Business", href: hasOrgs ? undefined : null, tabBarIcon: ({ color, size }) => <Building2 color={color} size={size ?? 22} strokeWidth={2} /> }} />
      <Tabs.Screen name="fleet" options={{ title: "Fleet", href: hasFleet ? undefined : null, tabBarIcon: ({ color, size }) => <Car color={color} size={size ?? 22} strokeWidth={2} /> }} />
      {/* Shared */}
      <Tabs.Screen name="profile" options={{ title: t("tabProfile"), tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} strokeWidth={2} /> }} />
      {/* Non-tab screens (pushed full-screen, hidden from the tab bar) */}
      <Tabs.Screen name="hub" options={{ href: null }} />
      <Tabs.Screen name="zones" options={{ href: null }} />
      <Tabs.Screen name="drivers" options={{ href: null }} />
      <Tabs.Screen name="directions" options={{ href: null }} />
      <Tabs.Screen name="details" options={{ href: null }} />
      <Tabs.Screen name="confirm" options={{ href: null }} />
      <Tabs.Screen name="request" options={{ href: null }} />
      <Tabs.Screen name="track" options={{ href: null }} />
      <Tabs.Screen name="tax" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
