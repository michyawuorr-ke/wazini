import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { setStoredShopId } from "../config/shopConfig";
import { getShop } from "../lib/sessions";

interface SetupScreenProps {
  onComplete: () => void;
}

// Loose UUID v4 shape check — not strict RFC validation, just enough to
// catch "pasted the wrong thing entirely" before hitting the network.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * First-run only. Confirms the "one QR per shop" / single-shop-per-install
 * decision needs a manual shop_id entry — there's no auto-discovery
 * mechanism in MVP. The barber gets this UUID from you (the developer)
 * during onboarding, e.g. copied from the Supabase table editor after
 * you insert their shop row.
 */
export default function SetupScreen({ onComplete }: SetupScreenProps) {
  const [shopId, setShopId] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleContinue = async () => {
    const trimmed = shopId.trim();
    if (!UUID_RE.test(trimmed)) {
      Alert.alert(
        "That doesn't look right",
        "Shop ID should look like 8a1b2c3d-1234-5678-9abc-def012345678. Double-check and try again."
      );
      return;
    }

    setVerifying(true);
    try {
      // Verify the shop actually exists before locking this device to
      // it — fail loudly here rather than silently storing a bad ID
      // that only surfaces as an empty queue later with no explanation.
      await getShop(trimmed);
      await setStoredShopId(trimmed);
      onComplete();
    } catch (err) {
      Alert.alert(
        "Shop not found",
        "Couldn't find a shop with that ID. Check the ID and your internet connection."
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Set up this device</Text>
        <Text style={styles.subtitle}>
          Enter your shop ID to link this device to your shop. You only need to do this once.
        </Text>

        <TextInput
          style={styles.input}
          value={shopId}
          onChangeText={setShopId}
          placeholder="Shop ID"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={[styles.button, (!shopId.trim() || verifying) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!shopId.trim() || verifying}
        >
          {verifying ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={styles.buttonLabel}>Continue</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.h1,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
});
