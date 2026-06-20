import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import type { SessionWithCustomer } from "../types/domain";

interface SessionRowProps {
  session: SessionWithCustomer;
  onConfirmMpesa: () => void;
  onConfirmCash: () => void;
}

function timeWaiting(createdAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * One row in the "Awaiting Payment" queue — the Business tab's single
 * dominant action surface. The manual Confirm buttons are ALWAYS present,
 * never hidden behind "automation is working" — see SPEC.md: SMS matching
 * is an acceleration layer that can silently fail back to manual, so the
 * manual path must never be one tap further away than it would be without
 * SMS matching at all.
 */
export default function SessionRow({
  session,
  onConfirmMpesa,
  onConfirmCash,
}: SessionRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name}>{session.customer.name}</Text>
        <Text style={styles.meta}>
          {session.service_name} · KES {session.amount_expected.toLocaleString()}
        </Text>
        <Text style={styles.waiting}>
          #{session.session_code} · waiting {timeWaiting(session.created_at)}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.mpesaButton]} onPress={onConfirmMpesa}>
          <Text style={styles.buttonLabel}>M-Pesa</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.cashButton]} onPress={onConfirmCash}>
          <Text style={[styles.buttonLabel, styles.cashButtonLabel]}>Cash</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  info: {
    marginBottom: spacing.md,
  },
  name: {
    ...typography.h1,
    fontSize: 18,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  waiting: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  mpesaButton: {
    backgroundColor: colors.ink,
  },
  cashButton: {
    backgroundColor: colors.paperMuted,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  buttonLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
  cashButtonLabel: {
    color: colors.textPrimary,
  },
});
