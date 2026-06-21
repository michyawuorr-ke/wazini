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

  // "Custom" is a one-off, this-visit-only service name + price — per
  // real feedback from barbers: a customer occasionally wants something
  // not on the menu. This does NOT touch service_price (the shared,
  // owner-managed list) at all — it writes straight to
  // session.service_name / amount_expected as a plain snapshot, exactly
  // like a menu-selected service does. Picking "Custom" deselects any
  // menu service and vice versa — only one service source per check-in.
  const [isCustom, setIsCustom] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const id = await getStoredShopId();
        if (!id) return;
        setShopId(id);
        const [shopData, serviceData] = await Promise.all([
          getShop(id),
          getServicePrices(id),
        ]);
        setShop(shopData);
        setServices(serviceData);
      } catch (err) {
        console.warn("Failed to load shop/services for check-in:", err);
      }
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
    if (!shopId || !shop) return;

    let finalServiceName: string;
    let finalAmount: number;

    if (isCustom) {
      const trimmedName = customServiceName.trim();
      const parsedPrice = parseInt(customPrice, 10);
      if (!trimmedName || !parsedPrice || parsedPrice <= 0) {
        Alert.alert(
          "Missing custom service info",
          "Enter a name and a price greater than 0 for the custom service."
        );
        return;
      }
      finalServiceName = trimmedName;
      finalAmount = parsedPrice;
    } else {
      if (!selectedService) {
        Alert.alert("Missing info", "Select a service before checking in this customer.");
        return;
      }
      finalServiceName = selectedService.name;
      finalAmount = selectedService.price;
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
        serviceName: finalServiceName,
        amountExpected: finalAmount,
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
          const isSelected = !isCustom && selectedService?.id === service.id;
          return (
            <Pressable
              key={service.id}
              style={[styles.serviceChip, isSelected && styles.serviceChipSelected]}
              onPress={() => {
                setIsCustom(false);
                setSelectedService(service);
              }}
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
        <Pressable
          style={[styles.serviceChip, isCustom && styles.serviceChipSelected]}
          onPress={() => {
            setIsCustom(true);
            setSelectedService(null);
          }}
        >
          <Text style={[styles.serviceChipName, isCustom && styles.serviceChipNameSelected]}>
            Custom
          </Text>
          <Text style={[styles.serviceChipPrice, isCustom && styles.serviceChipNameSelected]}>
            One-off price
          </Text>
        </Pressable>
      </View>
      {services.length === 0 && !isCustom && (
        <Text style={styles.emptyServicesNote}>
          No services set up yet. Add some under Settings → Services & Prices, or use Custom
          for this visit.
        </Text>
      )}

      {isCustom && (
        <View style={styles.customServiceBlock}>
          <TextInput
            style={styles.input}
            value={customServiceName}
            onChangeText={setCustomServiceName}
            placeholder="What did they get? e.g. Custom fade + design"
            placeholderTextColor={colors.textSecondary}
          />
          <TextInput
            style={[styles.input, styles.customPriceInput]}
            value={customPrice}
            onChangeText={setCustomPrice}
            placeholder="Price (KES)"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
          <Text style={styles.customServiceNote}>
            This is just for this visit — it won't be added to your shop's price list.
          </Text>
        </View>
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
  customServiceBlock: {
    marginTop: spacing.md,
  },
  customPriceInput: {
    marginTop: spacing.sm,
  },
  customServiceNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
