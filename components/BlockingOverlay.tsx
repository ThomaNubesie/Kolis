// Full-screen "please wait" that blocks every touch (tabs included) while a
// pickup/delivery photo uploads or its card is being generated, so the courier
// can't share, leave or tap Done on a card that doesn't exist yet.
//
// Never a trap: when `actions` are given (the caller passes them after a timeout
// or an error), they appear under the message — e.g. Retry / Continue without the
// card. The server sends the card on its own anyway.
import { Modal, View, Text, ActivityIndicator, Pressable } from "react-native";
import { Colors } from "../constants/colors";

export type OverlayAction = { label: string; onPress: () => void; primary?: boolean };

export function BlockingOverlay({ visible, message, sub, actions }: {
  visible: boolean; message: string; sub?: string; actions?: OverlayAction[];
}) {
  const waiting = !actions || actions.length === 0;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { /* blocked */ }}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.55)", alignItems: "center", justifyContent: "center", padding: 28 }}>
        <View style={{ width: "100%", maxWidth: 340, backgroundColor: Colors.card, borderRadius: 18, padding: 22, alignItems: "center" }}>
          {waiting ? <ActivityIndicator size="large" color={Colors.accent} /> : null}
          <Text style={{ fontSize: 16, fontWeight: "900", color: Colors.ink, marginTop: waiting ? 14 : 0, textAlign: "center" }}>{message}</Text>
          {sub ? <Text style={{ fontSize: 12.5, color: Colors.t2, marginTop: 6, textAlign: "center", lineHeight: 18 }}>{sub}</Text> : null}
          {actions && actions.length ? (
            <View style={{ width: "100%", gap: 8, marginTop: 16 }}>
              {actions.map((a) => (
                <Pressable key={a.label} onPress={a.onPress}
                  style={{ borderRadius: 12, padding: 13, alignItems: "center", backgroundColor: a.primary ? Colors.accent : Colors.card, borderWidth: a.primary ? 0 : 1.5, borderColor: Colors.accent }}>
                  <Text style={{ color: a.primary ? "#fff" : Colors.accentDk, fontWeight: "800", fontSize: 14 }}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
