import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface VerifiedFlashProps {
  customerName: string;
  amount: number;
  /** Distinguishes "the system caught this automatically" from a manual tap — see SPEC.md UX flow. */
  source: "manual" | "sms_auto" | "sms_picker";
  onDone: () => void;
}

const SOURCE_COPY: Record<VerifiedFlashProps["source"], string> = {
  manual: "Payment Confirmed",
  sms_auto: "Payment Confirmed Automatically",
  sms_picker: "Payment Confirmed",
};

/**
 * This is the app's one deliberate moment of visual boldness — see
 * theme/tokens.ts header comment and SPEC.md section 5 ("Core Premium
 * Moment"). Everywhere else in the app stays quiet; this is where trust
 * gets built. Fires identically for sms_auto and manual confirmations so
 * the barber gets the same reassurance regardless of which path resolved
 * the payment — automation should never feel like it's hiding what
 * happened.
 */
export default function VerifiedFlash({
  customerName,
  amount,
  source,
  onDone,
}: VerifiedFlashProps) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1100),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.headline}>{SOURCE_COPY[source]}</Text>
        <Text style={styles.amount}>KES {amount.toLocaleString()}</Text>
        <Text style={styles.subtext}>{customerName}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(26, 26, 26, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    minWidth: 260,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  checkMark: {
    color: colors.textOnDark,
    fontSize: 28,
    fontWeight: "700",
  },
  headline: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  amount: {
    ...typography.display,
    fontSize: 36,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  subtext: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
