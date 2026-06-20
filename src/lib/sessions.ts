import { supabase } from "./supabase";
import type { SessionWithCustomer, Customer, Shop, ServicePrice } from "../types/domain";
import { enqueueAction } from "../offline/queue";
import NetInfo from "@react-native-community/netinfo";

async function isCurrentlyOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected && state.isInternetReachable !== false;
}

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
 * OFFLINE-AWARE: if the device has no connectivity right now, this
 * queues the verification instead of failing outright — see
 * docs/SPEC.md section 13 ("Offline-First Design"). The barber's
 * confirmation UX (the VerifiedFlash moment) still fires immediately
 * either way; the difference is invisible to the barber except for a
 * sync-status indicator, by design — payment confirmation can't feel
 * like it failed just because the network is down at that instant.
 *
 * Returns { queued: true } when the action was queued rather than
 * written immediately, so calling code can adjust copy if needed
 * (e.g. "Confirmed — will sync when online" vs "Confirmed").
 */
export async function verifySession(params: {
  sessionId: string;
  paymentMode: "mpesa" | "cash";
  amountPaid: number;
  mpesaCode?: string | null;
  verificationSource: "manual" | "sms_auto" | "sms_picker";
}): Promise<{ queued: boolean }> {
  const online = await isCurrentlyOnline();

  if (!online) {
    await enqueueAction("verify_session", {
      sessionId: params.sessionId,
      paymentMode: params.paymentMode,
      amountPaid: params.amountPaid,
      mpesaCode: params.mpesaCode ?? null,
      verificationSource: params.verificationSource,
    });
    return { queued: true };
  }

  const { error } = await supabase.rpc("verify_session", {
    p_session_id: params.sessionId,
    p_payment_mode: params.paymentMode,
    p_amount_paid: params.amountPaid,
    p_mpesa_code: params.mpesaCode ?? null,
    p_verification_source: params.verificationSource,
  });

  if (error) {
    // The write was attempted but failed for a reason OTHER than being
    // offline (e.g. a genuine network blip mid-request) — fall back to
    // queueing rather than surfacing a hard error to the barber. This
    // is deliberately generous: a failed write and "no connectivity"
    // can look identical from the client's perspective in practice.
    await enqueueAction("verify_session", {
      sessionId: params.sessionId,
      paymentMode: params.paymentMode,
      amountPaid: params.amountPaid,
      mpesaCode: params.mpesaCode ?? null,
      verificationSource: params.verificationSource,
    });
    return { queued: true };
  }

  return { queued: false };
}

export async function voidSession(
  sessionId: string,
  reason: string
): Promise<{ queued: boolean }> {
  const online = await isCurrentlyOnline();

  if (!online) {
    await enqueueAction("void_session", { sessionId, reason });
    return { queued: true };
  }

  const { error } = await supabase.rpc("void_session", {
    p_session_id: sessionId,
    p_reason: reason,
  });

  if (error) {
    await enqueueAction("void_session", { sessionId, reason });
    return { queued: true };
  }

  return { queued: false };
}

/**
 * Creates a session directly from the barber's app, bypassing the
 * customer web check-in entirely. Exists specifically for customers
 * with no data/WiFi at all — see migration 008_manual_checkin.sql and
 * docs/SPEC.md section 13 for the full rationale.
 *
 * Also offline-aware: if the barber's OWN connection is down at the
 * moment of check-in, this queues the action rather than blocking the
 * walk-in customer from being recorded at all.
 */
export async function manualCheckin(params: {
  shopId: string;
  customerPhone: string;
  customerName: string;
  serviceName: string;
  amountExpected: number;
  paymentType: "till" | "paybill";
  paymentNumber: string;
  paybillAccount?: string | null;
}): Promise<{ queued: boolean; sessionId: string | null }> {
  // Session code generation happens client-side here (rather than
  // server-side as with the web check-in flow) specifically so it
  // works identically whether online or queued offline — a queued
  // action can't wait for a server round-trip to learn its own code.
  const sessionCode = Math.floor(1000 + Math.random() * 9000).toString();

  const online = await isCurrentlyOnline();
  const payload = {
    shopId: params.shopId,
    customerPhone: params.customerPhone,
    customerName: params.customerName,
    serviceName: params.serviceName,
    amountExpected: params.amountExpected,
    paymentType: params.paymentType,
    paymentNumber: params.paymentNumber,
    paybillAccount: params.paybillAccount ?? null,
    sessionCode,
  };

  if (!online) {
    await enqueueAction("manual_checkin", payload);
    return { queued: true, sessionId: null };
  }

  const { data, error } = await supabase.rpc("manual_checkin", {
    p_shop_id: payload.shopId,
    p_customer_phone: payload.customerPhone,
    p_customer_name: payload.customerName,
    p_service_name: payload.serviceName,
    p_amount_expected: payload.amountExpected,
    p_payment_type: payload.paymentType,
    p_payment_number: payload.paymentNumber,
    p_paybill_account: payload.paybillAccount,
    p_session_code: payload.sessionCode,
  });

  if (error) {
    await enqueueAction("manual_checkin", payload);
    return { queued: true, sessionId: null };
  }

  return { queued: false, sessionId: data as string };
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
/** Logs every intercepted SMS for audit/dispute-resolution — see SPEC.md sms_event rationale. */
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
