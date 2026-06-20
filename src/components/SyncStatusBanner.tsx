import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import type { NetworkStatus } from "../offline/useNetworkStatus";

/**
 * Persistent, low-key status indicator — shown only when there's
 * something worth knowing (offline, or actions waiting to sync).
 * Deliberately absent/invisible the rest of the time, per the "zero
 * clutter" design law — this is not a permanent chrome element, it
 * only appears when its information is actually relevant.
 */
export default function SyncStatusBanner({ isOnline, pendingCount, isSyncing }: NetworkStatus) {
  if (isOnline && pendingCount === 0) return null;

  return (
    <View style={[styles.banner, !isOnline && styles.offlineBanner]}>
      {isSyncing ? (
        <ActivityIndicator size="small" color={colors.amber} style={styles.spinner} />
      ) : null}
      <Text style={styles.text}>
        {!isOnline
          ? pendingCount > 0
            ? `Offline — ${pendingCount} action${pendingCount === 1 ? "" : "s"} waiting to sync`
            : "Offline — actions will be saved and synced automatically"
          : `Syncing ${pendingCount} pending action${pendingCount === 1 ? "" : "s"}…`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.amberSoft,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  offlineBanner: {
    backgroundColor: colors.paperMuted,
  },
  spinner: {
    marginRight: spacing.sm,
  },
  text: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
  },
});
