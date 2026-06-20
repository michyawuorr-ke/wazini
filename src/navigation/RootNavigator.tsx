import { Pressable, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { colors, spacing } from "../theme/tokens";

import BusinessScreen from "../screens/BusinessScreen";
import CustomersScreen from "../screens/CustomersScreen";
import CustomerDetailScreen from "../screens/CustomerDetailScreen";
import PaymentSettingsScreen from "../screens/PaymentSettingsScreen";
import ServicesSettingsScreen from "../screens/ServicesSettingsScreen";
import SettingsMenuScreen from "../screens/SettingsMenuScreen";

/**
 * NOTE ON THE "2-TAB LAW": this app uses a single native-stack navigator
 * with a custom persistent switcher (see src/components/TabSwitcher.tsx)
 * rendered at the top of both BusinessScreen and CustomersScreen, rather
 * than React Navigation's separate bottom-tab-navigator package. That's
 * deliberate: it keeps the two tabs as the only persistent navigation
 * chrome while still allowing CustomerDetail and PaymentSettings to push
 * as full-screen stack screens (consistent with "one screen = one
 * action" — a detail view is not a third tab, it's a drill-down that
 * always has a clear way back via the native header).
 */

export type RootStackParamList = {
  Business: undefined;
  Customers: undefined;
  CustomerDetail: { customerId: string };
  SettingsMenu: undefined;
  PaymentSettings: undefined;
  ServicesSettings: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Business"
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.textPrimary, fontWeight: "600" },
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen
          name="Business"
          component={BusinessScreen}
          options={({ navigation }) => ({
            title: "Business",
            headerRight: () => (
              <SettingsGearButton onPress={() => navigation.navigate("SettingsMenu")} />
            ),
          })}
        />
        <Stack.Screen
          name="Customers"
          component={CustomersScreen}
          options={{ title: "Customers" }}
        />
        <Stack.Screen
          name="CustomerDetail"
          component={CustomerDetailScreen}
          options={{ title: "Customer" }}
        />
        <Stack.Screen
          name="SettingsMenu"
          component={SettingsMenuScreen}
          options={{ title: "Settings" }}
        />
        <Stack.Screen
          name="PaymentSettings"
          component={PaymentSettingsScreen}
          options={{ title: "Payment Settings" }}
        />
        <Stack.Screen
          name="ServicesSettings"
          component={ServicesSettingsScreen}
          options={{ title: "Services & Prices" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function SettingsGearButton({ onPress }: { onPress: () => void }) {
  // Plain text glyph rather than an icon library dependency — keeps this
  // small and avoids adding @expo/vector-icons just for one button.
  // "Payment settings" is config/setup, not a daily-use action, so it
  // belongs in the header, not competing with the 2-tab law.
  return (
    <Pressable onPress={onPress} hitSlop={spacing.sm} style={{ paddingHorizontal: spacing.xs }}>
      <Text style={{ fontSize: 20, color: colors.textSecondary }}>⚙</Text>
    </Pressable>
  );
}
