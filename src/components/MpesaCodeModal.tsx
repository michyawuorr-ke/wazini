import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface MpesaCodeModalProps {
  visible: boolean;
  customerName: string;
  amountExpected: number;
  onCancel: () => void;
  onConfirm: (mpesaCode: string, amountPaid: number) => void;
}

export default function MpesaCodeModal({
  visible,
  customerName,
  amountExpected,
  onCancel,
  onConfirm,
}: MpesaCodeModalProps) {
  const [code, setCode] = useState("");

  const handleConfirm = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    onConfirm(trimmed, amountExpected);
    setCode("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Confirm M-Pesa Payment</Text>
          <Text style={styles.subtitle}>
            {customerName} · KES {amountExpected.toLocaleString()}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="M-Pesa code"
            placeholderTextColor={colors.textSecondary}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoFocus
          />

          <View style={styles.row}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, !code.trim() && styles.disabled]}
              onPress={handleConfirm}
              disabled={!code.trim()}
            >
              <Text style={styles.confirmLabel}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 26, 26, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 18,
    letterSpacing: 1,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.paperMuted,
  },
  cancelLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.ink,
  },
  disabled: {
    opacity: 0.4,
  },
  confirmLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
});
