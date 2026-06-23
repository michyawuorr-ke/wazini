import { supabase } from "./supabase";
import type { MyShopMembership, ShopRole, PaymentType } from "../types/domain";

/**
 * Real multi-user authentication — phone number + OTP, matching the UX
 * pattern Kenyan users already trust from M-Pesa itself. Replaces the
 * old "type in a shop UUID" Setup screen entirely; identity now
 * determines shop access (see migration 011-013), not a manually
 * entered ID.
 */

export async function sendOtp(email: string): Promise<void> {
  // Supabase expects E.164 format — caller is responsible for
  // normalizing (see normalizePhone in ManualCheckinScreen for the
  // same pattern already used elsewhere in this codebase).
  const { error } = await supabase.auth.signInWithOtp({ email: email });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email,
    token,
    type: "email",
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Returns every shop the current authenticated user belongs to, with
 * their role in each. In MVP a person almost always belongs to exactly
 * one shop, but the data model (and this function) doesn't assume
 * that — see get_my_shops() in migration 012, intentionally built to
 * support someone belonging to multiple shops later without a schema
 * change.
 */
export async function getMyShops(): Promise<MyShopMembership[]> {
  const { data, error } = await supabase.rpc("get_my_shops");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    shop_id: row.shop_id,
    shop_name: row.shop_name,
    role: row.role as ShopRole,
  }));
}

export async function createShopWithOwner(params: {
  shopName: string;
  shopSlug: string;
  paymentType: PaymentType;
  paymentNumber: string;
  paybillAccount?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_shop_with_owner", {
    p_shop_name: params.shopName,
    p_shop_slug: params.shopSlug,
    p_payment_type: params.paymentType,
    p_payment_number: params.paymentNumber,
    p_paybill_account: params.paybillAccount ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Owner-only — enforced by RLS on shop_invite_code, this is just the client call. */
export async function generateInviteCode(shopId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_invite_code", {
    p_shop_id: shopId,
  });
  if (error) throw error;
  return data as string;
}

export async function redeemInviteCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_invite_code", {
    p_code: code,
  });
  if (error) throw error;
  return data as string; // the shop_id the user just joined
}

/** Owner-only — lists everyone in the shop, for the "Manage Barbers" screen. */
export async function getShopMembers(shopId: string) {
  const { data, error } = await supabase
    .from("shop_member")
    .select("id, user_id, role, joined_at")
    .eq("shop_id", shopId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Owner-only — enforced by RLS delete policy (cannot remove an owner via this path). */
export async function removeShopMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("shop_member").delete().eq("id", memberId);
  if (error) throw error;
}
