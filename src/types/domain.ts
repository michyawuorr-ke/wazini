/**
 * Core domain types — mirror the Supabase schema 1:1.
 * See /docs/SPEC.md for the full system spec these types implement.
 */

export type PaymentType = "till" | "paybill";

export type SessionStatus =
  | "CREATED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "VERIFIED"
  | "VOIDED"
  | "ABANDONED";

export type PaymentMode = "mpesa" | "cash";

export type VerificationSource = "manual" | "sms_auto" | "sms_picker";

export type SmsMatchResult =
  | "auto_phone"
  | "auto_name"
  | "ambiguous"
  | "no_match";

/**
 * Financial/underwriting signal types — read from the views in
 * 007_financial_signal_views.sql. These are NOT stored facts; they are
 * computed on every read from daily_business_snapshot / revenue_entry /
 * customer. See docs/SPEC.md section 11 for why this layer exists.
 */
export interface DailyBusinessSnapshot {
  id: string;
  shop_id: string;
  snapshot_date: string; // date, e.g. "2026-06-19"
  revenue_total: number;
  revenue_mpesa: number;
  revenue_cash: number;
  transaction_count: number;
  unique_customers: number;
  new_customers: number;
  returning_customers: number;
  voided_count: number;
  abandoned_count: number;
  sms_auto_match_count: number;
  computed_at: string;
}

export interface RevenueVolatility {
  shop_id: string;
  days_observed: number;
  mean_daily_revenue: number | null;
  stddev_daily_revenue: number | null;
  /** Lower = more predictable. Null if fewer than 2 days observed. */
  coefficient_of_variation: number | null;
}

export interface GrowthTrajectory {
  shop_id: string;
  recent_14d_revenue: number | null;
  prior_14d_revenue: number | null;
  /** >1 growing, <1 shrinking, null if insufficient history. */
  growth_ratio: number | null;
}

export interface CustomerConcentration {
  shop_id: string;
  total_90d_revenue: number | null;
  top_5_customer_revenue: number | null;
  /** Higher = riskier (revenue concentrated in fewer customers). */
  top_5_concentration_ratio: number | null;
}

export interface RepeatCustomerRate {
  shop_id: string;
  total_customers: number;
  repeat_customers: number;
  repeat_rate: number | null;
}

export interface Shop {
  id: string;
  name: string;
  slug: string;
  payment_type: PaymentType;
  payment_number: string;
  paybill_account: string | null;
  payment_updated_at: string | null;
  created_at: string;
}

/**
 * The barber-defined price list customers pick from at check-in. NOT a
 * catalog/inventory system — name + price only, see migration
 * 004_service_prices.sql for the full rationale.
 */
export interface ServicePrice {
  id: string;
  shop_id: string;
  name: string;
  price: number; // KES
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  phone: string; // normalized E.164, e.g. +2547XXXXXXXX
  name: string;
  visit_count: number;
  lifetime_value: number; // KES
  first_seen_at: string;
  last_visit_at: string | null;
}

export interface Session {
  id: string;
  shop_id: string;
  customer_id: string;
  service_name: string; // snapshot, not FK
  amount_expected: number; // KES, locked at creation
  amount_paid: number | null; // filled at verification
  status: SessionStatus;
  payment_mode: PaymentMode | null;
  mpesa_code: string | null;
  session_code: string; // short human code shown to customer
  verification_source: VerificationSource | null;

  // Payment instruction snapshot — frozen at session creation so an
  // in-flight payment is never disrupted by a barber changing shop
  // settings mid-session. See SPEC.md section "Payment Display".
  payment_type: PaymentType;
  payment_number: string;
  paybill_account: string | null;

  created_at: string;
  verified_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface RevenueEntry {
  id: string;
  shop_id: string;
  session_id: string;
  customer_id: string;
  amount: number;
  payment_mode: PaymentMode;
  recorded_at: string;
  is_reversal: boolean;
}

export interface SmsEvent {
  id: string;
  shop_id: string;
  raw_text: string;
  parsed_code: string | null;
  parsed_amount: number | null;
  parsed_phone: string | null;
  parsed_name: string | null;
  match_result: SmsMatchResult;
  matched_session_id: string | null;
  received_at: string;
}

/** A session joined with its customer — the shape the Business tab queue actually renders. */
export interface SessionWithCustomer extends Session {
  customer: Pick<Customer, "id" | "name" | "phone">;
}
