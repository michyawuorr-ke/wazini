import type { ExpoConfig } from "expo/config";

/**
 * Wazini — merchant-side native app (barbershops first, expanding to
 * other micro-businesses). The barber/salon-facing counterpart to the
 * customer-facing web app (kinyozios, the barber-first product brand).
 *
 * This config is intentionally code (not static JSON) so we can read
 * environment variables at build time (Supabase URL/key) without ever
 * committing real credentials to this public repo. See .env.example.
 */
const config: ExpoConfig = {
  name: "Wazini",
  slug: "wazini",
  scheme: "wazini",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",

  ios: {
    bundleIdentifier: "com.michyawuorrke.wazini",
    supportsTablet: false,
  },

  android: {
    package: "com.michyawuorrke.wazini",
    adaptiveIcon: {
      backgroundColor: "#1A1A1A",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
    // Permissions required for SMS-based payment matching.
    // RECEIVE_SMS / READ_SMS are sensitive permissions — Play Console will
    // require the "Permissions Declaration Form" + demo video before this
    // app can be submitted publicly. For sideload/dev-client testing this
    // restriction does not apply; see README.
    permissions: [
      "android.permission.RECEIVE_SMS",
      "android.permission.READ_SMS",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.FOREGROUND_SERVICE",
    ],
  },

  plugins: [
    "expo-dev-client",
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#1A1A1A",
      },
    ],
  ],

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: {
      // Filled in automatically the first time you run `eas build`
      // (or `eas init`) from Termux — do not hand-edit.
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
