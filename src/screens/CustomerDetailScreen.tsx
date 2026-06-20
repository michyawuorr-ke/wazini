import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { getCustomerSessionHistory } from "../lib/sessions";
import type { SessionWithCustomer } from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export default function CustomerDetailScreen({ route }: ScreenProps<"CustomerDetail">) {
  const { customerId } = route.params;
  const [history, setHistory] = useState<SessionWithCustomer[]>([]);

  useEffect(() => {
    (async () => {
      const data = await getCustomerSessionHistory(customerId);
      setHistory(data);
    })();
  }, [customerId]);

  const customerName = history[0]?.customer.name ?? "";
  const totalSpent = history.reduce((sum, s) => sum + (s.amount_paid ?? 0), 0);

  return (
    <View style={styles.container}>
      {history.length > 0 && (
        <View style={styles.summary}>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.totalValue}>KES {totalSpent.toLocaleString()}</Text>
          <Text style={styles.totalLabel}>Lifetime value</Text>
        </View>
      )}

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.service}>{item.service_name}</Text>
              <Text style={styles.date}>
                {item.verified_at ? formatDate(item.verified_at) : ""}
              </Text>
            </View>
            <Text style={styles.amount}>KES {(item.amount_paid ?? 0).toLocaleString()}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No visits recorded yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  summary: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    marginBottom: spacing.md,
  },
  customerName: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  totalValue: {
    ...typography.display,
    fontSize: 40,
    color: colors.ink,
  },
  totalLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.sm,
  },
  service: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  date: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  amount: {
    ...typography.body,
    color: colors.textPrimary,
  },
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
