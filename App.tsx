import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";

import RootNavigator from "./src/navigation/RootNavigator";
import LoginScreen from "./src/screens/LoginScreen";
import PostLoginRouterScreen from "./src/screens/PostLoginRouterScreen";
import { supabase } from "./src/lib/supabase";
import { getStoredShopId } from "./src/config/shopConfig";
import { colors } from "./src/theme/tokens";

type AppState = "checking" | "needsLogin" | "needsShopRouting" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("checking");

  useEffect(() => {
    checkInitialState();

    const sub = Linking.addEventListener("url", ({ url }: { url: string }) => {
      if (url) handleDeepLink(url);
    });

    Linking.getInitialURL().then((url: string | null) => {
      if (url) handleDeepLink(url);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState("needsLogin");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        checkInitialState();
      }
    });

    return () => {
      sub.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    // Extract tokens from the URL fragment and set the session manually.
    // Supabase v2 embeds access_token and refresh_token in the URL hash
    // after a magic link click — we parse them out and set the session.
    try {
      const parsed = Linking.parse(url);
      const params = parsed.queryParams as Record<string, string> ?? {};
      const hashParams: Record<string, string> = {};

      // Magic link tokens arrive in the URL fragment (#) not query string
      // Parse them from the raw url directly
      const hash = url.split("#")[1];
      if (hash) {
        hash.split("&").forEach((part) => {
          const [key, val] = part.split("=");
          if (key && val) hashParams[key] = decodeURIComponent(val);
        });
      }

      const accessToken = hashParams["access_token"] ?? params["access_token"];
      const refreshToken = hashParams["refresh_token"] ?? params["refresh_token"];

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        checkInitialState();
      }
    } catch (err) {
      console.warn("Failed to handle deep link:", err);
    }
  };

  const checkInitialState = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setState("needsLogin");
        return;
      }
      const storedShopId = await getStoredShopId();
      setState(storedShopId ? "ready" : "needsShopRouting");
    } catch (err) {
      console.warn("Failed to check auth state:", err);
      setState("needsLogin");
    }
  };

  if (state === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
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
