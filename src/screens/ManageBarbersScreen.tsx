import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { generateInviteCode, getShopMembers, removeShopMember } from "../lib/auth";
import { getStoredShopId } from "../config/shopConfig";
import type { ScreenProps } from "../navigation/RootNavigator";

interface MemberRow {
  id: string;
  user_id: string;
  role: "owner" | "barber";
  joined_at: string;
}

/**
 * Owner-only screen (enforced by RLS — a barber who somehow navigates
 * here would simply see an empty list and a failed invite-generation
 * attempt, not a security hole, since the database itself rejects
 * non-owner access at the RLS layer regardless of what the UI shows).
 *
 * No phone numbers or names are shown for members beyond role and join
 * date — auth.users data isn't directly queryable from the client for
 * privacy reasons; a real "barber display name" feature would need a
 * small public profile table, intentionally not built yet to keep this
 * addition scoped.
 */
export default function ManageBarbersScreen(_props: ScreenProps<"ManageBarbers">) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadMembers = useCallback(async (id: string) => {
    const data = await getShopMembers(id);
    setMembers(data as MemberRow[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const id = await getStoredShopId();
          if (!id) return;
          setShopId(id);
          await loadMembers(id);
        } catch (err) {
          console.warn("Failed to load shop members:", err);
        } finally {
          setLoading(false);
        }
      })();
    }, [loadMembers])
  );

  const handleGenerateInvite = async () => {
    if (!shopId) return;
    setGenerating(true);
    try {
      const code = await generateInviteCode(shopId);
      await Share.share({
        message: `Join our shop on Wazini! Open the app, choose "Join with a code", and enter: ${code}\n\nThis code expires in 7 days.`,
      });
    } catch (err) {
      Alert.alert(
        "Couldn't generate a code",
        "Only the shop owner can invite barbers. Check your connection and try again."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleRemove = (member: MemberRow) => {
    if (member.role === "owner") return; // defensive — RLS also blocks this server-side
    Alert.alert(
      "Remove this barber?",
      "They'll lose access to this shop's data immediately. Their past confirmed sessions stay in your records.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeShopMember(member.id);
            if (shopId) loadMembers(shopId);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.inviteButton, generating && styles.inviteButtonDisabled]}
        onPress={handleGenerateInvite}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <Text style={styles.inviteLabel}>Invite a Barber</Text>
        )}
      </Pressable>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={styles.listLabel}>Shop members</Text>}
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <View>
              <Text style={styles.memberRole}>
                {item.role === "owner" ? "Owner" : "Barber"}
              </Text>
              <Text style={styles.memberJoined}>
                Joined {new Date(item.joined_at).toLocaleDateString()}
              </Text>
            </View>
            {item.role !== "owner" && (
              <Pressable onPress={() => handleRemove(item)} hitSlop={spacing.sm}>
                <Text style={styles.removeLabel}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    margin: spacing.lg,
  },
  inviteButtonDisabled: {
    opacity: 0.5,
  },
  inviteLabel: {
    ...typography.label,
    color: colors.textOnDark,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  listLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  memberRow: {
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
  memberRole: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  memberJoined: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeLabel: {
    ...typography.caption,
    color: colors.danger,
  },
});
