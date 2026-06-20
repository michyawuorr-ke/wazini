import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, radius, spacing, typography } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The persistent switcher enforcing the 2-tab law: Business and Customers,
 * always visible, always exactly these two. Lives at the top of both
 * top-level screens rather than as a separate @react-navigation/bottom-tabs
 * instance — keeps this one small, explicit component instead of pulling
 * in tab-bar styling/badge/icon config for something this simple.
 */
export default function TabSwitcher() {
  const navigation = useNavigation<Nav>();
  const route = useRoute();

  const isBusinessActive = route.name === "Business";

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => navigation.navigate("Business")}
        style={[styles.tab, isBusinessActive && styles.tabActive]}
      >
        <Text style={[styles.tabLabel, isBusinessActive && styles.tabLabelActive]}>
          Business
        </Text>
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate("Customers")}
        style={[styles.tab, !isBusinessActive && styles.tabActive]}
      >
        <Text style={[styles.tabLabel, !isBusinessActive && styles.tabLabelActive]}>
          Customers
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.paperMuted,
    borderRadius: radius.full,
    padding: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.ink,
  },
  tabLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.textOnDark,
  },
});
