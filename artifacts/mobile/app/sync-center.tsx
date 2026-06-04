import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import GeofenceGate from "@/components/GeofenceGate";
import { useAuth } from "@/contexts/AuthContext";
import { getSyncStats } from "@/services/database";
import { syncService, SyncState } from "@/services/SyncService";
import { fetchAwsStatus, type AwsStatus } from "@/services/AwsSyncService";
import { useColors } from "@/hooks/useColors";
import { friendlyConnectionMessage, friendlyErrorMessage } from "@/services/userMessages";

type PipelineStep = "collect" | "upload-api" | "upload-s3" | "purge";
type StepStatus = "waiting" | "active" | "done" | "failed" | "skipped";

interface StepState {
  collect: StepStatus;
  "upload-api": StepStatus;
  "upload-s3": StepStatus;
  purge: StepStatus;
}

const STEP_LABELS: Record<PipelineStep, string> = {
  collect: "Collect Records",
  "upload-api": "Sync to API Server",
  "upload-s3": "Upload to AWS S3",
  purge: "Purge Local Data",
};

const STEP_DESCRIPTIONS: Record<PipelineStep, string> = {
  collect: "Gather pending offline attendance and worker records",
  "upload-api": "Push records to the central NHAI server database",
  "upload-s3": "Archive batch to AWS S3 for Datalake 3.0 integration",
  purge: "Delete confirmed records from device to free storage",
};

const STEP_ICONS: Record<PipelineStep, string> = {
  collect: "storage",
  "upload-api": "dns",
  "upload-s3": "cloud-upload",
  purge: "delete-sweep",
};

const IDLE_STEPS: StepState = {
  collect: "waiting",
  "upload-api": "waiting",
  "upload-s3": "waiting",
  purge: "waiting",
};

function useSpinAnim() {
  const anim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const start = useCallback(() => {
    anim.setValue(0);
    loopRef.current = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true })
    );
    loopRef.current.start();
  }, [anim]);
  const stop = useCallback(() => {
    loopRef.current?.stop();
    anim.setValue(0);
  }, [anim]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return { rotate, start, stop };
}

