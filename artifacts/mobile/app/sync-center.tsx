import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { SyncRecord, getSyncQueue, markSynced } from "@/services/database";
import { useColors } from "@/hooks/useColors";

export default function SyncCenterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getSyncQueue();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = records.filter((r) => r.status === "pending");
  const synced = records.filter((r) => r.status === "synced");

  const handleSync = async () => {
    if (!isOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("No Internet", "Cannot sync without internet connection. Records will be synced when connection is available.");
      return;
    }
    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    for (const rec of pending) {
      await markSynced(rec.id!);
      await new Promise((r) => setTimeout(r, 300));
    }
    await load();
    setSyncing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Sync Complete", `${pending.length} records synced successfully.`);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  const renderItem = ({ item }: { item: SyncRecord }) => (
    <View style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.itemIcon, {
        backgroundColor: item.status === "synced" ? colors.successBg : colors.warningBg,
      }]}>
        <Ionicons
          name={item.status === "synced" ? "cloud-done-outline" : "cloud-upload-outline"}
          size={18}
          color={item.status === "synced" ? colors.success : colors.warning}
        />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]}>
          {item.recordType.charAt(0).toUpperCase() + item.recordType.slice(1)} #{item.recordId}
        </Text>
        <Text style={[styles.itemSub, { color: colors.textMuted }]}>{item.createdAt?.split("T")[0] ?? "—"}</Text>
      </View>
      <View style={[styles.statusPill, {
        backgroundColor: item.status === "synced" ? colors.successBg : colors.warningBg,
      }]}>
        <Text style={[styles.statusText, { color: item.status === "synced" ? colors.success : colors.warning }]}>
          {item.status === "synced" ? "Synced" : "Pending"}
        </Text>
      </View>
    </View>
  );

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Sync Center" showBack onBack={() => router.back()} />
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Internet status */}
              <View style={[styles.netBanner, {
                backgroundColor: isOnline ? colors.successBg : colors.warningBg,
                borderColor: isOnline ? colors.success + "44" : colors.warning + "44",
              }]}>
                <Ionicons name={isOnline ? "wifi" : "wifi-outline"} size={20} color={isOnline ? colors.success : colors.warning} />
                <View style={styles.netInfo}>
                  <Text style={[styles.netTitle, { color: isOnline ? colors.success : colors.warning }]}>
                    {isOnline ? "Internet Available" : "No Internet Connection"}
                  </Text>
                  <Text style={[styles.netSub, { color: colors.textSecondary }]}>
                    {isOnline ? "Ready to sync records" : "Working in offline mode — records queued for sync"}
                  </Text>
                </View>
              </View>

              {/* Summary Cards */}
              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.warning + "44", borderRadius: colors.radius }]}>
                  <Ionicons name="cloud-upload-outline" size={24} color={colors.warning} />
                  <Text style={[styles.statNum, { color: colors.warning }]}>{pending.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pending</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.success + "44", borderRadius: colors.radius }]}>
                  <Ionicons name="cloud-done-outline" size={24} color={colors.success} />
                  <Text style={[styles.statNum, { color: colors.success }]}>{synced.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Synced</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.accent + "44", borderRadius: colors.radius }]}>
                  <Ionicons name="layers-outline" size={24} color={colors.accent} />
                  <Text style={[styles.statNum, { color: colors.accent }]}>{records.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
                </View>
              </View>

              {/* Sync Button */}
              <TouchableOpacity
                style={[styles.syncBtn, { backgroundColor: syncing ? colors.primaryDark : colors.primary, borderRadius: colors.radius }]}
                onPress={handleSync}
                disabled={syncing || pending.length === 0}
                activeOpacity={0.85}
              >
                {syncing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={22} color="#fff" />
                    <Text style={styles.syncBtnText}>
                      {pending.length > 0 ? `Sync ${pending.length} Records` : "All Records Synced"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sync Queue</Text>
            </>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="cloud-done-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Queue is empty</Text>
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
  netBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  netInfo: { flex: 1, gap: 2 },
  netTitle: { fontSize: 14, fontWeight: "700" },
  netSub: { fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", padding: 14, borderWidth: 1, gap: 4 },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  syncBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginVertical: 4 },
  syncBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  item: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, gap: 12 },
  itemIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  itemInfo: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: "600" },
  itemSub: { fontSize: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "700" },
  center: { paddingTop: 40, alignItems: "center" },
  empty: { alignItems: "center", paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 14 },
});
