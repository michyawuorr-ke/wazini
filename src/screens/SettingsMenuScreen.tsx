import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * Deliberately tiny — two entries. This exists only because the gear
 * icon now has two destinations (Payment Settings, Services & Prices)
 * instead of one. It is not a dashboard and should not grow beyond a
 * short list of genuine setup/config screens — daily-use actions belong
 * on the Business or Customers tab, never here.
 */
export default function SettingsMenuScreen({ navigation }: ScreenProps<"SettingsMenu">) {
  return (
    <View style={styles.container}>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate("ServicesSettings")}
      >
        <Text style={styles.label}>Services & Prices</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate("PaymentSettings")}
      >
        <Text style={styles.label}>Payment Settings</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.lg,
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
  label: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  chevron: {
    ...typography.h1,
    color: colors.textSecondary,
  },
});
