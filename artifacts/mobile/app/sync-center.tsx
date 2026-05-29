import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { SyncRecord, getSyncQueue } from "@/services/database";
import { syncService, SyncState } from "@/services/SyncService";
import { useColors } from "@/hooks/useColors";

export default function SyncCenterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>(syncService.getState());
  const unsubRef = useRef<(() => void) | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const data = await getSyncQueue();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRecords();

    unsubRef.current = syncService.subscribe((state) => {
      setSyncState(state);
      if (!state.isSyncing) {
        loadRecords();
      }
    });

    return () => {
      unsubRef.current?.();
    };
  }, [loadRecords]);

  const pending = records.filter((r) => r.status === "pending");
  const synced = records.filter((r) => r.status === "synced");

  const handleManualSync = async () => {
    if (!syncState.isOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "No Internet",
        "Cannot sync without internet connection. Records will sync automatically when connection is restored."
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const result = await syncService.sync();

    if (result.synced > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sync Complete", `${result.synced} record${result.synced !== 1 ? "s" : ""} synced successfully.`);
    } else if (result.errors > 0 && syncState.lastError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sync Failed", `Could not reach server: ${syncState.lastError}`);
    } else {
      Alert.alert("Nothing to Sync", "All records are already synced.");
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  const renderItem = ({ item }: { item: SyncRecord }) => (
    <View
      style={[
        styles.item,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View
        style={[
          styles.itemIcon,
          {
            backgroundColor:
              item.status === "synced" ? colors.successBg : colors.warningBg,
          },
        ]}
      >
        <Ionicons
          name={
            item.status === "synced"
              ? "cloud-done-outline"
              : "cloud-upload-outline"
          }
          size={18}
          color={item.status === "synced" ? colors.success : colors.warning}
        />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]}>
          {item.recordType.charAt(0).toUpperCase() + item.recordType.slice(1)}{" "}
          #{item.recordId}
        </Text>
        <Text style={[styles.itemSub, { color: colors.textMuted }]}>
          {item.createdAt?.split("T")[0] ?? "—"}
        </Text>
      </View>
      <View
        style={[
          styles.statusPill,
          {
            backgroundColor:
              item.status === "synced" ? colors.successBg : colors.warningBg,
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            {
              color:
                item.status === "synced" ? colors.success : colors.warning,
            },
          ]}
        >
          {item.status === "synced" ? "Synced" : "Pending"}
        </Text>
      </View>
    </View>
  );

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader
          title="Sync Center"
          showBack
          onBack={() => router.back()}
        />
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Internet status banner */}
              <View
                style={[
                  styles.netBanner,
                  {
                    backgroundColor: syncState.isOnline
                      ? colors.successBg
                      : colors.warningBg,
                    borderColor: syncState.isOnline
                      ? colors.success + "44"
                      : colors.warning + "44",
                  },
                ]}
              >
                <Ionicons
                  name={syncState.isOnline ? "wifi" : "wifi-outline"}
                  size={20}
                  color={syncState.isOnline ? colors.success : colors.warning}
                />
                <View style={styles.netInfo}>
                  <Text
                    style={[
                      styles.netTitle,
                      {
                        color: syncState.isOnline
                          ? colors.success
                          : colors.warning,
                      },
                    ]}
                  >
                    {syncState.isOnline
                      ? "Internet Available"
                      : "No Internet Connection"}
                  </Text>
                  <Text
                    style={[
                      styles.netSub,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {syncState.isOnline
                      ? syncState.isSyncing
                        ? "Syncing records to server..."
                        : "Ready to sync records"
                      : "Working in offline mode — records queued for auto-sync"}
                  </Text>
                </View>
                {syncState.isSyncing && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                  />
                )}
              </View>

              {/* Last sync info */}
              {syncState.lastSyncedAt && (
                <View
                  style={[
                    styles.lastSyncRow,
                    { backgroundColor: colors.card, borderRadius: colors.radius },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={16}
                    color={colors.success}
                  />
                  <Text style={[styles.lastSyncText, { color: colors.textSecondary }]}>
                    Last synced:{" "}
                    {new Date(syncState.lastSyncedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              )}

              {/* Error banner */}
              {syncState.lastError && !syncState.isSyncing && (
                <View
                  style={[
                    styles.errorBanner,
                    { backgroundColor: colors.errorBg ?? "#fee2e2", borderRadius: colors.radius },
                  ]}
                >
                  <Ionicons name="warning-outline" size={16} color="#dc2626" />
                  <Text style={[styles.errorText, { color: "#dc2626" }]}>
                    Sync error: {syncState.lastError}
                  </Text>
                </View>
              )}

              {/* Summary cards */}
              <View style={styles.statsRow}>
                <View
                  style={[
                    styles.statCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.warning + "44",
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={24}
                    color={colors.warning}
                  />
                  <Text style={[styles.statNum, { color: colors.warning }]}>
                    {pending.length}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: colors.textSecondary }]}
                  >
                    Pending
                  </Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.success + "44",
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Ionicons
                    name="cloud-done-outline"
                    size={24}
                    color={colors.success}
                  />
                  <Text style={[styles.statNum, { color: colors.success }]}>
                    {synced.length}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: colors.textSecondary }]}
                  >
                    Synced
                  </Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.accent + "44",
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Ionicons
                    name="layers-outline"
                    size={24}
                    color={colors.accent}
                  />
                  <Text style={[styles.statNum, { color: colors.accent }]}>
                    {records.length}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: colors.textSecondary }]}
                  >
                    Total
                  </Text>
                </View>
              </View>

              {/* Auto-sync notice */}
              <View
                style={[
                  styles.autoSyncNote,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Ionicons
                  name="flash-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text
                  style={[styles.autoSyncText, { color: colors.textSecondary }]}
                >
                  Auto-sync activates when internet is restored
                </Text>
              </View>

              {/* Manual sync button */}
              <TouchableOpacity
                style={[
                  styles.syncBtn,
                  {
                    backgroundColor:
                      syncState.isSyncing ? colors.primaryDark : colors.primary,
                    borderRadius: colors.radius,
                    opacity:
                      syncState.isSyncing || pending.length === 0 ? 0.6 : 1,
                  },
                ]}
                onPress={handleManualSync}
                disabled={syncState.isSyncing || pending.length === 0}
                activeOpacity={0.85}
              >
                {syncState.isSyncing ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.syncBtnText}>Syncing...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={22} color="#fff" />
                    <Text style={styles.syncBtnText}>
                      {pending.length > 0
                        ? `Sync ${pending.length} Record${pending.length !== 1 ? "s" : ""} Now`
                        : "All Records Synced"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <Text
                style={[styles.sectionTitle, { color: colors.foreground }]}
              >
                Sync Queue
              </Text>
            </>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons
                  name="cloud-done-outline"
                  size={48}
                  color={colors.textMuted}
                />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  Queue is empty
                </Text>
              </View>
            )
          }
        />
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  netBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  netInfo: { flex: 1, gap: 2 },
  netTitle: { fontSize: 14, fontWeight: "700" },
  netSub: { fontSize: 12 },
  lastSyncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lastSyncText: { fontSize: 12 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  errorText: { fontSize: 12, flex: 1 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", padding: 14, borderWidth: 1, gap: 4 },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  autoSyncNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  autoSyncText: { fontSize: 12, flex: 1 },
  syncBtn: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginVertical: 4,
  },
  syncBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: "600" },
  itemSub: { fontSize: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "700" },
  center: { paddingTop: 40, alignItems: "center" },
  empty: { alignItems: "center", paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 14 },
});
