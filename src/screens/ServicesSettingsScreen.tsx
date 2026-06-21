import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import {
  createServicePrice,
  deactivateServicePrice,
  getServicePrices,
} from "../lib/sessions";
import { getStoredShopId } from "../config/shopConfig";
import type { ServicePrice } from "../types/domain";
import type { ScreenProps } from "../navigation/RootNavigator";

/**
 * Manages the price list customers pick from at check-in (the data gap
 * identified after initial build — see docs/SPEC.md section 7, the
 * service_price table). Same "tucked away in settings, not a third tab"
 * pattern as PaymentSettingsScreen — this is setup/config, not a
 * daily-use action.
 */
export default function ServicesSettingsScreen(_props: ScreenProps<"ServicesSettings">) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [services, setServices] = useState<ServicePrice[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const loadServices = useCallback(async (id: string) => {
    const data = await getServicePrices(id);
    setServices(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const id = await getStoredShopId();
          if (!id) return;
          setShopId(id);
          await loadServices(id);
        } catch (err) {
          console.warn("Failed to load services:", err);
        }
      })();
    }, [loadServices])
  );

  const handleAdd = async () => {
    const trimmedName = name.trim();
    const parsedPrice = parseInt(price, 10);

    if (!shopId || !trimmedName || !parsedPrice || parsedPrice <= 0) {
      Alert.alert("Check your entry", "Enter a service name and a price greater than 0.");
      return;
    }

    setSaving(true);
    try {
      await createServicePrice({
        shopId,
        name: trimmedName,
        price: parsedPrice,
        sortOrder: services.length,
      });
      setName("");
      setPrice("");
      await loadServices(shopId);
    } catch (err) {
      Alert.alert("Couldn't add service", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (service: ServicePrice) => {
    Alert.alert(
      "Remove service?",
      `"${service.name}" will no longer appear for customers checking in. Past visit history is unaffected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deactivateServicePrice(service.id);
            if (shopId) loadServices(shopId);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.addForm}>
            <Text style={styles.label}>Add a service</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Haircut"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="Price (KES)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
            />
            <Pressable
              style={[styles.addButton, saving && styles.addButtonDisabled]}
              onPress={handleAdd}
              disabled={saving}
            >
              <Text style={styles.addButtonLabel}>{saving ? "Adding…" : "Add Service"}</Text>
            </Pressable>

            <Text style={styles.listLabel}>Current services</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.serviceRow}>
            <View>
              <Text style={styles.serviceName}>{item.name}</Text>
              <Text style={styles.servicePrice}>KES {item.price.toLocaleString()}</Text>
            </View>
            <Pressable onPress={() => handleRemove(item)} hitSlop={spacing.sm}>
              <Text style={styles.removeLabel}>Remove</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No services added yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  listContent: {
    padding: spacing.lg,
  },
  addForm: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
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
  addButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
  listLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.sm,
  },
  serviceName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  servicePrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeLabel: {
    ...typography.caption,
    color: colors.danger,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
