import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { createShopWithOwner, redeemInviteCode } from "../lib/auth";
import type { PaymentType } from "../types/domain";

interface CreateOrJoinShopScreenProps {
  onComplete: (shopId: string) => void;
}

type Mode = "choose" | "create" | "join";

/**
 * The owner-vs-barber branch point. Per the design decision: role is
 * determined by HOW someone joins, never by a self-selected choice —
 * "Set up a new shop" makes you that shop's owner (via
 * create_shop_with_owner), "Join with a code" makes you a barber at
 * whatever shop the code belongs to (via redeem_invite_code). Nobody
 * picks "I am the owner" as a checkbox; the action itself determines it.
 */
export default function CreateOrJoinShopScreen({ onComplete }: CreateOrJoinShopScreenProps) {
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "choose") {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Get started</Text>
          <Text style={styles.subtitle}>
            Are you setting up your shop for the first time, or joining one that already
            exists?
          </Text>

          <Pressable style={styles.choiceButton} onPress={() => setMode("create")}>
            <Text style={styles.choiceTitle}>Set up my shop</Text>
            <Text style={styles.choiceDesc}>I'm the owner, setting this up for the first time.</Text>
          </Pressable>

          <Pressable style={styles.choiceButton} onPress={() => setMode("join")}>
            <Text style={styles.choiceTitle}>Join with a code</Text>
            <Text style={styles.choiceDesc}>
              My shop owner gave me a code to join their shop.
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode === "join") {
    return <JoinShopForm onBack={() => setMode("choose")} onComplete={onComplete} />;
  }

  return <CreateShopForm onBack={() => setMode("choose")} onComplete={onComplete} />;
}

function JoinShopForm({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (shopId: string) => void;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const shopId = await redeemInviteCode(code.trim());
      onComplete(shopId);
    } catch (err: any) {
      Alert.alert(
        "Couldn't join",
        err?.message?.includes("expired")
          ? "This code has expired. Ask your shop owner for a new one."
          : err?.message?.includes("already been used")
          ? "This code has already been used. Ask your shop owner for a new one."
          : "Check the code and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Join your shop</Text>
        <Text style={styles.subtitle}>Enter the code your shop owner gave you.</Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="e.g. A1B2C3"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoFocus
        />

        <Pressable
          style={[styles.button, (!code.trim() || submitting) && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={!code.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={styles.buttonLabel}>Join Shop</Text>
          )}
        </Pressable>

        <Pressable style={styles.linkButton} onPress={onBack}>
          <Text style={styles.linkLabel}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CreateShopForm({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (shopId: string) => void;
}) {
  const [shopName, setShopName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("till");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paybillAccount, setPaybillAccount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!shopName.trim() || !paymentNumber.trim()) {
      Alert.alert("Missing info", "Enter your shop name and payment number.");
      return;
    }

    setSubmitting(true);
    try {
      const slug = shopName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const shopId = await createShopWithOwner({
        shopName: shopName.trim(),
        shopSlug: `${slug}-${Date.now().toString(36)}`, // suffix avoids slug collisions across shops with similar names
        paymentType,
        paymentNumber: paymentNumber.trim(),
        paybillAccount: paymentType === "paybill" ? paybillAccount.trim() : null,
      });
      onComplete(shopId);
    } catch (err) {
      Alert.alert("Couldn't set up your shop", "Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Set up your shop</Text>
      <Text style={styles.subtitle}>You'll be able to invite your barbers after this.</Text>

      <Text style={styles.label}>Shop Name</Text>
      <TextInput
        style={styles.input}
        value={shopName}
        onChangeText={setShopName}
        placeholder="e.g. Evans Barbershop"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={styles.label}>Payment Method</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, paymentType === "till" && styles.toggleActive]}
          onPress={() => setPaymentType("till")}
        >
          <Text style={[styles.toggleLabel, paymentType === "till" && styles.toggleLabelActive]}>
            Till Number
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, paymentType === "paybill" && styles.toggleActive]}
          onPress={() => setPaymentType("paybill")}
        >
          <Text
            style={[styles.toggleLabel, paymentType === "paybill" && styles.toggleLabelActive]}
          >
            Paybill
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>{paymentType === "till" ? "Till Number" : "Paybill Number"}</Text>
      <TextInput
        style={styles.input}
        value={paymentNumber}
        onChangeText={setPaymentNumber}
        keyboardType="number-pad"
        placeholder={paymentType === "till" ? "e.g. 174379" : "e.g. 522533"}
        placeholderTextColor={colors.textSecondary}
      />

      {paymentType === "paybill" && (
        <>
          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            value={paybillAccount}
            onChangeText={setPaybillAccount}
            placeholder="e.g. WAZINI01"
            placeholderTextColor={colors.textSecondary}
          />
        </>
      )}

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <Text style={styles.buttonLabel}>Create Shop</Text>
        )}
      </Pressable>

      <Pressable style={styles.linkButton} onPress={onBack}>
        <Text style={styles.linkLabel}>Back</Text>
      </Pressable>
    </ScrollView>
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
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
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
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.paperMuted,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  toggleActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  toggleLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  toggleLabelActive: {
    color: colors.textOnDark,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.5,
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
  choiceButton: {
    backgroundColor: colors.paperMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  choiceTitle: {
    ...typography.h1,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  choiceDesc: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
