import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { getMyShops } from "../lib/auth";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * Deliberately small. "Manage Barbers" and "Business Health" are
 * owner-only — genuinely hidden from barbers here, not just blocked
 * server-side, per the explicit decision that barbers should not see
 * Business Health at all. The RLS policies from migration 013 are
 * still the REAL enforcement boundary (a barber could never read this
 * data even by hitting the API directly) — this UI-level hide is an
 * additional, deliberate layer for the specific "barbers shouldn't even
 * know this exists" requirement, not a replacement for the database-
 * level guarantee.
 */
export default function SettingsMenuScreen({ navigation }: ScreenProps<"SettingsMenu">) {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const shops = await getMyShops();
          setIsOwner(shops.some((s) => s.role === "owner"));
        } catch (err) {
          console.warn("Failed to determine role:", err);
          setIsOwner(false);
        }
      })();
    }, [])
  );

  if (isOwner === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate("ServicesSettings")}
      >
        <Text style={styles.label}>Services & Prices</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {isOwner && (
        <>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate("PaymentSettings")}
          >
            <Text style={styles.label}>Payment Settings</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate("ManageBarbers")}
          >
            <Text style={styles.label}>Manage Barbers</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate("BusinessHealth")}
          >
            <Text style={styles.label}>Business Health</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
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
