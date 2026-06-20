import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import TabSwitcher from "../components/TabSwitcher";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { getCustomers } from "../lib/sessions";
import { getStoredShopId } from "../config/shopConfig";
import type { Customer } from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * Read-only by design — see SPEC.md: "No edit capability — reinforces
 * that this data is system-generated, not entered." Customers tab has
 * no dominant action at all, which is itself correct per the "one screen,
 * one action" law (a pure-browse screen's action is simply "look").
 */
export default function CustomersScreen({ navigation }: ScreenProps<"Customers">) {
  const [customers, setCustomers] = useState<Customer[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const shopId = await getStoredShopId();
        if (!shopId) return;
        const data = await getCustomers(shopId);
        setCustomers(data);
      })();
    }, [])
  );

  return (
    <View style={styles.container}>
      <TabSwitcher />

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate("CustomerDetail", { customerId: item.id })}
          >
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.visit_count} visit{item.visit_count === 1 ? "" : "s"}
              </Text>
            </View>
            <Text style={styles.value}>KES {item.lifetime_value.toLocaleString()}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No customers yet</Text>
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
  name: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  value: {
    ...typography.body,
    fontWeight: "600",
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
