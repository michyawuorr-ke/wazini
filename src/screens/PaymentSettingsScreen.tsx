import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { getShop, updateShopPaymentSettings } from "../lib/sessions";
import { getStoredShopId } from "../config/shopConfig";
import type { PaymentType } from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * Implements the "barber can change it any time" decision — this is
 * editable config, not fixed at onboarding. Per SPEC.md, changes here
 * take effect for the NEXT check-in only; in-flight sessions keep their
 * snapshot of payment_type/payment_number, so this never disrupts a
 * payment a customer is mid-way through.
 */
export default function PaymentSettingsScreen(_props: ScreenProps<"PaymentSettings">) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("till");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paybillAccount, setPaybillAccount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const id = await getStoredShopId();
        if (!id) return;
        setShopId(id);
        const shop = await getShop(id);
        setPaymentType(shop.payment_type);
        setPaymentNumber(shop.payment_number);
        setPaybillAccount(shop.paybill_account ?? "");
      } catch (err) {
        console.warn("Failed to load payment settings:", err);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!shopId || !paymentNumber.trim()) return;
    setSaving(true);
    try {
      await updateShopPaymentSettings({
        shopId,
        paymentType,
        paymentNumber: paymentNumber.trim(),
        paybillAccount: paymentType === "paybill" ? paybillAccount.trim() : null,
      });
      Alert.alert("Saved", "Payment settings updated.");
    } catch (err) {
      Alert.alert("Couldn't save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Payment Method</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, paymentType === "till" && styles.toggleActive]}
          onPress={() => setPaymentType("till")}
        >
          <Text
            style={[styles.toggleLabel, paymentType === "till" && styles.toggleLabelActive]}
          >
            Till Number
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, paymentType === "paybill" && styles.toggleActive]}
          onPress={() => setPaymentType("paybill")}
        >
          <Text
            style={[styles.toggleLabel, paymentType === "paybill" && styles.toggleLabelActive]}
          >
            Paybill
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>
        {paymentType === "till" ? "Till Number" : "Paybill Number"}
      </Text>
      <TextInput
        style={styles.input}
        value={paymentNumber}
        onChangeText={setPaymentNumber}
        keyboardType="number-pad"
        placeholder={paymentType === "till" ? "e.g. 174379" : "e.g. 522533"}
        placeholderTextColor={colors.textSecondary}
      />

      {paymentType === "paybill" && (
        <>
          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            value={paybillAccount}
            onChangeText={setPaybillAccount}
            placeholder="e.g. WAZINI01"
            placeholderTextColor={colors.textSecondary}
          />
        </>
      )}

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving || !paymentNumber.trim()}
      >
        <Text style={styles.saveLabel}>{saving ? "Saving…" : "Save Changes"}</Text>
      </Pressable>

      <Text style={styles.note}>
        Changes apply to new check-ins only. Customers already mid-payment keep seeing the
        details they were shown.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.paperMuted,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  toggleActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  toggleLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  toggleLabelActive: {
    color: colors.textOnDark,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  saveButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
