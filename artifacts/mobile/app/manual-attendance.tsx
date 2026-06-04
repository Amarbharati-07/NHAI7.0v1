import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import { useAuth } from "@/contexts/AuthContext";
import { Worker, getWorkers, getWorkersByPlaza, insertAttendance, getAttendanceRecords } from "@/services/database";
import {
  requestLocationPermission,
  getCurrentLocation,
  checkGeofence,
  formatDistance,
  GpsLocation,
} from "@/services/locationService";
import { syncService } from "@/services/SyncService";
import { useColors } from "@/hooks/useColors";

type MarkStatus = "idle" | "marking" | "done" | "error";

interface WorkerWithMark extends Worker {
  markedToday?: "present" | "absent" | null;
  markStatus?: MarkStatus;
}

function AdminOnlyGate({ onGoToFaceScan }: { onGoToFaceScan: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32, paddingTop: insets.top + 16 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.warning + "22", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Ionicons name="lock-closed-outline" size={36} color={colors.warning} />
      </View>
      <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>
        Admin Access Only
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28 }}>
        Manual attendance override requires admin privileges. All attendance must be recorded through face recognition to ensure accuracy and prevent fraud.
      </Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 }}
        onPress={onGoToFaceScan}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="face-recognition" size={20} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Use Face Scan Instead</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ marginTop: 12, padding: 12 }} onPress={() => router.back()}>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ManualAttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <DrawerOverlay>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <AppHeader title="Manual Attendance" showBack onBack={() => router.back()} />
          <AdminOnlyGate onGoToFaceScan={() => router.replace("/attendance" as never)} />
        </View>
      </DrawerOverlay>
    );
  }

  const [workers, setWorkers]         = useState<WorkerWithMark[]>([]);
  const [loading, setLoading]         = useState(true);
  const [isOnline, setIsOnline]       = useState(syncService.getState().isOnline);
  const [location, setLocation]       = useState<GpsLocation | null>(null);
  const [locLoading, setLocLoading]   = useState(false);
  const [locPermission, setLocPermission] = useState<"granted" | "denied" | "pending">("pending");
  const [geofenceOk, setGeofenceOk]   = useState<boolean | null>(null);
  const [geofenceDist, setGeofenceDist] = useState<number>(0);
  const locRef = useRef<GpsLocation | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

  const initLocation = useCallback(async () => {
    try {
      setLocLoading(true);
      const granted = await requestLocationPermission();
      setLocPermission(granted ? "granted" : "denied");
      if (granted) {
        const loc = await getCurrentLocation();
        locRef.current = loc;
        setLocation(loc);
        if (loc && user?.plazaId) {
          const geo = await checkGeofence(user.plazaId, loc.latitude, loc.longitude);
          setGeofenceOk(geo.configured ? geo.inBounds : null);
          setGeofenceDist(geo.distance);
          if (!geo.configured) {
            Alert.alert("Plaza GPS coordinates not configured", geo.message);
          }
        }
      }
    } catch (err) {
      console.warn("[manual-attendance] initLocation failed:", err);
      setLocPermission("denied");
    } finally {
      setLocLoading(false);
    }
  }, [user?.plazaId]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const allWorkers = user?.plazaId
        ? await getWorkersByPlaza(user.plazaId, "active")
        : await getWorkers();

      const todayRecords = await getAttendanceRecords();
      const todayMap = new Map<number, "present" | "absent">();
      for (const r of todayRecords) {
        if (r.date === today) todayMap.set(r.workerId, r.status as "present" | "absent");
      }

      setWorkers(allWorkers.map((w) => ({
        ...w,
        markedToday: todayMap.get(w.id!) ?? null,
        markStatus: "idle" as MarkStatus,
      })));
    } catch (err) {
      console.warn("[manual-attendance] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.plazaId, today]);

  useEffect(() => {
    load();
    initLocation();
    const unsub = syncService.subscribe((s) => setIsOnline(s.isOnline));
    return () => unsub();
  }, [load, initLocation]);

  const markAttendance = async (worker: WorkerWithMark, status: "present" | "absent") => {
    if (worker.markedToday) {
      Alert.alert("Already Marked", `${worker.fullName} is already marked as ${worker.markedToday} today.`);
      return;
    }

    if (geofenceOk === false && user?.plazaId) {
      Alert.alert(
        "Outside Plaza Boundary",
        `You are ${formatDistance(geofenceDist)} away from ${user.plazaName ?? "the plaza"}. Do you still want to mark attendance?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark Anyway", onPress: () => doMark(worker, status) },
        ]
      );
      return;
    }

    await doMark(worker, status);
  };

  const doMark = async (worker: WorkerWithMark, status: "present" | "absent") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWorkers((prev) => prev.map((w) => w.id === worker.id ? { ...w, markStatus: "marking" } : w));

    const currentTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const loc = locRef.current;

    try {
      await insertAttendance({
        workerId: worker.id!,
        date: today,
        time: currentTime,
        status,
        syncStatus: "pending",
        plazaId: user?.plazaId ?? worker.plazaId ?? "",
        operatorId: user?.userId ?? "",
        deviceToken: user?.deviceToken ?? "",
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
      });

      setWorkers((prev) =>
        prev.map((w) => w.id === worker.id ? { ...w, markedToday: status, markStatus: "done" } : w)
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isOnline) syncService.sync();
    } catch {
      setWorkers((prev) => prev.map((w) => w.id === worker.id ? { ...w, markStatus: "error" } : w));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const presentCount = workers.filter((w) => w.markedToday === "present").length;
  const absentCount  = workers.filter((w) => w.markedToday === "absent").length;
  const pendingCount = workers.filter((w) => !w.markedToday).length;

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const geofenceColor = geofenceOk === true ? colors.success : geofenceOk === false ? colors.destructive : colors.textMuted;
  const geofenceBg    = geofenceOk === true ? colors.successBg : geofenceOk === false ? (colors.destructive + "22") : colors.surface;
  const geofenceIcon  = geofenceOk === true ? "checkmark-circle" : geofenceOk === false ? "alert-circle" : "location-outline";

  const renderWorker = ({ item }: { item: WorkerWithMark }) => {
    const isMarking = item.markStatus === "marking";
    const isPresent = item.markedToday === "present";
    const isAbsent  = item.markedToday === "absent";
    const isDone    = isPresent || isAbsent;

    return (
      <View style={[styles.workerCard, {
        backgroundColor: colors.card,
        borderColor: isPresent ? colors.success + "55" : isAbsent ? colors.destructive + "55" : colors.border,
        borderRadius: colors.radius,
      }]}>
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
          <Text style={[styles.workerName, { color: colors.foreground }]}>{item.fullName}</Text>
          <Text style={[styles.workerMeta, { color: colors.textMuted }]}>
            {item.workerId} · {item.department}
          </Text>
          {isDone && (
            <View style={[styles.markedBadge, {
              backgroundColor: isPresent ? colors.successBg : colors.destructive + "22",
            }]}>
              <Text style={[styles.markedBadgeText, { color: isPresent ? colors.success : colors.destructive }]}>
                {isPresent ? "Present" : "Absent"} · {nowTime}
                {location ? ` · GPS ✓` : ""}
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

        {/* Context banner */}
        {user?.plazaName && (
          <View style={[styles.contextBanner, { backgroundColor: colors.primary + "12", borderBottomColor: colors.primary + "22" }]}>
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text style={[styles.contextText, { color: colors.primary }]}>
              {user.plazaName} · {user.userId}
            </Text>
            <View style={[styles.netBadge, { backgroundColor: isOnline ? colors.successBg : colors.warningBg }]}>
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
              {/* Stats row */}
              <View style={styles.statsRow}>
                {[
                  { label: "Present", count: presentCount, color: colors.success,              bg: colors.successBg },
                  { label: "Absent",  count: absentCount,  color: colors.destructive ?? "#ef4444", bg: colors.destructive + "22" },
                  { label: "Pending", count: pendingCount, color: colors.warning,              bg: colors.warningBg },
                ].map((s) => (
                  <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg, borderRadius: colors.radius }]}>
                    <Text style={[styles.statNum, { color: s.color }]}>{s.count}</Text>
                    <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* GPS / Geofence status */}
              <View style={[styles.gpsBanner, {
                backgroundColor: geofenceBg,
                borderColor: geofenceColor + "44",
                borderRadius: colors.radius,
              }]}>
                <Ionicons
                  name={locLoading ? "sync-outline" : geofenceIcon as any}
                  size={16}
                  color={locLoading ? colors.textMuted : geofenceColor}
                />
                <View style={{ flex: 1 }}>
                  {locLoading ? (
                    <Text style={[styles.gpsText, { color: colors.textMuted }]}>Getting your location...</Text>
                  ) : locPermission === "denied" ? (
                    <Text style={[styles.gpsText, { color: colors.textMuted }]}>
                      Location permission denied — GPS not recorded
                    </Text>
                  ) : location ? (
                    <>
                      <Text style={[styles.gpsText, { color: geofenceColor, fontWeight: "700" }]}>
                        {geofenceOk === true
                          ? `Within plaza boundary (${formatDistance(geofenceDist)} from plaza)`
                          : geofenceOk === false
                          ? `Outside boundary — ${formatDistance(geofenceDist)} from plaza`
                          : "Location acquired"}
                      </Text>
                      <Text style={[styles.gpsSub, { color: colors.textMuted }]}>
                        {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                        {location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ""}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.gpsText, { color: colors.textMuted }]}>
                      Could not get location — tap to retry
                    </Text>
                  )}
                </View>
                {!locLoading && (
                  <TouchableOpacity onPress={initLocation} style={styles.gpsRetry}>
                    <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Offline warning */}
              {!isOnline && (
                <View style={[styles.offlineBanner, {
                  backgroundColor: colors.warningBg,
                  borderColor: colors.warning + "44",
                  borderRadius: colors.radius,
                }]}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.warning} />
                  <Text style={[styles.offlineText, { color: colors.warning }]}>
                    Offline — records saved locally, syncs automatically when internet returns
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
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No workers found at this plaza</Text>
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
  statCard: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 4 },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600" },
  gpsBanner: { flexDirection: "row", alignItems: "flex-start", padding: 12, borderWidth: 1, marginBottom: 4, gap: 10 },
  gpsText: { fontSize: 12, fontWeight: "500" },
  gpsSub: { fontSize: 10, marginTop: 2 },
  gpsRetry: { padding: 4 },
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
