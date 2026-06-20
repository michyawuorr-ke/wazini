import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * This app is single-shop-per-install in MVP — matches the "one QR per
 * shop" decision (no per-barber/chair QR), so there is exactly one
 * shop_id this installed app cares about. It's set once during a
 * first-run setup screen and persisted locally; this is NOT the same
 * as multi-tenant shop-switching, which is out of scope for MVP.
 */
const SHOP_ID_KEY = "wazini:shop_id";

export async function getStoredShopId(): Promise<string | null> {
  return AsyncStorage.getItem(SHOP_ID_KEY);
}

export async function setStoredShopId(shopId: string): Promise<void> {
  await AsyncStorage.setItem(SHOP_ID_KEY, shopId);
}

export async function clearStoredShopId(): Promise<void> {
  await AsyncStorage.removeItem(SHOP_ID_KEY);
}
