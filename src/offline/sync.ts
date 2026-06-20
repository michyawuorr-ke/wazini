import { supabase } from "../lib/supabase";
import {
  getQueue,
  removeFromQueue,
  markAttemptFailed,
  type QueuedAction,
} from "./queue";

/**
 * Drains the offline queue, replaying each action against Supabase.
 * Called whenever connectivity is restored (see useNetworkStatus.ts)
 * and also on a periodic timer as a safety net in case the
 * connectivity-change event is ever missed.
 *
 * IDEMPOTENCY: each action type is handled defensively against being
 * replayed more than once (possible if the app crashes between a
 * successful Supabase write and the queue removal that follows it):
 *
 *   - manual_checkin: the manual_checkin() DB function itself is
 *     idempotent (returns the existing open session on a duplicate
 *     call rather than erroring) — see migration 008.
 *   - verify_session: the verify_session() DB function raises a
 *     specific exception if the session isn't in a verifiable state
 *     (already VERIFIED, etc.) — we detect that exact case and treat
 *     it as a successful no-op rather than a real failure.
 *   - void_session: same pattern — already-VOIDED is treated as
 *     success, not an error to retry forever.
 */

const MAX_ATTEMPTS_BEFORE_GIVING_UP = 10;

export interface SyncResult {
  succeeded: number;
  failed: number;
  remaining: number;
}

async function replayAction(action: QueuedAction): Promise<"success" | "retry" | "abandon"> {
  try {
    switch (action.type) {
      case "manual_checkin": {
        const { error } = await supabase.rpc("manual_checkin", {
          p_shop_id: action.payload.shopId,
          p_customer_phone: action.payload.customerPhone,
          p_customer_name: action.payload.customerName,
          p_service_name: action.payload.serviceName,
          p_amount_expected: action.payload.amountExpected,
          p_payment_type: action.payload.paymentType,
          p_payment_number: action.payload.paymentNumber,
          p_paybill_account: action.payload.paybillAccount ?? null,
          p_session_code: action.payload.sessionCode,
        });
        if (error) throw error;
        return "success";
      }

      case "verify_session": {
        const { error } = await supabase.rpc("verify_session", {
          p_session_id: action.payload.sessionId,
          p_payment_mode: action.payload.paymentMode,
          p_amount_paid: action.payload.amountPaid,
          p_mpesa_code: action.payload.mpesaCode ?? null,
          p_verification_source: action.payload.verificationSource,
        });
        if (error) {
          // "cannot verify" means this session was already verified —
          // almost certainly by this exact action on a prior attempt
          // that succeeded before the queue could remove it. Treat as
          // success, not a failure to retry.
          if (error.message?.includes("cannot verify")) {
            return "success";
          }
          throw error;
        }
        return "success";
      }

      case "void_session": {
        const { error } = await supabase.rpc("void_session", {
          p_session_id: action.payload.sessionId,
          p_reason: action.payload.reason,
        });
        if (error) {
          if (error.message?.includes("can be voided")) {
            return "success"; // already voided — same reasoning as above
          }
          throw error;
        }
        return "success";
      }

      default:
        console.warn("Unknown queued action type, abandoning:", action.type);
        return "abandon";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markAttemptFailed(action.localId, message);

    if (action.attemptCount + 1 >= MAX_ATTEMPTS_BEFORE_GIVING_UP) {
      // Stop retrying a permanently-broken action (e.g. references a
      // session that was deleted, or a malformed payload from a bug)
      // so it doesn't silently block every future sync forever. This
      // is a real data-loss risk worth being honest about: an action
      // that fails 10 times in a row is logged and dropped, not
      // retried indefinitely. See docs/SPEC.md section 13 for the
      // tradeoff this represents.
      console.warn(
        `Action ${action.localId} (${action.type}) failed ${MAX_ATTEMPTS_BEFORE_GIVING_UP} times, abandoning. Last error: ${message}`
      );
      return "abandon";
    }
    return "retry";
  }
}

export async function syncOfflineQueue(): Promise<SyncResult> {
  const queue = await getQueue();
  let succeeded = 0;
  let failed = 0;

  // Process in order — a manual_checkin must complete before a
  // verify_session for the SAME session can succeed (the session
  // wouldn't exist yet on the server otherwise). Sequential, not
  // parallel, processing preserves this ordering guarantee.
  for (const action of queue) {
    const outcome = await replayAction(action);

    if (outcome === "success" || outcome === "abandon") {
      await removeFromQueue(action.localId);
      if (outcome === "success") succeeded++;
      else failed++;
    } else {
      failed++;
      // Leave it in the queue for the next sync attempt — do not
      // remove. Also stop processing further actions in this run if
      // we hit a retry, since later actions may depend on this one
      // (e.g. a verify for a session this manual_checkin would have
      // created) — better to wait for the next full sync pass than
      // process out of order.
      break;
    }
  }

  const remaining = (await getQueue()).length;
  return { succeeded, failed, remaining };
}
