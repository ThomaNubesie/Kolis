// Profile / account (mockup A1): avatar + name + ID-verified / Founding badges,
// then Role · Wallet · Notifications · Language · Help · Sign out · Delete.
import { useCallback, useState } from "react";
import { View, Text, Pressable, Alert, Linking, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../../constants/colors";
import { useStrings } from "../../hooks/useStrings";
import { AuthAPI } from "../../services/auth";
import { AdminAPI } from "../../services/admin";
import { ProfileAPI, KolisProfile, KolisRole } from "../../services/profile";

export default function Profile() {
  const router = useRouter();
  const { t, lang, setLang } = useStrings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [prof, setProf] = useState<KolisProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    AdminAPI.isAdmin().then(setIsAdmin);
    ProfileAPI.get().then(setProf);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const roleLabel = (r?: KolisRole | null) =>
    r === "both" ? t("roleBoth") : r === "courier" ? t("roleCourier") : t("roleSender");
  const name = prof?.full_name || "Kolis";
  const initial = (name.trim()[0] || "K").toUpperCase();

  const signOut = async () => {
    await AuthAPI.signOut();
    router.replace("/(auth)/language");
  };

  // Existing unverified members can re-enter the Stripe Identity flow any time.
  const startVerify = async () => {
    if (prof?.role) await AsyncStorage.setItem("userRole", prof.role);
    router.push("/(auth)/verify");
  };

  const changeRole = () => {
    const opts: { label: string; v: KolisRole }[] = [
      { label: t("roleSender"), v: "sender" }, { label: t("roleCourier"), v: "courier" }, { label: t("roleBoth"), v: "both" },
    ];
    Alert.alert(t("changeRole"), undefined, [
      ...opts.map((o) => ({ text: o.label, onPress: async () => { await ProfileAPI.save({ role: o.v }); load(); } })),
      { text: t("cancel"), style: "cancel" as const },
    ]);
  };

  const confirmDelete = () => {
    if (deleting) return;
    Alert.alert(t("deleteAccount"), t("deleteAccountBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deleteAccount"), style: "destructive",
        onPress: async () => {
          setDeleting(true);
          const { error } = await ProfileAPI.deleteAccount();
          if (error) { setDeleting(false); Alert.alert("Kolis", error); return; }
          await AuthAPI.signOut();
          router.replace("/(auth)/language");
        },
      },
    ]);
  };

  const Pill = ({ children, tone }: { children: string; tone: "green" | "gold" | "grey" }) => {
    const bg = tone === "green" ? "rgba(46,204,143,0.16)" : tone === "gold" ? "rgba(232,185,49,0.18)" : Colors.cardAlt;
    const fg = tone === "green" ? "#178a5e" : tone === "gold" ? "#8a6d12" : Colors.t2;
    return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: fg, fontWeight: "800", fontSize: 11 }}>{children}</Text></View>;
  };

  const Row = ({ icon, label, value, onPress, danger, last }: { icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean; last?: boolean }) => (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: Colors.line }}>
      <Text style={{ fontSize: 17, marginRight: 13, width: 22, textAlign: "center" }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: danger ? Colors.accentDk : Colors.ink }}>{label}</Text>
        {value ? <Text style={{ fontSize: 12, color: Colors.t3, marginTop: 1 }}>{value}</Text> : null}
      </View>
      {onPress && !danger ? <Text style={{ color: Colors.t3, fontSize: 16 }}>›</Text> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {/* Identity */}
        <View style={{ alignItems: "center", marginBottom: 18, marginTop: 6 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 26 }}>{initial}</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: "900", color: Colors.ink, marginTop: 8 }}>{name}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 7 }}>
            <Pill tone={prof?.identity_verified ? "green" : "grey"}>{prof?.identity_verified ? "✓ " + t("idVerified") : t("notVerified")}</Pill>
            {prof?.is_founding && prof?.founding_number ? <Pill tone="gold">{t("foundingNo", { n: prof.founding_number })}</Pill> : null}
          </View>
        </View>

        {/* Verify CTA — only while unverified. States what they're missing. */}
        {prof && !prof.identity_verified ? (
          <Pressable onPress={startVerify} style={{ backgroundColor: "#fdeef4", borderWidth: 1, borderColor: Colors.accent, borderRadius: 16, padding: 15, marginBottom: 14 }}>
            <Text style={{ fontWeight: "900", color: Colors.accentDk, fontSize: 15 }}>
              {lang === "fr" ? "Vérifiez votre identité" : "Verify your identity"}
            </Text>
            <Text style={{ color: Colors.t2, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
              {lang === "fr"
                ? "Activez votre compte pour accepter des livraisons et réclamer votre place de fondateur gratuite (100 premiers par rôle) avant qu'elle ne disparaisse."
                : "Unlock your account to accept deliveries and claim your free founding spot (first 100 per role) before it's gone."}
            </Text>
            <View style={{ alignSelf: "flex-start", backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 11 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{lang === "fr" ? "Vérifier maintenant →" : "Verify now →"}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Rows */}
        <View style={{ backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 15, borderWidth: 1, borderColor: Colors.line }}>
          <Row icon="🔁" label={t("roleLabel")} value={roleLabel(prof?.role)} onPress={changeRole} />
          <Row icon="✉️" label={lang === "fr" ? "Coordonnées" : "Contact info"} value={prof?.email || (prof as any)?.phone || (lang === "fr" ? "Ajouter" : "Add")} onPress={() => router.push("/(app)/contact")} />
          <Row icon="💳" label={t("wallet")} onPress={() => router.push("/(app)/wallet")} />
          <Row icon="🔔" label={t("notifications")} onPress={() => router.push("/(app)/notifications")} />
          <Row icon="🌐" label={t("chooseLanguage")} value={lang === "en" ? "English" : "Français"} onPress={() => setLang(lang === "en" ? "fr" : "en")} />
          <Row icon="❓" label={t("helpSupport")} onPress={() => Linking.openURL("mailto:support@kolis.ca").catch(() => {})} />
          {isAdmin ? <Row icon="🛠️" label={t("admin")} onPress={() => router.push("/(admin)")} /> : null}
          <Row icon="↩︎" label={t("signOut")} onPress={signOut} />
          <Row icon="🗑️" label={deleting ? t("deleting") : t("deleteAccount")} onPress={confirmDelete} danger last />
        </View>

        {/* Ownership */}
        <View style={{ alignItems: "center", marginTop: 22 }}>
          <Text style={{ textAlign: "center", color: Colors.t3, fontSize: 12 }}>Kolis · {t("partOf")}</Text>
          <Text style={{ textAlign: "center", color: Colors.t3, fontSize: 11.5, marginTop: 4 }}>{t("ownedBy")}</Text>
          <Pressable onPress={() => Linking.openURL("https://www.concordexpress.ca").catch(() => {})}>
            <Text style={{ textAlign: "center", color: Colors.accent, fontSize: 11.5, marginTop: 1, fontWeight: "600" }}>www.concordexpress.ca</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
