import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import type { SessionWithCustomer } from "../types/domain";

interface AmbiguousMatchPickerProps {
  visible: boolean;
  amount: number;
  candidates: SessionWithCustomer[];
  onSelect: (session: SessionWithCustomer) => void;
  onDismiss: () => void;
}

/**
 * Implements SPEC.md matching engine outcome "ambiguous" — covers both
 * the single-low-confidence-candidate case (1-tap confirm) and the
 * true multiple-candidate case (real picker), same component either way.
 */
export default function AmbiguousMatchPicker({
  visible,
  amount,
  candidates,
  onSelect,
  onDismiss,
}: AmbiguousMatchPickerProps) {
  const isSingleConfirm = candidates.length === 1;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {isSingleConfirm ? "Confirm this payment" : "Which customer paid?"}
          </Text>
          <Text style={styles.subtitle}>
            A payment of KES {amount.toLocaleString()} was received.
          </Text>

          <FlatList
            data={candidates}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.candidateRow} onPress={() => onSelect(item)}>
                <Text style={styles.candidateName}>{item.customer.name}</Text>
                <Text style={styles.candidateMeta}>
                  {item.service_name} · #{item.session_code}
                </Text>
              </Pressable>
            )}
          />

          <Pressable style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissLabel}>None of these — confirm manually later</Text>
          </Pressable>
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
    maxHeight: "70%",
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  list: {
    marginBottom: spacing.md,
  },
  candidateRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paperMuted,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  candidateName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  candidateMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dismissButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  dismissLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
