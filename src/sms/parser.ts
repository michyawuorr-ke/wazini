/**
 * Parses raw M-Pesa confirmation SMS text into structured fields.
 *
 * IMPORTANT (see SPEC.md "Risks specific to this architecture"):
 * Safaricom's SMS format is not contractually guaranteed to stay constant.
 * This parser is intentionally defensive — every field is optional except
 * `rawText`. A failed/partial parse should never throw; it should return
 * whatever was extractable so the caller can log it to sms_event and fall
 * back to the manual confirm flow.
 *
 * Known real-world formats this is calibrated against (Buy Goods / Till):
 *   "TGR47B3X91 Confirmed. You have received Ksh500.00 from EVANS NDUNGU
 *    254712345678 on 19/6/26 at 2:14 PM. New M-PESA balance is Ksh12,450.00."
 *
 * Paybill confirmations differ slightly in wording but share the same
 * core tokens (code, amount, sender), which is what we anchor on.
 */

export interface ParsedMpesaSms {
  rawText: string;
  mpesaCode: string | null;
  amount: number | null;
  senderName: string | null;
  senderPhone: string | null; // E.164-normalized if found
  isLikelyMpesa: boolean;
}

// M-Pesa confirmation codes are alphanumeric, typically 10 chars,
// always at the very start of the SMS, always uppercase+digits.
const MPESA_CODE_RE = /^([A-Z0-9]{8,12})\s+Confirmed/i;

// Amount: "Ksh500.00" / "Ksh1,234.50" / "KES 500" — Safaricom varies casing
// and comma-grouping, so the regex tolerates both.
const AMOUNT_RE = /(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)/i;

// "received Ksh500.00 from EVANS NDUNGU 254712345678 on ..."
// Captures the free-text name and an optional trailing phone number.
// Stops at " on " (date marker) or end of string, whichever first.
const SENDER_RE =
  /from\s+([A-Z][A-Z\s]+?)(?:\s+(2547\d{8}|07\d{8}))?\s+on\s/i;

// Loose fallback if the date marker ("on") isn't present in some variant.
const SENDER_RE_FALLBACK = /from\s+([A-Z][A-Z\s]{2,40})/i;

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10)
    return `+254${digits.slice(1)}`;
  return null;
}

export function parseMpesaSms(rawText: string): ParsedMpesaSms {
  const text = rawText.trim();

  const codeMatch = text.match(MPESA_CODE_RE);
  const mpesaCode = codeMatch ? codeMatch[1].toUpperCase() : null;

  const amountMatch = text.match(AMOUNT_RE);
  const amount = amountMatch
    ? Math.round(parseFloat(amountMatch[1].replace(/,/g, "")))
    : null;

  const senderMatch = text.match(SENDER_RE) ?? text.match(SENDER_RE_FALLBACK);
  const senderName = senderMatch ? senderMatch[1].trim() : null;
  const senderPhone = senderMatch ? normalizePhone(senderMatch[2]) : null;

  // "Likely M-Pesa" gate: require at minimum a code AND an amount.
  // A name-only or phone-only partial match is too weak to act on —
  // this SMS might not even be from M-Pesa at all (e.g. a bank alert,
  // a delivery notification). Better to log as no_match than guess.
  const isLikelyMpesa = Boolean(mpesaCode && amount !== null);

  return { rawText: text, mpesaCode, amount, senderName, senderPhone, isLikelyMpesa };
}
