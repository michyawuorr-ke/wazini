import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkIfHasSMSPermission,
  requestReadSMSPermission,
  startReadSMS,
  stopReadSMS,
} from "@maniac-tech/react-native-expo-read-sms";
import { parseMpesaSms } from "../sms/parser";
import { matchSmsToSession } from "../sms/matchingEngine";
import { logSmsEvent } from "../lib/sessions";
import type { SessionWithCustomer } from "../types/domain";

export type SmsPermissionState = "unknown" | "granted" | "denied";

interface UseSmsListenerParams {
  shopId: string;
  /** Always the current queue — recomputed on every render that changes it, read fresh inside the SMS callback via ref. */
  awaitingSessions: SessionWithCustomer[];
  onAutoMatch: (session: SessionWithCustomer, amountPaid: number, mpesaCode: string | null, source: "sms_auto") => void;
  onAmbiguous: (candidates: SessionWithCustomer[], amount: number) => void;
}

/**
 * Wires the native SMS listener to the matching engine.
 *
 * IMPORTANT — known limitation, stated plainly per SPEC.md "Risks
 * specific to this architecture": this listener is only active while
 * the app is open/foregrounded by this hook's lifecycle. It is NOT yet
 * a true Android foreground service with a persistent notification
 * (the spec's chosen reliability option). That upgrade requires a
 * custom native module / config plugin beyond what
 * @maniac-tech/react-native-expo-read-sms provides out of the box —
 * tracked as a follow-up, not silently assumed to be solved here. Until
 * then, the manual confirm buttons are not a fallback for an edge case —
 * they are the primary path whenever the barber's phone has the app
 * backgrounded or closed.
 */
export function useSmsListener({
  shopId,
  awaitingSessions,
  onAutoMatch,
  onAmbiguous,
}: UseSmsListenerParams) {
  const [permissionState, setPermissionState] =
    useState<SmsPermissionState>("unknown");
  const [isListening, setIsListening] = useState(false);

  // Read inside the SMS callback via ref so we always match against the
  // latest queue, without re-subscribing the native listener on every
  // queue change (which would be wasteful and could drop in-flight SMS).
  const sessionsRef = useRef(awaitingSessions);
  useEffect(() => {
    sessionsRef.current = awaitingSessions;
  }, [awaitingSessions]);

  const checkPermission = useCallback(async () => {
    try {
      const result = await checkIfHasSMSPermission();
      const granted = result.hasReceiveSmsPermission && result.hasReadSmsPermission;
      setPermissionState(granted ? "granted" : "denied");
      return granted;
    } catch {
      setPermissionState("denied");
      return false;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const granted = await requestReadSMSPermission();
      setPermissionState(granted ? "granted" : "denied");
      return granted;
    } catch {
      setPermissionState("denied");
      return false;
    }
  }, []);

  const handleIncomingSms = useCallback(
    async (rawSms: unknown) => {
      // The package's README documents the payload as a string formatted
      // like "[+919999999999, message body]", but since this package
      // ships no types and we can't inspect native Android code from
      // here, we handle it defensively: try array-like extraction first,
      // fall back to treating the whole thing as the message body. The
      // parser itself is tolerant of extra/missing text either way.
      let messageBody: string;
      if (Array.isArray(rawSms)) {
        messageBody = String(rawSms[1] ?? rawSms[0] ?? "");
      } else {
        messageBody = String(rawSms ?? "");
      }

      const parsed = parseMpesaSms(messageBody);

      if (!parsed.isLikelyMpesa) {
        return; // not an M-Pesa SMS at all (could be any other text) — ignore silently, do not log
      }

      const outcome = matchSmsToSession(parsed, sessionsRef.current);

      await logSmsEvent({
        shopId,
        rawText: parsed.rawText,
        parsedCode: parsed.mpesaCode,
        parsedAmount: parsed.amount,
        parsedPhone: parsed.senderPhone,
        parsedName: parsed.senderName,
        matchResult: outcome.result,
        matchedSessionId: outcome.matchedSession?.id ?? null,
      });

      if (
        (outcome.result === "auto_phone" || outcome.result === "auto_name") &&
        outcome.matchedSession
      ) {
        onAutoMatch(
          outcome.matchedSession,
          parsed.amount ?? outcome.matchedSession.amount_expected,
          parsed.mpesaCode,
          "sms_auto"
        );
      } else if (outcome.result === "ambiguous" && parsed.amount !== null) {
        onAmbiguous(outcome.candidates, parsed.amount);
      }
      // no_match → intentionally silent beyond the audit log; session
      // stays AWAITING_PAYMENT, manual confirm remains available.
    },
    [shopId, onAutoMatch, onAmbiguous]
  );

  const startListening = useCallback(async () => {
    const granted = await checkPermission();
    if (!granted) return;

    // Real signature is startReadSMS(callback) where callback receives
    // (status, sms, error) — NOT separate success/error callbacks as the
    // package's README implies. Confirmed against the installed source,
    // since this package ships no TypeScript types.
    startReadSMS((status: string, sms: string, error?: unknown) => {
      if (status === "success" && sms) {
        handleIncomingSms(sms);
      } else if (status === "error") {
        console.warn(
          "SMS listener error (non-fatal, manual confirm still available):",
          error
        );
      }
    });
    setIsListening(true);
  }, [checkPermission, handleIncomingSms]);

  const stopListening = useCallback(() => {
    stopReadSMS();
    setIsListening(false);
  }, []);

  useEffect(() => {
    // Defensive cleanup — stop the native listener if this hook's owning
    // screen unmounts, so we don't leak a listener across navigation.
    return () => {
      stopReadSMS();
    };
  }, []);

  return {
    permissionState,
    isListening,
    checkPermission,
    requestPermission,
    startListening,
    stopListening,
  };
}
