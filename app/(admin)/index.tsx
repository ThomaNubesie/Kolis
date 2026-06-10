// Admin home — live metric tiles + role-aware nav. Backed by kolis_admin_overview.
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AdminAPI, Overview, AdminRole } from "../../services/admin";

const c$ = (cents?: number) => `C$${Math.round((cents ?? 0) / 100)}`;

export default function AdminHome() {
  const { t } = useStrings();
  const router = useRouter();
  const [ov, setOv] = useState<Overview | null>(null);
  const [role, setRole] = useState<AdminRole>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    AdminAPI.overview().then(setOv).catch(() => {});
    AdminAPI.role().then(setRole).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const Tile = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <View style={{ width: "48%", borderWidth: 1.5, borderColor: Colors.line, borderRadius: 13, backgroundColor: "#fff", padding: 12, marginBottom: 9 }}>
      <Text style={{ fontSize: 10, color: Colors.t3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 21, fontWeight: "900", color: tone ?? Colors.ink, marginTop: 3 }}>{value}</Text>
    </View>
  );
  const Row = ({ icon, label, to, badge }: { icon: string; label: string; to: string; badge?: number }) => (
    <Pressable onPress={() => router.push(to as any)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.line }}>
      <Text style={{ fontSize: 17, width: 24, textAlign: "center" }}>{icon}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: "700", color: Colors.ink, flex: 1 }}>{label}</Text>
      {badge ? <View style={{ backgroundColor: "rgba(220,38,38,0.12)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: "#b91c1c", fontWeight: "800", fontSize: 11 }}>{badge}</Text></View> : null}
      <Text style={{ color: Colors.t3, fontSize: 16 }}>›</Text>
    </Pressable>
  );

  const can = (...roles: AdminRole[]) => role != null && roles.includes(role);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.accent} />}>
        <Pressable onPress={() => router.replace("/(app)/profile")}><Text style={{ color: Colors.t2, fontSize: 15, marginBottom: 8 }}>← {t("tabProfile")}</Text></Pressable>
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.ink }}>{t("admin")}</Text>
        <Text style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: "800", color: Colors.accentDk, backgroundColor: "rgba(225,29,107,0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6, marginBottom: 12, overflow: "hidden" }}>🔒 {role ? role.toUpperCase() : "—"}</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Tile label="In transit" value={String(ov?.in_transit ?? 0)} />
          <Tile label="Awaiting driver" value={String(ov?.awaiting ?? 0)} tone={Colors.accent} />
          <Tile label="Delivered today" value={String(ov?.delivered_today ?? 0)} tone="#178a5e" />
          <Tile label="Revenue today" value={c$(ov?.revenue_today_cents)} />
          <Tile label="Pending payouts" value={c$(ov?.pending_payout_cents)} />
          <Tile label="Open claims" value={String(ov?.open_claims ?? 0)} tone={ov?.open_claims ? "#b91c1c" : Colors.ink} />
        </View>

        <View style={{ marginTop: 6 }}>
          <Row icon="📦" label="Parcels" to="/(admin)/parcels" />
          <Row icon="🚚" label={t("adminDispatch")} to="/(admin)/dispatch" />
          <Row icon="🛡️" label="Insurance claims" to="/(admin)/claims" badge={ov?.open_claims || undefined} />
          <Row icon="👥" label="Members" to="/(admin)/members" />
          <Row icon="💸" label={t("payouts")} to="/(admin)/payouts" />
          <Row icon="🏢" label={t("adminHubs")} to="/(admin)/hubs" />
          {can("owner") ? <Row icon="🔑" label="Team & access" to="/(admin)/team" /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
