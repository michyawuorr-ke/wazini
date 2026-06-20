import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { getServicePrices, getShop, manualCheckin } from "../lib/sessions";
import { getStoredShopId } from "../config/shopConfig";
import type { ServicePrice, Shop } from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * The direct answer to a real constraint: customers walking into a
 * barbershop frequently have no mobile data or WiFi at all, and there
 * is no web-technology workaround for a device with zero connectivity
 * trying to load a page for the first time. This screen lets the
 * barber record the visit directly — same session/customer model as
 * the web check-in, just a different entry point. See
 * docs/SPEC.md section 13 and migration 008_manual_checkin.sql.
 *
 * Also fully offline-aware itself: if the BARBER's own connection is
 * down at this exact moment, manualCheckin() queues the action rather
 * than blocking — see lib/sessions.ts.
 */
export default function ManualCheckinScreen({ navigation }: ScreenProps<"ManualCheckin">) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [services, setServices] = useState<ServicePrice[]>([]);
  const [selectedService, setSelectedService] = useState<ServicePrice | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getStoredShopId();
      if (!id) return;
      setShopId(id);
      const [shopData, serviceData] = await Promise.all([
        getShop(id),
        getServicePrices(id),
      ]);
      setShop(shopData);
      setServices(serviceData);
    })();
  }, []);

  const normalizePhone = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 10) return `+254${digits.slice(1)}`;
    if (digits.startsWith("7") && digits.length === 9) return `+254${digits}`;
    return null;
  };

  const handleSubmit = async () => {
    if (!shopId || !shop || !selectedService) {
      Alert.alert("Missing info", "Select a service before checking in this customer.");
      return;
    }

    const normalizedPhone = normalizePhone(customerPhone);
    if (!normalizedPhone) {
      Alert.alert(
        "Check the phone number",
        "Enter a valid Kenyan number, e.g. 0712345678 or 254712345678."
      );
      return;
    }

    if (!customerName.trim()) {
      Alert.alert("Missing name", "Enter the customer's name.");
      return;
    }

    setSubmitting(true);
    try {
      const { queued } = await manualCheckin({
        shopId,
        customerPhone: normalizedPhone,
        customerName: customerName.trim(),
        serviceName: selectedService.name,
        amountExpected: selectedService.price,
        paymentType: shop.payment_type,
        paymentNumber: shop.payment_number,
        paybillAccount: shop.paybill_account,
      });

      Alert.alert(
        queued ? "Checked in (offline)" : "Checked in",
        queued
          ? `${customerName.trim()} is in the queue. This will sync automatically once you're back online.`
          : `${customerName.trim()} is now in the Awaiting Payment queue.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert(
        "Couldn't check in this customer",
        "Something went wrong. Try again, or use the web check-in if available."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Service</Text>
      <View style={styles.serviceGrid}>
        {services.map((service) => {
          const isSelected = selectedService?.id === service.id;
          return (
            <Pressable
              key={service.id}
              style={[styles.serviceChip, isSelected && styles.serviceChipSelected]}
              onPress={() => setSelectedService(service)}
            >
              <Text
                style={[styles.serviceChipName, isSelected && styles.serviceChipNameSelected]}
              >
                {service.name}
              </Text>
              <Text
                style={[styles.serviceChipPrice, isSelected && styles.serviceChipNameSelected]}
              >
                KES {service.price.toLocaleString()}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {services.length === 0 && (
        <Text style={styles.emptyServicesNote}>
          No services set up yet. Add some under Settings → Services & Prices first.
        </Text>
      )}

      <Text style={styles.label}>Customer Name</Text>
      <TextInput
        style={styles.input}
        value={customerName}
        onChangeText={setCustomerName}
        placeholder="e.g. Evans Ndungu"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        style={styles.input}
        value={customerPhone}
        onChangeText={setCustomerPhone}
        placeholder="e.g. 0712345678"
        placeholderTextColor={colors.textSecondary}
        keyboardType="phone-pad"
      />

      <Pressable
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitLabel}>{submitting ? "Checking in…" : "Check In Customer"}</Text>
      </Pressable>

      <Text style={styles.note}>
        Use this when a customer has no data or WiFi to check in themselves. This works
        offline too — it'll sync automatically once you're back online.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  serviceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  serviceChip: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.paperMuted,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  serviceChipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  serviceChipName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  serviceChipPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  serviceChipNameSelected: {
    color: colors.textOnDark,
  },
  emptyServicesNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
