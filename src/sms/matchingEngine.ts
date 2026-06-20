/**
 * The matching engine — implements SPEC.md section 4 ("Matching Engine —
 * Precise Logic") exactly:
 *
 *   1. Phone match (if SMS contains sender phone) — strongest signal,
 *      wins even if amount differs (records the discrepancy instead of
 *      ignoring the match).
 *   2. Amount + fuzzy name match — used when phone isn't present in the
 *      SMS, or didn't resolve to exactly one candidate.
 *   3. Ambiguous → caller must show the barber a picker. Note: even a
 *      single low-confidence name match is "ambiguous" (gets a 1-tap
 *      confirm), not auto-verified — see spec.
 *   4. No match → log only, session stays AWAITING_PAYMENT, manual
 *      confirm flow remains available.
 *
 * This module is pure (no I/O) so it can be unit tested without a live
 * Supabase connection — see __tests__/matching.test.ts.
 */

import levenshtein from "fast-levenshtein";
import type { ParsedMpesaSms } from "./parser";
import type { SessionWithCustomer, SmsMatchResult } from "../types/domain";

export interface MatchOutcome {
  result: SmsMatchResult;
  /** Single best/only matched session, when result is auto_phone or auto_name */
  matchedSession: SessionWithCustomer | null;
  /** Multiple candidates needing a barber decision, when result is ambiguous */
  candidates: SessionWithCustomer[];
}

const NAME_MATCH_THRESHOLD = 0.7; // normalized similarity, 0..1

/** Normalized Levenshtein similarity: 1.0 = identical, 0.0 = completely different. */
function nameSimilarity(a: string, b: string): number {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (!normA || !normB) return 0;
  const distance = levenshtein.get(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

export function matchSmsToSession(
  parsed: ParsedMpesaSms,
  awaitingSessions: SessionWithCustomer[]
): MatchOutcome {
  if (!parsed.isLikelyMpesa || parsed.amount === null) {
    return { result: "no_match", matchedSession: null, candidates: [] };
  }

  // STEP 1 — phone match
  if (parsed.senderPhone) {
    const phoneCandidates = awaitingSessions.filter(
      (s) => s.customer.phone === parsed.senderPhone
    );

    if (phoneCandidates.length === 1) {
      // Phone is the strongest identity signal — match wins regardless
      // of whether amount_expected equals parsed.amount. The discrepancy
      // (if any) is captured by the caller setting amount_paid separately,
      // not silently dropped.
      return {
        result: "auto_phone",
        matchedSession: phoneCandidates[0],
        candidates: [],
      };
    }
    // 0 or 2+ phone candidates → fall through to amount+name matching.
  }

  // STEP 2 — amount + fuzzy name match
  const amountCandidates = awaitingSessions.filter(
    (s) => s.amount_expected === parsed.amount
  );

  if (amountCandidates.length === 0) {
    return { result: "no_match", matchedSession: null, candidates: [] };
  }

  if (amountCandidates.length === 1) {
    const candidate = amountCandidates[0];
    const similarity = parsed.senderName
      ? nameSimilarity(parsed.senderName, candidate.customer.name)
      : 0;

    if (similarity > NAME_MATCH_THRESHOLD) {
      return { result: "auto_name", matchedSession: candidate, candidates: [] };
    }

    // Single candidate but low-confidence name — still surface to the
    // barber as a 1-tap confirm picker rather than silently matching.
    return { result: "ambiguous", matchedSession: null, candidates: [candidate] };
  }

  // 2+ candidates with the same expected amount — true ambiguity,
  // full picker required.
  return {
    result: "ambiguous",
    matchedSession: null,
    candidates: amountCandidates,
  };
}
