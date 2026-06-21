import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "./src/navigation/RootNavigator";
import LoginScreen from "./src/screens/LoginScreen";
import PostLoginRouterScreen from "./src/screens/PostLoginRouterScreen";
import { supabase } from "./src/lib/supabase";
import { getStoredShopId } from "./src/config/shopConfig";
import { colors } from "./src/theme/tokens";

type AppState = "checking" | "needsLogin" | "needsShopRouting" | "ready";

/**
 * Real auth-gated entry point — replaces the old "type a shop UUID"
 * flow entirely (see git history for SetupScreen.tsx, kept in the repo
 * for reference but no longer used in this flow).
 *
 * Flow:
 *   1. checking — is there an active Supabase session right now?
 *   2. needsLogin — no session → LoginScreen (phone OTP)
 *   3. needsShopRouting — has a session, but we haven't yet resolved
 *      which shop they belong to (or confirmed they need to create/join
 *      one) → PostLoginRouterScreen
 *   4. ready — shop_id is resolved and stored locally → RootNavigator
 *
 * Also listens for auth state changes (e.g. sign-out from anywhere in
 * the app) so the UI reacts immediately rather than requiring a
 * restart.
 */
export default function App() {
  const [state, setState] = useState<AppState>("checking");

  useEffect(() => {
    checkInitialState();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState("needsLogin");
      } else if (event === "SIGNED_IN") {
        setState("needsShopRouting");
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const checkInitialState = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setState("needsLogin");
        return;
      }

      // Has a session — but do we already know which shop locally?
      // This avoids re-running the full getMyShops() round-trip on
      // every app launch when we already resolved it before.
      const storedShopId = await getStoredShopId();
      setState(storedShopId ? "ready" : "needsShopRouting");
    } catch (err) {
      console.warn("Failed to check auth state:", err);
      setState("needsLogin");
    }
  };

  if (state === "checking") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.paper,
        }}
      >
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {state === "needsLogin" && (
        <LoginScreen onLoggedIn={() => setState("needsShopRouting")} />
      )}
      {state === "needsShopRouting" && (
        <PostLoginRouterScreen onReady={() => setState("ready")} />
      )}
      {state === "ready" && <RootNavigator />}
    </SafeAreaProvider>
  );
}
