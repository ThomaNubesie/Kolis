// Shared delivery receipt — used by both the courier (payout) and the sender
// (price). The amount shown is whatever the caller passes; the role-walled RPC
// guarantees a courier can only ever fetch a payout and a sender a price.
import { useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../constants/colors";
import { useStrings } from "../hooks/useStrings";
import { ReceiptAPI } from "../services/verification";

const SIZE_EMOJI: Record<string, string> = { envelope: "✉️", small: "📦", large: "🧳" };

export type DeliveryReceiptData = {
  receiptId: string;       // parcel code, e.g. KL-1234
  fromCity: string;
  toCity: string;
  size: string;
  dropoffType: string;
  amountLabel: string;     // "Payout" or "Total paid"
  amountCents: number;
  dateISO: string;         // delivered_at or created_at
};

export function DeliveryReceiptModal({ visible, data, onClose }: { visible: boolean; data: DeliveryReceiptData | null; onClose: () => void }) {
  const { t } = useStrings();
  const [channel, setChannel] = useState<"email" | "save" | "both">("both");
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const total = `C$${(data.amountCents / 100).toFixed(2)}`;
  const date = (data.dateISO || "").slice(0, 10);
  const lines = [{ label: data.amountLabel, amount: total }];

  const finish = async () => {
    setBusy(true);
    const receipt = { receiptId: data.receiptId, lines, total, date };
    if (channel === "save" || channel === "both") {
      try {
        const raw = await AsyncStorage.getItem("kolis_receipts");
        const list = raw ? JSON.parse(raw) : [];
        list.unshift({ ...receipt, savedAt: Date.now() });
        await AsyncStorage.setItem("kolis_receipts", JSON.stringify(list.slice(0, 50)));
      } catch {}
    }
    if (channel === "email" || channel === "both") {
      try { await ReceiptAPI.email(receipt); } catch {}
    }
    setBusy(false);
    onClose();
  };

  const opt = (key: "email" | "save" | "both", label: string) => (
    <Pressable key={key} onPress={() => setChannel(key)}
      style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: channel === key ? Colors.accent : Colors.line, backgroundColor: channel === key ? "#fdeef4" : "#fff" }}>
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: channel === key ? Colors.accentDk : Colors.t2 }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,26,23,0.5)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 22 }}>
          <Text style={{ fontSize: 42, textAlign: "center" }}>🎉</Text>
          <Text style={{ fontSize: 20, fontWeight: "900", color: Colors.ink, textAlign: "center", marginTop: 4 }}>{t("delivered")}</Text>
          <Text style={{ fontSize: 12.5, color: Colors.t2, textAlign: "center", marginBottom: 16 }}>#{data.receiptId} · {data.fromCity} → {data.toCity}</Text>

          <View style={{ backgroundColor: Colors.bg, borderRadius: 13, padding: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: 6 }}>
              <Text style={{ color: Colors.t2, fontSize: 13 }}>{SIZE_EMOJI[data.size] ?? "📦"} {data.dropoffType === "hub" ? "🏢" : "🚪"}</Text>
              <Text style={{ color: Colors.t3, fontSize: 12 }}>{date}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: 9 }}>
              <Text style={{ fontWeight: "900", fontSize: 15, color: Colors.ink }}>{data.amountLabel}</Text>
              <Text style={{ fontWeight: "900", fontSize: 15, color: Colors.accent }}>{total}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 10.5, fontWeight: "800", color: Colors.t3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>{t("rcptKeepReceipt")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            {opt("email", t("rcptEmail"))}
            {opt("save", t("rcptSave"))}
            {opt("both", t("rcptBoth"))}
          </View>

          <Pressable onPress={finish} disabled={busy} style={{ backgroundColor: Colors.accent, borderRadius: 13, padding: 15, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{t("done")}</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