export default function SyncCenterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, refreshDeviceAuth } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>(syncService.getState());
  const [awsStatus, setAwsStatus] = useState<AwsStatus | null>(null);
  const [steps, setSteps] = useState<StepState>(IDLE_STEPS);
  const [syncStats, setSyncStats] = useState({ pending: 0, synced: 0, failed: 0, lastSync: null as string | null });
  const [lastResult, setLastResult] = useState<{ synced: number; purged: number; s3Key?: string } | null>(null);
  const spinAnim = useSpinAnim();
  const unsubRef = useRef<(() => void) | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const stats = await getSyncStats();
      setSyncStats(stats);
    } catch (err) {
      console.warn("[sync-center] loadStats failed:", err);
    }
  }, []);

  const checkAws = useCallback(async () => {
    if (syncState.isOnline) {
      try {
      const status = await fetchAwsStatus();
      setAwsStatus(status);
      } catch (err) {
        console.warn("[sync-center] checkAws failed:", err);
      }
    }
  }, [syncState.isOnline]);

  useEffect(() => {
    loadStats();
    checkAws();

    unsubRef.current = syncService.subscribe((state) => {
      setSyncState(state);
      if (state.awsStatus) setAwsStatus(state.awsStatus);
      if (!state.isSyncing && !state.isPurging) {
        loadStats();
      }
    });

    return () => { unsubRef.current?.(); };
  }, [loadStats, checkAws]);

  useEffect(() => {
    if (user?.role === "operator") {
      void refreshDeviceAuth();
    }
  }, [refreshDeviceAuth, user?.role]);

  const runSyncWithSteps = useCallback(async () => {
    if (!syncState.isOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Offline",
        "No internet connection. Records will sync automatically when connection is restored."
      );
      return;
    }
    if (syncState.isSyncing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const refreshed = await refreshDeviceAuth();
      const current = refreshed ?? user;
      if (current?.role === "operator" && current.geofenceAllowed === false) {
        Alert.alert(
          "Outside Authorized Toll Plaza",
          "You are outside the authorized toll plaza location. Attendance operations are not allowed.",
        );
        return;
      }

      const stats = await getSyncStats();
      if (stats.pending === 0) {
        Alert.alert("Nothing to Sync", "All records are already synced and purged.");
        return;
      }

      setSteps({ collect: "active", "upload-api": "waiting", "upload-s3": "waiting", purge: "waiting" });
      spinAnim.start();

      await new Promise((r) => setTimeout(r, 600));
      setSteps({ collect: "done", "upload-api": "active", "upload-s3": "waiting", purge: "waiting" });

      const result = await syncService.sync();

      if (result.errors > 0 || result.synced === 0) {
        setSteps({ collect: "done", "upload-api": "failed", "upload-s3": "skipped", purge: "skipped" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Sync Failed", friendlyErrorMessage(syncState.lastError, friendlyConnectionMessage()));
        return;
      }

      setSteps({ collect: "done", "upload-api": "done", "upload-s3": "active", "purge": "waiting" });
      await new Promise((r) => setTimeout(r, 500));

      const s3Done = result.awsUploaded;
      setSteps({
        collect: "done",
        "upload-api": "done",
        "upload-s3": s3Done ? "done" : "skipped",
        purge: "active",
      });
      await new Promise((r) => setTimeout(r, 700));

      setSteps({
        collect: "done",
        "upload-api": "done",
        "upload-s3": s3Done ? "done" : "skipped",
        purge: "done",
      });

      setLastResult({ synced: result.synced, purged: result.purgedAttendance, s3Key: result.s3Key });
      await loadStats();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await new Promise((r) => setTimeout(r, 3000));
      setSteps(IDLE_STEPS);
    } catch (err) {
      console.warn("[sync-center] sync failed:", err);
      setSteps({ collect: "done", "upload-api": "failed", "upload-s3": "skipped", purge: "skipped" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sync Failed", friendlyErrorMessage(err, friendlyConnectionMessage()));
    } finally {
      spinAnim.stop();
    }
  }, [syncState, spinAnim, loadStats, refreshDeviceAuth, user]);

  const isBusy = syncState.isSyncing || syncState.isPurging;
  const anyActive = Object.values(steps).some((s) => s === "active");

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  function stepColor(status: StepStatus): string {
    switch (status) {
      case "done": return colors.success;
      case "active": return colors.primary;
      case "failed": return "#ef4444";
      case "skipped": return colors.textMuted;
      default: return colors.border;
    }
  }

  function stepBg(status: StepStatus): string {
    switch (status) {
      case "done": return colors.successBg;
      case "active": return colors.primary + "18";
      case "failed": return "#fee2e2";
      case "skipped": return colors.card;
      default: return colors.card;
    }
  }

  function stepIcon(step: PipelineStep, status: StepStatus) {
    if (status === "done") return <MaterialIcons name="check-circle" size={22} color={colors.success} />;
    if (status === "failed") return <MaterialIcons name="error" size={22} color="#ef4444" />;
    if (status === "skipped") return <MaterialIcons name="remove-circle-outline" size={22} color={colors.textMuted} />;
    if (status === "active") {
      return (
        <Animated.View style={{ transform: [{ rotate: spinAnim.rotate }] }}>
          <MaterialIcons name="sync" size={22} color={colors.primary} />
        </Animated.View>
      );
    }
    return <MaterialIcons name={STEP_ICONS[step] as any} size={22} color={colors.textMuted} />;
  }

  const STEPS: PipelineStep[] = ["collect", "upload-api", "upload-s3", "purge"];

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Sync & Purge Center" showBack onBack={() => router.back()} />

        {user?.role === "operator" && user.geofenceAllowed === false ? (
          <GeofenceGate
            plazaName={user.plazaName}
            distanceMeters={user.geofenceDistanceMeters ?? null}
            radiusMeters={user.plazaRadiusMeters ?? null}
            message={user.geofenceMessage}
            onRetry={() => { void refreshDeviceAuth(); }}
            onBack={() => router.back()}
          />
        ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Network status banner */}
          <View
            style={[
              styles.netBanner,
              {
                backgroundColor: syncState.isOnline ? colors.successBg : colors.warningBg,
                borderColor: syncState.isOnline ? colors.success + "44" : colors.warning + "44",
              },
            ]}
          >
            <MaterialIcons
              name={syncState.isOnline ? "wifi" : "wifi-off"}
              size={20}
              color={syncState.isOnline ? colors.success : colors.warning}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.netTitle, { color: syncState.isOnline ? colors.success : colors.warning }]}>
                {syncState.isOnline ? "Connected" : "Offline Mode"}
              </Text>
              <Text style={[styles.netSub, { color: colors.textSecondary }]}>
                {syncState.isOnline
                  ? isBusy
                    ? "Sync in progress..."
                    : "Ready to sync"
                  : "Records queued — auto-sync when connection restores"}
              </Text>
            </View>
            {isBusy && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {/* AWS status card */}
          <View style={[styles.awsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.awsRow}>
              <MaterialIcons name="cloud" size={20} color={awsStatus?.configured ? "#f97316" : colors.textMuted} />
              <Text style={[styles.awsTitle, { color: colors.foreground }]}>AWS S3 Integration</Text>
              <View
                style={[
                  styles.awsPill,
                  { backgroundColor: awsStatus?.configured ? "#fff7ed" : colors.card, borderColor: awsStatus?.configured ? "#f97316" : colors.border },
                ]}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: awsStatus?.configured ? "#f97316" : colors.textMuted }}>
                  {awsStatus === null ? "Checking..." : awsStatus.configured ? "CONFIGURED" : "NOT SET"}
                </Text>
              </View>
            </View>
            {awsStatus?.configured ? (
              <View style={{ gap: 2, marginTop: 6 }}>
                <Text style={[styles.awsMeta, { color: colors.textSecondary }]}>
                  Bucket: <Text style={{ color: colors.foreground }}>{awsStatus.bucket}</Text>
                </Text>
                <Text style={[styles.awsMeta, { color: colors.textSecondary }]}>
                  Region: <Text style={{ color: colors.foreground }}>{awsStatus.region}</Text>
                </Text>
                {syncState.lastS3Key && (
                  <Text style={[styles.awsMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    Last key: <Text style={{ color: "#f97316" }}>{syncState.lastS3Key}</Text>
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.awsMeta, { color: colors.textMuted, marginTop: 4 }]}>
                Cloud archival is not configured yet. Records will still sync to the main server normally.
              </Text>
            )}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: "Pending", value: syncStats.pending, color: colors.warning, icon: "upload" },
              { label: "Synced", value: syncStats.synced, color: colors.success, icon: "cloud-done" },
              { label: "Purged", value: syncState.purgedTotal, color: "#8b5cf6", icon: "delete-sweep" },
            ].map((s) => (
              <View
                key={s.label}
                style={[styles.statCard, { backgroundColor: colors.card, borderColor: s.color + "33" }]}
              >
                <MaterialIcons name={s.icon as any} size={22} color={s.color} />
                <Text style={[styles.statNum, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Last sync / purge info */}
          {(syncState.lastSyncedAt || syncState.lastPurgedAt) && (
            <View style={[styles.lastRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {syncState.lastSyncedAt && (
                <View style={styles.lastItem}>
                  <MaterialIcons name="check-circle" size={14} color={colors.success} />
                  <Text style={[styles.lastText, { color: colors.textSecondary }]}>
                    Synced {new Date(syncState.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
              {syncState.lastPurgedAt && (
                <View style={styles.lastItem}>
                  <MaterialIcons name="delete-sweep" size={14} color="#8b5cf6" />
                  <Text style={[styles.lastText, { color: colors.textSecondary }]}>
                    Purged {new Date(syncState.lastPurgedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Error banner */}
          {syncState.lastError && !isBusy && (
            <View style={[styles.errorBanner, { backgroundColor: "#fee2e2" }]}>
              <MaterialIcons name="warning" size={16} color="#dc2626" />
              <Text style={[styles.errorText, { color: "#dc2626" }]} numberOfLines={2}>
                {friendlyErrorMessage(syncState.lastError, friendlyConnectionMessage())}
              </Text>
            </View>
          )}

          {/* Sync pipeline */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sync Pipeline</Text>
          <View style={[styles.pipeline, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {STEPS.map((step, idx) => {
              const status = steps[step];
              const isLast = idx === STEPS.length - 1;
              return (
                <View key={step}>
                  <View style={[styles.pipelineStep, { backgroundColor: stepBg(status) }]}>
                    <View style={[styles.stepIconWrap, { borderColor: stepColor(status) + "44", backgroundColor: stepBg(status) }]}>
                      {stepIcon(step, status)}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.stepTitleRow}>
                        <Text style={[styles.stepTitle, { color: status === "waiting" || status === "skipped" ? colors.textSecondary : colors.foreground }]}>
                          {STEP_LABELS[step]}
                        </Text>
                        {step === "upload-s3" && !awsStatus?.configured && status === "waiting" && (
                          <View style={[styles.optionalPill, { borderColor: colors.border }]}>
                            <Text style={{ fontSize: 10, color: colors.textMuted }}>requires config</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
                        {STEP_DESCRIPTIONS[step]}
                      </Text>
                    </View>
                    <View style={[styles.stepNum, { backgroundColor: stepColor(status) + "22" }]}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: stepColor(status) }}>
                        {String(idx + 1).padStart(2, "0")}
                      </Text>
                    </View>
                  </View>
                  {!isLast && (
                    <View style={styles.connector}>
                      <View style={[styles.connectorLine, { backgroundColor: stepColor(status) === colors.border ? colors.border : stepColor(status) + "55" }]} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Last result */}
          {lastResult && !anyActive && (
            <View style={[styles.resultCard, { backgroundColor: colors.successBg, borderColor: colors.success + "44" }]}>
              <MaterialIcons name="check-circle" size={20} color={colors.success} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.resultTitle, { color: colors.success }]}>Sync Complete</Text>
                <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
                  {lastResult.synced} record{lastResult.synced !== 1 ? "s" : ""} synced
                  {lastResult.purged > 0 ? ` · ${lastResult.purged} purged from device` : ""}
                  {lastResult.s3Key ? " · Archived to S3" : ""}
                </Text>
              </View>
            </View>
          )}

          {/* Sync button */}
          <TouchableOpacity
            style={[
              styles.syncBtn,
              {
                backgroundColor: isBusy || anyActive ? colors.primaryDark : colors.primary,
                borderRadius: colors.radius,
                opacity: isBusy || anyActive ? 0.7 : 1,
              },
            ]}
            onPress={runSyncWithSteps}
            disabled={isBusy || anyActive}
            activeOpacity={0.85}
          >
            {isBusy || anyActive ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.syncBtnText}>
                  {syncState.isPurging ? "Purging data..." : "Syncing to cloud..."}
                </Text>
              </>
            ) : (
              <>
                <MaterialIcons name="sync" size={22} color="#fff" />
                <Text style={styles.syncBtnText}>
                  {syncStats.pending > 0
                    ? `Sync & Purge ${syncStats.pending} Record${syncStats.pending !== 1 ? "s" : ""}`
                    : "All Records Synced"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="info-outline" size={14} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              Auto-sync triggers when internet is restored. Face recognition data (worker biometrics) is never purged — only attendance records older than today are removed.
            </Text>
          </View>
        </ScrollView>
        )}
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  netBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  netTitle: { fontSize: 14, fontWeight: "700" },
  netSub: { fontSize: 12, marginTop: 2 },
  awsCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  awsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  awsTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  awsPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  awsMeta: { fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", padding: 14, borderWidth: 1, borderRadius: 12, gap: 4 },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11 },
  lastRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 12,
    padding: 10, borderRadius: 10, borderWidth: 1,
  },
  lastItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  lastText: { fontSize: 12 },
  errorBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#fca5a5",
  },
  errorText: { fontSize: 12, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  pipeline: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  pipelineStep: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
  },
  stepIconWrap: {
    width: 42, height: 42, borderRadius: 12, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  stepTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepTitle: { fontSize: 14, fontWeight: "700" },
  stepDesc: { fontSize: 11, lineHeight: 15 },
  stepNum: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  optionalPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, borderWidth: 1,
  },
  connector: { paddingLeft: 28, height: 18, justifyContent: "center" },
  connectorLine: { width: 2, height: 18, borderRadius: 1 },
  resultCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  resultTitle: { fontSize: 14, fontWeight: "700" },
  resultSub: { fontSize: 12 },
  syncBtn: {
    height: 58, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, marginTop: 4,
  },
  syncBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  noticeText: { fontSize: 11, flex: 1, lineHeight: 16 },
});
