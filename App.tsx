import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "./src/navigation/RootNavigator";
import SetupScreen from "./src/screens/SetupScreen";
import { getStoredShopId } from "./src/config/shopConfig";
import { colors } from "./src/theme/tokens";

export default function App() {
  const [checking, setChecking] = useState(true);
  const [isSetUp, setIsSetUp] = useState(false);

  useEffect(() => {
    (async () => {
      const shopId = await getStoredShopId();
      setIsSetUp(!!shopId);
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isSetUp ? (
        <RootNavigator />
      ) : (
        <SetupScreen onComplete={() => setIsSetUp(true)} />
      )}
    </SafeAreaProvider>
  );
}
