import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "../theme/tokens";
import { getMyShops } from "../lib/auth";
import { setStoredShopId } from "../config/shopConfig";
import type { MyShopMembership } from "../types/domain";

import CreateOrJoinShopScreen from "./CreateOrJoinShopScreen";

interface PostLoginRouterProps {
  onReady: () => void;
}

/**
 * Runs once, right after a successful login (or app launch, if already
 * logged in). Determines which of three real states the user is in:
 *
 *   1. Returning user with an existing shop membership → store that
 *      shop_id locally (same shopConfig.ts mechanism the rest of the
 *      app already reads from) and proceed straight to the Business tab.
 *   2. New user, no shop yet → show CreateOrJoinShopScreen, which lets
 *      them either set up a brand-new shop (becoming its owner) or
 *      enter an invite code from an existing shop's owner (becoming
 *      a barber there).
 *
 * NOTE on multi-shop: get_my_shops() can return more than one row if
 * a person belongs to multiple shops (the schema supports this, see
 * migration 012's comment). MVP takes the first one rather than
 * building a shop-switcher UI — a real gap if multi-shop membership
 * becomes common, flagged here rather than silently ignored.
 */
export default function PostLoginRouter({ onReady }: PostLoginRouterProps) {
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<MyShopMembership[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const shops = await getMyShops();
        setMemberships(shops);

        if (shops.length > 0) {
          await setStoredShopId(shops[0].shop_id);
          onReady();
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.warn("Failed to load shop memberships:", err);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  // No shop membership yet — first-time user, needs to create or join.
  return (
    <CreateOrJoinShopScreen
      onComplete={async (shopId: string) => {
        await setStoredShopId(shopId);
        onReady();
      }}
    />
  );
}
