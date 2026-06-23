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
import { sendOtp } from "../lib/auth";

interface LoginScreenProps {
  onLoggedIn: () => void;
}

export default function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!valid) {
      Alert.alert("Check your email", "Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await sendOtp(trimmed);
      setSent(true);
    } catch (err) {
      Alert.alert("Couldn't send link", "Check your connection and try again.");
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

        {!sent ? (
          <>
            <Text style={styles.subtitle}>
              Enter your email address to sign in or set up your shop.
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. you@gmail.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />
            <Pressable
              style={[styles.button, (!email.trim() || submitting) && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={!email.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnDark} />
              ) : (
                <Text style={styles.buttonLabel}>Send Sign-in Link</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Check your email — we sent a sign-in link to {email.trim()}.
            </Text>
            <Text style={styles.hint}>
              Tap the link in the email to open Wazini and sign in. If you don't see it,
              check your spam folder.
            </Text>
            <Pressable style={styles.linkButton} onPress={() => setSent(false)}>
              <Text style={styles.linkLabel}>Use a different email</Text>
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
    fontSize: 40,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  hint: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
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
    fontSize: 16,
    fontWeight: "600",
    color: colors.textOnDark,
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  linkLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
