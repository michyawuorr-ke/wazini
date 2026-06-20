import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Offline write queue — see docs/SPEC.md section 13 ("Offline-First
 * Design") for the full rationale. Built in response to a real
 * constraint: customers walking into a barbershop frequently have no
 * data/WiFi at all, and the barber's own connection drops often too.
 *
 * DESIGN PRINCIPLE: this queue exists for WRITES the barber initiates
 * from THIS app (manual check-in, verify, void) — never for the
 * customer-facing web check-in, which has no offline path at all (a
 * browser cannot queue "load this page" while genuinely offline; that
 * gap is handled by giving the barber a manual check-in fallback
 * instead, not by trying to make the web app work with zero connectivity).
 *
 * Each queued action is small, self-contained, and idempotent-safe to
 * replay (see each action's own replay logic in offlineSync.ts) — this
 * matters because the queue may be flushed more than once if the app
 * restarts mid-sync, and a double-application of "verify this session"
 * must not double-count revenue.
 */

export type QueuedActionType =
  | "manual_checkin"
  | "verify_session"
  | "void_session";

export interface QueuedAction {
  /** Client-generated, stable across retries — NOT the eventual server-side session id. */
  localId: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  /** Number of times a sync attempt has been made and failed — used to avoid infinite retry storms on a permanently-broken action. */
  attemptCount: number;
  lastError: string | null;
}

const QUEUE_KEY = "wazini:offline_queue";

function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getQueue(): Promise<QueuedAction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    // Corrupted queue data should never crash the app — treat as empty
    // and let new actions start a fresh queue. Losing a malformed queue
    // is better than the app becoming permanently unusable.
    console.warn("Offline queue data was corrupted, resetting.");
    return [];
  }
}

async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueAction(
  type: QueuedActionType,
  payload: Record<string, unknown>
): Promise<QueuedAction> {
  const queue = await getQueue();
  const action: QueuedAction = {
    localId: generateLocalId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null,
  };
  queue.push(action);
  await saveQueue(queue);
  return action;
}

export async function removeFromQueue(localId: string): Promise<void> {
  const queue = await getQueue();
  await saveQueue(queue.filter((a) => a.localId !== localId));
}

export async function markAttemptFailed(
  localId: string,
  error: string
): Promise<void> {
  const queue = await getQueue();
  const updated = queue.map((a) =>
    a.localId === localId
      ? { ...a, attemptCount: a.attemptCount + 1, lastError: error }
      : a
  );
  await saveQueue(updated);
}

export async function getQueueLength(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
