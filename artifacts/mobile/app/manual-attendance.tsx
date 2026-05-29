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
import { useAuth } from "@/contexts/AuthContext";
import { Worker, getWorkers, getWorkersByPlaza, insertAttendance, getAttendanceRecords } from "@/services/database";
import { syncService } from "@/services/SyncService";
import { useColors } from "@/hooks/useColors";

type MarkStatus = "idle" | "marking" | "done" | "error";

interface WorkerWithMark extends Worker {
  markedToday?: "present" | "absent" | null;
  markStatus?: MarkStatus;
}

export default function ManualAttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [workers, setWorkers] = useState<WorkerWithMark[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(syncService.getState().isOnline);

  const today = new Date().toISOString().split("T")[0];
  const now   = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allWorkers = user?.plazaId
        ? await getWorkersByPlaza(user.plazaId, "active")
        : await getWorkers();

      const todayRecords = await getAttendanceRecords();
      const todayMap = new Map<number, "present" | "absent">();
      for (const r of todayRecords) {
        if (r.date === today) {
          todayMap.set(r.workerId, r.status as "present" | "absent");
        }
      }

      setWorkers(
        allWorkers.map((w) => ({
          ...w,
          markedToday: todayMap.get(w.id!) ?? null,
          markStatus: "idle",
        }))
      );
    } catch {}
    setLoading(false);
  }, [user?.plazaId, today]);

  useEffect(() => {
    load();
    const unsub = syncService.subscribe((s) => setIsOnline(s.isOnline));
    return () => unsub();
  }, [load]);

  const markAttendance = async (worker: WorkerWithMark, status: "present" | "absent") => {
    if (worker.markedToday) {
      Alert.alert(
        "Already Marked",
        `${worker.fullName} is already marked as ${worker.markedToday} today.`
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setWorkers((prev) =>
      prev.map((w) =>
        w.id === worker.id ? { ...w, markStatus: "marking" } : w
      )
    );

    try {
      await insertAttendance({
        workerId: worker.id!,
        date: today,
        time: now,
        status,
        syncStatus: "pending",
        plazaId: user?.plazaId ?? worker.plazaId ?? "",
        operatorId: user?.userId ?? "",
        deviceToken: user?.deviceToken ?? "",
      });

      setWorkers((prev) =>
        prev.map((w) =>
          w.id === worker.id
            ? { ...w, markedToday: status, markStatus: "done" }
            : w
        )
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (isOnline) syncService.sync();
    } catch {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === worker.id ? { ...w, markStatus: "error" } : w
        )
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const presentCount = workers.filter((w) => w.markedToday === "present").length;
  const absentCount  = workers.filter((w) => w.markedToday === "absent").length;
  const pendingCount = workers.filter((w) => !w.markedToday).length;

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const renderWorker = ({ item }: { item: WorkerWithMark }) => {
    const isMarking = item.markStatus === "marking";
    const isPresent = item.markedToday === "present";
    const isAbsent  = item.markedToday === "absent";
    const isDone    = isPresent || isAbsent;

    return (
      <View
        style={[
          styles.workerCard,
          {
            backgroundColor: colors.card,
            borderColor: isPresent
              ? colors.success + "55"
              : isAbsent
              ? colors.destructive + "55"
              : colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={[styles.workerAvatar, {
          backgroundColor: isDone
            ? (isPresent ? colors.successBg : colors.destructive + "22")
            : colors.primary + "22",
        }]}>
          <Ionicons
            name={isDone ? (isPresent ? "checkmark-circle" : "close-circle") : "person-outline"}
            size={22}
            color={isDone ? (isPresent ? colors.success : colors.destructive) : colors.accent}
          />
        </View>

        <View style={styles.workerInfo}>
          <Text style={[styles.workerName, { color: colors.foreground }]}>
            {item.fullName}
          </Text>
          <Text style={[styles.workerMeta, { color: colors.textMuted }]}>
            {item.workerId} · {item.department}
          </Text>
          {isDone && (
            <View style={[styles.markedBadge, {
              backgroundColor: isPresent ? colors.successBg : colors.destructive + "22",
            }]}>
              <Text style={[styles.markedBadgeText, {
                color: isPresent ? colors.success : colors.destructive,
              }]}>
                {isPresent ? "Present" : "Absent"} · {now}
              </Text>
            </View>
          )}
        </View>

        {isMarking ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : isDone ? (
          <Ionicons
            name={isPresent ? "checkmark-circle" : "close-circle"}
            size={28}
            color={isPresent ? colors.success : colors.destructive}
          />
        ) : (
          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={[styles.presentBtn, { backgroundColor: colors.success }]}
              onPress={() => markAttendance(item, "present")}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Present</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.absentBtn, { backgroundColor: colors.destructive ?? "#ef4444" }]}
              onPress={() => markAttendance(item, "absent")}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Absent</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Mark Attendance" showBack onBack={() => router.back()} />

        {user?.plazaName && (
          <View style={[styles.contextBanner, { backgroundColor: colors.primary + "12", borderBottomColor: colors.primary + "22" }]}>
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text style={[styles.contextText, { color: colors.primary }]}>
              {user.plazaName} · {user.userId}
            </Text>
            <View style={[styles.netBadge, {
              backgroundColor: isOnline ? colors.successBg : colors.warningBg,
            }]}>
              <Ionicons name={isOnline ? "wifi" : "wifi-outline"} size={11} color={isOnline ? colors.success : colors.warning} />
              <Text style={[styles.netBadgeText, { color: isOnline ? colors.success : colors.warning }]}>
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
        )}

        <FlatList
          data={workers}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderWorker}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Today's stats */}
              <View style={styles.statsRow}>
                {[
                  { label: "Present", count: presentCount, color: colors.success, bg: colors.successBg },
                  { label: "Absent",  count: absentCount,  color: colors.destructive ?? "#ef4444", bg: colors.destructive + "22" },
                  { label: "Pending", count: pendingCount, color: colors.warning,   bg: colors.warningBg },
                ].map((s) => (
                  <View key={s.label} style={[styles.statCard, {
                    backgroundColor: s.bg,
                    borderRadius: colors.radius,
                  }]}>
                    <Text style={[styles.statNum, { color: s.color }]}>{s.count}</Text>
                    <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {!isOnline && (
                <View style={[styles.offlineBanner, {
                  backgroundColor: colors.warningBg,
                  borderColor: colors.warning + "44",
                  borderRadius: colors.radius,
                }]}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.warning} />
                  <Text style={[styles.offlineText, { color: colors.warning }]}>
                    Offline mode — records saved locally and will sync automatically when internet returns
                  </Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Workers ({workers.length})
              </Text>
            </>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading workers...</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No workers found</Text>
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
  content: { padding: 16, gap: 10 },
  contextBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1 },
  contextText: { flex: 1, fontSize: 12, fontWeight: "600" },
  netBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  netBadgeText: { fontSize: 11, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 4, borderRadius: 10 },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600" },
  offlineBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1, marginBottom: 4 },
  offlineText: { flex: 1, fontSize: 12, fontWeight: "500" },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  workerCard: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, gap: 12 },
  workerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  workerInfo: { flex: 1, gap: 3 },
  workerName: { fontSize: 14, fontWeight: "700" },
  workerMeta: { fontSize: 12 },
  markedBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, marginTop: 2 },
  markedBadgeText: { fontSize: 11, fontWeight: "600" },
  actionBtns: { gap: 6 },
  presentBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  absentBtn:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  center: { paddingTop: 48, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 13 },
  emptyText: { fontSize: 14 },
});
