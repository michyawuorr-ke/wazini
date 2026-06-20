import { matchSmsToSession } from "../matchingEngine";
import type { ParsedMpesaSms } from "../parser";
import type { SessionWithCustomer } from "../../types/domain";

function makeSession(
  overrides: Partial<SessionWithCustomer> & {
    customerId: string;
    customerName: string;
    customerPhone: string;
  }
): SessionWithCustomer {
  return {
    id: overrides.id ?? `session-${overrides.customerId}`,
    shop_id: "shop-1",
    customer_id: overrides.customerId,
    service_name: "Haircut",
    amount_expected: overrides.amount_expected ?? 500,
    amount_paid: null,
    status: "AWAITING_PAYMENT",
    payment_mode: null,
    mpesa_code: null,
    session_code: "4821",
    verification_source: null,
    payment_type: "till",
    payment_number: "174379",
    paybill_account: null,
    created_at: new Date().toISOString(),
    verified_at: null,
    voided_at: null,
    void_reason: null,
    customer: {
      id: overrides.customerId,
      name: overrides.customerName,
      phone: overrides.customerPhone,
    },
    ...overrides,
  };
}

const baseParsed: ParsedMpesaSms = {
  rawText: "",
  mpesaCode: "TGR47B3X91",
  amount: 500,
  senderName: "EVANS NDUNGU",
  senderPhone: "+254712345678",
  isLikelyMpesa: true,
};

describe("matchSmsToSession", () => {
  it("auto-matches on phone number when exactly one session has that customer phone", () => {
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Evans Ndungu",
        customerPhone: "+254712345678",
      }),
      makeSession({
        customerId: "c2",
        customerName: "Mary Wanjiru",
        customerPhone: "+254700000000",
        amount_expected: 300,
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    expect(outcome.result).toBe("auto_phone");
    expect(outcome.matchedSession?.customer_id).toBe("c1");
  });

  it("matches by phone even when the parsed amount differs from amount_expected", () => {
    // Phone is the strongest identity signal — should still match,
    // letting the caller record the discrepancy via amount_paid.
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Evans Ndungu",
        customerPhone: "+254712345678",
        amount_expected: 800, // customer actually paid 500 per baseParsed
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    expect(outcome.result).toBe("auto_phone");
    expect(outcome.matchedSession?.customer_id).toBe("c1");
  });

  it("falls through to amount+name matching when phone matches zero sessions", () => {
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Evans Ndungu",
        customerPhone: "+254799999999", // different phone than the SMS
        amount_expected: 500,
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    // No phone match, but amount=500 + name "Evans Ndungu" similarity is high
    expect(outcome.result).toBe("auto_name");
    expect(outcome.matchedSession?.customer_id).toBe("c1");
  });

  it("falls through to amount+name matching when phone matches two+ sessions (shouldn't happen given UNIQUE constraint, but defensive)", () => {
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Evans Ndungu",
        customerPhone: "+254712345678",
        amount_expected: 500,
      }),
      makeSession({
        customerId: "c2",
        customerName: "Someone Else",
        customerPhone: "+254712345678", // duplicate, defensively handled
        amount_expected: 300,
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    // amount=500 only matches c1 by amount, with high name similarity
    expect(outcome.result).toBe("auto_name");
    expect(outcome.matchedSession?.customer_id).toBe("c1");
  });

  it("returns ambiguous (single low-confidence candidate) when name doesn't match well", () => {
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Totally Different Person",
        customerPhone: "+254799999999",
        amount_expected: 500,
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    expect(outcome.result).toBe("ambiguous");
    expect(outcome.matchedSession).toBeNull();
    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0].customer_id).toBe("c1");
  });

  it("returns ambiguous (multiple candidates) when two sessions share the same expected amount", () => {
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Someone One",
        customerPhone: "+254700000001",
        amount_expected: 500,
      }),
      makeSession({
        customerId: "c2",
        customerName: "Someone Two",
        customerPhone: "+254700000002",
        amount_expected: 500,
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    expect(outcome.result).toBe("ambiguous");
    expect(outcome.candidates).toHaveLength(2);
  });

  it("returns no_match when no session has the parsed amount", () => {
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Evans Ndungu",
        customerPhone: "+254799999999",
        amount_expected: 9999,
      }),
    ];

    const outcome = matchSmsToSession(baseParsed, sessions);

    expect(outcome.result).toBe("no_match");
    expect(outcome.matchedSession).toBeNull();
    expect(outcome.candidates).toHaveLength(0);
  });

  it("returns no_match when the SMS wasn't recognized as M-Pesa at all", () => {
    const notMpesa: ParsedMpesaSms = {
      rawText: "random text",
      mpesaCode: null,
      amount: null,
      senderName: null,
      senderPhone: null,
      isLikelyMpesa: false,
    };
    const sessions = [
      makeSession({
        customerId: "c1",
        customerName: "Evans Ndungu",
        customerPhone: "+254712345678",
      }),
    ];

    const outcome = matchSmsToSession(notMpesa, sessions);

    expect(outcome.result).toBe("no_match");
  });

  it("returns no_match cleanly against an empty queue", () => {
    const outcome = matchSmsToSession(baseParsed, []);

    expect(outcome.result).toBe("no_match");
    expect(outcome.candidates).toHaveLength(0);
  });
});
