import { supabase } from "./supabase";
import type { SessionWithCustomer, Customer, Shop, ServicePrice } from "../types/domain";

/**
 * Fetches all sessions currently awaiting payment for a shop — this is
 * the exact dataset the Business tab queue renders, and the same dataset
 * the matching engine searches against when a new SMS arrives.
 */
export async function getAwaitingSessions(
  shopId: string
): Promise<SessionWithCustomer[]> {
  const { data, error } = await supabase
    .from("session")
    .select(
      `
      *,
      customer:customer_id ( id, name, phone )
    `
    )
    .eq("shop_id", shopId)
    .eq("status", "AWAITING_PAYMENT")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as SessionWithCustomer[];
}

/**
 * Verifies a session — the single state transition that powers both the
 * manual "M-Pesa / Cash, Confirm" flow and the SMS auto-match flow.
 *
 * This intentionally does NOT touch revenue_entry or customer directly —
 * those are derived. In production this should be a single Postgres
 * function/RPC (`verify_session`) so the session update, revenue_entry
 * insert, and customer denormalized-field update happen atomically. The
 * client-side version below is the MVP placeholder; see SPEC.md "Source
 * of truth rules" for why this matters — multi-step client writes risk
 * partial failure (session marked VERIFIED but revenue_entry never
 * created), which a single DB function eliminates.
 */
export async function verifySession(params: {
  sessionId: string;
  paymentMode: "mpesa" | "cash";
  amountPaid: number;
  mpesaCode?: string | null;
  verificationSource: "manual" | "sms_auto" | "sms_picker";
}): Promise<void> {
  const { error } = await supabase.rpc("verify_session", {
    p_session_id: params.sessionId,
    p_payment_mode: params.paymentMode,
    p_amount_paid: params.amountPaid,
    p_mpesa_code: params.mpesaCode ?? null,
    p_verification_source: params.verificationSource,
  });

  if (error) throw error;
}

export async function voidSession(
  sessionId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc("void_session", {
    p_session_id: sessionId,
    p_reason: reason,
  });

  if (error) throw error;
}

export async function getCustomers(shopId: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customer")
    .select("*")
    .eq("shop_id", shopId)
    .order("last_visit_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCustomerSessionHistory(
  customerId: string
): Promise<SessionWithCustomer[]> {
  const { data, error } = await supabase
    .from("session")
    .select(
      `
      *,
      customer:customer_id ( id, name, phone )
    `
    )
    .eq("customer_id", customerId)
    .eq("status", "VERIFIED")
    .order("verified_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as SessionWithCustomer[];
}

export async function getShop(shopId: string): Promise<Shop> {
  const { data, error } = await supabase
    .from("shop")
    .select("*")
    .eq("id", shopId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateShopPaymentSettings(params: {
  shopId: string;
  paymentType: "till" | "paybill";
  paymentNumber: string;
  paybillAccount?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("shop")
    .update({
      payment_type: params.paymentType,
      payment_number: params.paymentNumber,
      paybill_account: params.paybillAccount ?? null,
      payment_updated_at: new Date().toISOString(),
    })
    .eq("id", params.shopId);

  if (error) throw error;
}

/**
 * The price list the customer web app's check-in screen renders as
 * tappable service buttons. See migration 004_service_prices.sql for
 * why this exists and why it's deliberately minimal (not a catalog).
 */
export async function getServicePrices(shopId: string): Promise<ServicePrice[]> {
  const { data, error } = await supabase
    .from("service_price")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createServicePrice(params: {
  shopId: string;
  name: string;
  price: number;
  sortOrder?: number;
}): Promise<ServicePrice> {
  const { data, error } = await supabase
    .from("service_price")
    .insert({
      shop_id: params.shopId,
      name: params.name,
      price: params.price,
      sort_order: params.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateServicePrice(params: {
  id: string;
  name?: string;
  price?: number;
  sortOrder?: number;
}): Promise<void> {
  const { error } = await supabase
    .from("service_price")
    .update({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.price !== undefined ? { price: params.price } : {}),
      ...(params.sortOrder !== undefined ? { sort_order: params.sortOrder } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) throw error;
}

/** Soft-delete — keeps history coherent for any past session that referenced this service_name as a snapshot. */
export async function deactivateServicePrice(id: string): Promise<void> {
  const { error } = await supabase
    .from("service_price")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
export async function logSmsEvent(params: {
  shopId: string;
  rawText: string;
  parsedCode: string | null;
  parsedAmount: number | null;
  parsedPhone: string | null;
  parsedName: string | null;
  matchResult: "auto_phone" | "auto_name" | "ambiguous" | "no_match";
  matchedSessionId: string | null;
}): Promise<void> {
  const { error } = await supabase.from("sms_event").insert({
    shop_id: params.shopId,
    raw_text: params.rawText,
    parsed_code: params.parsedCode,
    parsed_amount: params.parsedAmount,
    parsed_phone: params.parsedPhone,
    parsed_name: params.parsedName,
    match_result: params.matchResult,
    matched_session_id: params.matchedSessionId,
  });

  // Deliberately non-throwing: a failed audit-log write should never
  // block the actual payment verification from completing. Log and move on.
  if (error) {
    console.warn("Failed to log sms_event (non-fatal):", error.message);
  }
}
