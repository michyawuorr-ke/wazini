import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import {
  getDailySnapshots,
  getRevenueVolatility,
  getGrowthTrajectory,
  getCustomerConcentration,
  getRepeatCustomerRate,
} from "../lib/businessSignals";
import { getStoredShopId } from "../config/shopConfig";
import type {
  DailyBusinessSnapshot,
  RevenueVolatility,
  GrowthTrajectory,
  CustomerConcentration,
  RepeatCustomerRate,
} from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * Makes the financial signal layer (built in migrations 005-007, see
 * docs/SPEC.md section 11) visible for the first time — previously this
 * data computed silently in the background after every payment
 * verification, with no UI ever showing it to anyone. Owner-only by
 * deliberate choice (not a barber-facing screen) — enforced here by
 * navigation (only reachable from an owner-gated entry point, once that
 * gating is added to SettingsMenuScreen) and at the database layer via
 * the RLS read policy on daily_business_snapshot from migration 013.
 *
 * Intentionally plain — large numbers, simple labels, per the same
 * "premium = clarity, not decoration" design law as the rest of the
 * app. This is not a dashboard with charts; it's a small set of
 * specific, honestly-labeled numbers, with explicit "not enough data
 * yet" states rather than misleading zeros when history is too short.
 */
export default function BusinessHealthScreen(_props: ScreenProps<"BusinessHealth">) {
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<DailyBusinessSnapshot[]>([]);
  const [volatility, setVolatility] = useState<RevenueVolatility | null>(null);
  const [growth, setGrowth] = useState<GrowthTrajectory | null>(null);
  const [concentration, setConcentration] = useState<CustomerConcentration | null>(null);
  const [repeatRate, setRepeatRate] = useState<RepeatCustomerRate | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const shopId = await getStoredShopId();
          if (!shopId) return;

          const [snap, vol, grw, conc, rep] = await Promise.all([
            getDailySnapshots(shopId, 7),
            getRevenueVolatility(shopId),
            getGrowthTrajectory(shopId),
            getCustomerConcentration(shopId),
            getRepeatCustomerRate(shopId),
          ]);

          setSnapshots(snap);
          setVolatility(vol);
          setGrowth(grw);
          setConcentration(conc);
          setRepeatRate(rep);
        } catch (err) {
          console.warn("Failed to load business health data:", err);
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const todayRevenue = snapshots[0]?.revenue_total ?? 0;
  const last7DaysRevenue = snapshots.reduce((sum, s) => sum + s.revenue_total, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Today</Text>
        <Text style={styles.heroValue}>KES {todayRevenue.toLocaleString()}</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Last 7 days</Text>
          <Text style={styles.statValue}>KES {last7DaysRevenue.toLocaleString()}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Repeat customers</Text>
          <Text style={styles.statValue}>
            {repeatRate?.repeat_rate !== null && repeatRate?.repeat_rate !== undefined
              ? `${Math.round(repeatRate.repeat_rate * 100)}%`
              : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Growth</Text>
        {growth?.growth_ratio !== null && growth?.growth_ratio !== undefined ? (
          <Text style={styles.sectionBody}>
            {growth.growth_ratio > 1
              ? `Revenue is up ${Math.round((growth.growth_ratio - 1) * 100)}% vs. the prior 14 days.`
              : growth.growth_ratio < 1
              ? `Revenue is down ${Math.round((1 - growth.growth_ratio) * 100)}% vs. the prior 14 days.`
              : "Revenue is flat vs. the prior 14 days."}
          </Text>
        ) : (
          <Text style={styles.sectionEmpty}>
            Not enough history yet — check back after a few weeks of activity.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Revenue Stability</Text>
        {volatility?.coefficient_of_variation !== null &&
        volatility?.coefficient_of_variation !== undefined ? (
          <Text style={styles.sectionBody}>
            {volatility.coefficient_of_variation < 0.3
              ? "Your daily revenue has been fairly steady."
              : volatility.coefficient_of_variation < 0.6
              ? "Your daily revenue varies a moderate amount day to day."
              : "Your daily revenue varies a lot day to day."}
          </Text>
        ) : (
          <Text style={styles.sectionEmpty}>
            Not enough days of activity yet to measure this.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer Concentration</Text>
        {concentration?.top_5_concentration_ratio !== null &&
        concentration?.top_5_concentration_ratio !== undefined ? (
          <Text style={styles.sectionBody}>
            Your top 5 customers make up{" "}
            {Math.round(concentration.top_5_concentration_ratio * 100)}% of your revenue over
            the last 90 days.
          </Text>
        ) : (
          <Text style={styles.sectionEmpty}>No revenue recorded in the last 90 days yet.</Text>
        )}
      </View>

      <Text style={styles.footnote}>
        This is your shop's own data, computed from confirmed payments. It isn't shared with
        anyone outside your account.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  heroLabel: {
    ...typography.label,
    color: "#C9C2B5",
    marginBottom: spacing.xs,
  },
  heroValue: {
    ...typography.display,
    fontSize: 40,
    color: colors.paper,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.paperMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.h1,
    fontSize: 20,
    color: colors.textPrimary,
  },
  section: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  sectionBody: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sectionEmpty: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
