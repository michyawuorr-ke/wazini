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
import { sendOtp, verifyOtp } from "../lib/auth";

interface LoginScreenProps {
  onLoggedIn: () => void;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `+254${digits}`;
  return null;
}

/**
 * Real authentication entry point — phone number + OTP, replacing the
 * old "paste in a shop UUID" Setup screen entirely. Matches the exact
 * login pattern Kenyan users already trust from M-Pesa itself: no
 * email, no password, no account-creation friction beyond a phone
 * number they already know by heart.
 *
 * Works identically whether this is someone's first time (new owner)
 * or returning — Supabase phone-OTP auth treats both the same; the
 * distinction between "set up a new shop" and "join via invite code"
 * happens AFTER login, in PostLoginRouterScreen, based on whether
 * get_my_shops() returns anything for this user yet.
 */
export default function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSendOtp = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      Alert.alert(
        "Check the phone number",
        "Enter a valid Kenyan number, e.g. 0712345678 or 254712345678."
      );
      return;
    }

    setSubmitting(true);
    try {
      await sendOtp(normalized);
      setNormalizedPhone(normalized);
      setStage("otp");
    } catch (err) {
      Alert.alert("Couldn't send code", "Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) return;
    setSubmitting(true);
    try {
      await verifyOtp(normalizedPhone, otp.trim());
      onLoggedIn();
    } catch (err) {
      Alert.alert("That code didn't work", "Check the code and try again, or request a new one.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Wazini</Text>

        {stage === "phone" ? (
          <>
            <Text style={styles.subtitle}>
              Enter your phone number to sign in or set up your shop.
            </Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 0712345678"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              autoFocus
            />
            <Pressable
              style={[styles.button, (!phone.trim() || submitting) && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={!phone.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnDark} />
              ) : (
                <Text style={styles.buttonLabel}>Send Code</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter the code sent to {normalizedPhone}.
            </Text>
            <TextInput
              style={styles.input}
              value={otp}
              onChangeText={setOtp}
              placeholder="6-digit code"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              autoFocus
            />
            <Pressable
              style={[styles.button, (!otp.trim() || submitting) && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={!otp.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnDark} />
              ) : (
                <Text style={styles.buttonLabel}>Verify & Continue</Text>
              )}
            </Pressable>
            <Pressable style={styles.linkButton} onPress={() => setStage("phone")}>
              <Text style={styles.linkLabel}>Use a different number</Text>
            </Pressable>
          </>
        )}
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
    ...typography.display,
    fontSize: 40,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 17,
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
  linkButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  linkLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
