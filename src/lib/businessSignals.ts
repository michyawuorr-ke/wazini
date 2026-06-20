import { supabase } from "./supabase";
import type {
  RevenueVolatility,
  GrowthTrajectory,
  CustomerConcentration,
  RepeatCustomerRate,
  DailyBusinessSnapshot,
} from "../types/domain";

/**
 * Reads from the financial signal views (007_financial_signal_views.sql).
 * Not currently surfaced in any screen — this is the data layer for a
 * future "Business Health" view, and more importantly, the shape any
 * future underwriting partner integration would read from. Building this
 * access layer now (even before a UI consumes it) keeps the signal layer
 * a first-class, intentional part of the system rather than something
 * bolted on later — see docs/SPEC.md section 11.
 */

export async function getRevenueVolatility(
  shopId: string
): Promise<RevenueVolatility | null> {
  const { data, error } = await supabase
    .from("shop_revenue_volatility")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getGrowthTrajectory(
  shopId: string
): Promise<GrowthTrajectory | null> {
  const { data, error } = await supabase
    .from("shop_growth_trajectory")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCustomerConcentration(
  shopId: string
): Promise<CustomerConcentration | null> {
  const { data, error } = await supabase
    .from("shop_customer_concentration")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRepeatCustomerRate(
  shopId: string
): Promise<RepeatCustomerRate | null> {
  const { data, error } = await supabase
    .from("shop_repeat_customer_rate")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getDailySnapshots(
  shopId: string,
  days: number = 30
): Promise<DailyBusinessSnapshot[]> {
  const { data, error } = await supabase
    .from("daily_business_snapshot")
    .select("*")
    .eq("shop_id", shopId)
    .order("snapshot_date", { ascending: false })
    .limit(days);

  if (error) throw error;
  return data ?? [];
}

/**
 * Triggers a snapshot recompute for "today" — call this after any
 * verification, or on a timer, so the Business Health signals stay
 * current intra-day rather than only updating once a scheduled cron
 * job runs. Safe to call repeatedly (idempotent, see migration 006).
 */
export async function recomputeTodaySnapshot(shopId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { error } = await supabase.rpc("recompute_daily_snapshot", {
    p_shop_id: shopId,
    p_date: today,
  });

  // Non-fatal: a failed snapshot recompute should never block the
  // actual payment flow. The next scheduled cron run will catch it.
  if (error) {
    console.warn("Failed to recompute daily snapshot (non-fatal):", error.message);
  }
}
