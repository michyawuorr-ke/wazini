import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { syncOfflineQueue } from "./sync";
import { getQueueLength } from "./queue";

export interface NetworkStatus {
  isOnline: boolean;
  /** How many actions are sitting in the local queue, waiting to sync. */
  pendingCount: number;
  /** True while an active sync pass is running. */
  isSyncing: boolean;
  /** Manually trigger a sync attempt (e.g. a pull-to-refresh on the queue screen). */
  triggerSync: () => Promise<void>;
}

/**
 * Tracks connectivity and automatically drains the offline queue
 * whenever the device transitions from offline → online. Also runs a
 * periodic sync as a safety net, since connectivity-change events can
 * occasionally be missed by the OS (a known, documented quirk of
 * NetInfo on some Android OEM skins — exactly the kind of device
 * variance already flagged as a risk for the SMS listener in
 * docs/SPEC.md, same underlying cause: aggressive battery/background
 * management on common Kenyan device brands).
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOffline = useRef(false);

  const refreshPendingCount = async () => {
    const count = await getQueueLength();
    setPendingCount(count);
  };

  const triggerSync = async () => {
    if (isSyncing) return; // avoid overlapping sync passes
    setIsSyncing(true);
    try {
      await syncOfflineQueue();
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  };

  useEffect(() => {
    refreshPendingCount();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);

      if (online && wasOffline.current) {
        // Just came back online — drain the queue.
        triggerSync();
      }
      wasOffline.current = !online;
    });

    // Safety-net periodic sync, every 60s, independent of connectivity
    // events — covers the case where NetInfo's listener doesn't fire
    // reliably on a given device.
    const interval = setInterval(() => {
      triggerSync();
    }, 60_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOnline, pendingCount, isSyncing, triggerSync };
}
