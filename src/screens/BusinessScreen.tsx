import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import TabSwitcher from "../components/TabSwitcher";
import SessionRow from "../components/SessionRow";
import MpesaCodeModal from "../components/MpesaCodeModal";
import AmbiguousMatchPicker from "../components/AmbiguousMatchPicker";
import VerifiedFlash from "../components/VerifiedFlash";
import SyncStatusBanner from "../components/SyncStatusBanner";
import { useNetworkStatus } from "../offline/useNetworkStatus";
import { useSessionRealtimeSubscription } from "../hooks/useSessionRealtimeSubscription";
import { colors, spacing, typography } from "../theme/tokens";
import { getAwaitingSessions, verifySession } from "../lib/sessions";
import { recomputeTodaySnapshot } from "../lib/businessSignals";
import { useSmsListener } from "../hooks/useSmsListener";
import { getStoredShopId } from "../config/shopConfig";
import type { SessionWithCustomer, VerificationSource } from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

interface VerifiedFlashState {
  customerName: string;
  amount: number;
  source: VerificationSource;
  queued: boolean;
}

export default function BusinessScreen(_props: ScreenProps<"Business">) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [mpesaModalSession, setMpesaModalSession] =
    useState<SessionWithCustomer | null>(null);
  const [ambiguousState, setAmbiguousState] = useState<{
    candidates: SessionWithCustomer[];
    amount: number;
  } | null>(null);
  const [verifiedFlash, setVerifiedFlash] = useState<VerifiedFlashState | null>(null);

  const networkStatus = useNetworkStatus();

  const loadSessions = useCallback(async (currentShopId: string) => {
    try {
      const data = await getAwaitingSessions(currentShopId);
      setSessions(data);
    } catch (err) {
      console.warn("Failed to load awaiting sessions:", err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const id = await getStoredShopId();
      setShopId(id);
      if (id) await loadSessions(id);
      setLoading(false);
    })();
  }, [loadSessions]);

  // Refresh the queue every time this screen regains focus — covers the
  // case where a customer just checked in via the web app while the
  // barber had this screen backgrounded.
  useFocusEffect(
    useCallback(() => {
      if (shopId) loadSessions(shopId);
    }, [shopId, loadSessions])
  );

  // Live updates — pushes new check-ins and any status change into the
  // queue instantly, with zero manual refresh. See
  // useSessionRealtimeSubscription.ts for why this re-fetches the full
  // queue rather than trying to patch a single row in place: realtime
  // payloads don't include joined customer data, and re-fetching is
  // simpler and less bug-prone than hand-merging partial updates.
  // Debounced slightly since a burst of events (e.g. a check-in
  // immediately followed by an SMS-triggered verify) would otherwise
  // trigger back-to-back redundant fetches.
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useSessionRealtimeSubscription(shopId, () => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      if (shopId) loadSessions(shopId);
    }, 250);
  });

  const handleRefresh = async () => {
    if (!shopId) return;
    setRefreshing(true);
    await loadSessions(shopId);
    setRefreshing(false);
  };

  const completeVerification = async (
    session: SessionWithCustomer,
    paymentMode: "mpesa" | "cash",
    amountPaid: number,
    mpesaCode: string | null,
    source: VerificationSource
  ) => {
    try {
      const { queued } = await verifySession({
        sessionId: session.id,
        paymentMode,
        amountPaid,
        mpesaCode,
        verificationSource: source,
      });

      // Optimistically drop it from the local queue immediately —
      // per SPEC.md offline-resilience note, the UI should update before
      // waiting on a round-trip when possible. This happens whether the
      // write went through immediately or was queued for later sync —
      // the barber's queue view always reflects "is the barber done with
      // this customer," not "has this synced to the server yet."
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setVerifiedFlash({
        customerName: session.customer.name,
        amount: amountPaid,
        source,
        queued,
      });

      // Keep today's business signal snapshot current. Fire-and-forget,
      // and skipped entirely when queued — recomputing a snapshot from
      // data that hasn't synced yet would read stale/incomplete numbers;
      // the snapshot will pick this up once the queue drains and a
      // later recompute call (or the next verification) runs.
      if (shopId && !queued) recomputeTodaySnapshot(shopId);
    } catch (err) {
      console.warn("Failed to verify session:", err);
      // Re-sync from server in case of partial failure / stale local state.
      if (shopId) loadSessions(shopId);
    }
  };

  const { startListening, permissionState } = useSmsListener({
    shopId: shopId ?? "",
    awaitingSessions: sessions,
    onAutoMatch: (session, amountPaid, mpesaCode) => {
      completeVerification(session, "mpesa", amountPaid, mpesaCode, "sms_auto");
    },
    onAmbiguous: (candidates, amount) => {
      setAmbiguousState({ candidates, amount });
    },
  });

  useEffect(() => {
    if (shopId) startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const handleConfirmCash = (session: SessionWithCustomer) => {
    completeVerification(session, "cash", session.amount_expected, null, "manual");
  };

  const handleConfirmMpesaCode = (mpesaCode: string, amountPaid: number) => {
    if (!mpesaModalSession) return;
    completeVerification(mpesaModalSession, "mpesa", amountPaid, mpesaCode, "manual");
    setMpesaModalSession(null);
  };

  const handlePickAmbiguousCandidate = (session: SessionWithCustomer) => {
    if (!ambiguousState) return;
    completeVerification(
      session,
      "mpesa",
      ambiguousState.amount,
      null,
      "sms_picker"
    );
    setAmbiguousState(null);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!shopId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Shop not set up yet</Text>
        <Text style={styles.emptySubtitle}>
          This device hasn't been linked to a shop. Contact support to finish setup.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TabSwitcher />

      <View style={styles.header}>
        <Text style={styles.headerLabel}>Awaiting Payment</Text>
        <Text style={styles.headerCount}>{sessions.length}</Text>
      </View>

      <SyncStatusBanner {...networkStatus} />

      {permissionState === "denied" && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Automatic payment matching is off. Confirm payments manually below, or enable SMS access in Settings.
          </Text>
        </View>
      )}

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onConfirmMpesa={() => setMpesaModalSession(item)}
            onConfirmCash={() => handleConfirmCash(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No one waiting</Text>
            <Text style={styles.emptySubtitle}>
              New check-ins will appear here automatically.
            </Text>
          </View>
        }
      />

      <MpesaCodeModal
        visible={!!mpesaModalSession}
        customerName={mpesaModalSession?.customer.name ?? ""}
        amountExpected={mpesaModalSession?.amount_expected ?? 0}
        onCancel={() => setMpesaModalSession(null)}
        onConfirm={handleConfirmMpesaCode}
      />

      <AmbiguousMatchPicker
        visible={!!ambiguousState}
        amount={ambiguousState?.amount ?? 0}
        candidates={ambiguousState?.candidates ?? []}
        onSelect={handlePickAmbiguousCandidate}
        onDismiss={() => setAmbiguousState(null)}
      />

      {verifiedFlash && (
        <VerifiedFlash
          customerName={verifiedFlash.customerName}
          amount={verifiedFlash.amount}
          source={verifiedFlash.source}
          queued={verifiedFlash.queued}
          onDone={() => setVerifiedFlash(null)}
        />
      )}
    </View>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  headerCount: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyTitle: {
    ...typography.h1,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  permissionBanner: {
    backgroundColor: colors.amberSoft,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
  },
  permissionText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
});
