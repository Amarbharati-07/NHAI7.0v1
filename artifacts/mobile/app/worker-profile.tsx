import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  AuditLog,
  AttendanceRecord,
  Worker,
  WorkerStatus,
  getWorkerAttendance,
  getWorkerAttendanceStats,
  getWorkerAuditLogs,
  getWorkerById,
  getWorkerFaceImageCount,
  setWorkerStatus,
} from "@/services/database";

const TOTAL_POSES = 8;

const STATUS_META: Record<WorkerStatus, { bg: string; text: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  active: { bg: "#D1FAE5", text: "#059669", icon: "check-circle" },
  inactive: { bg: "#FEE2E2", text: "#DC2626", icon: "cancel" },
  transferred: { bg: "#FEF3C7", text: "#D97706", icon: "arrow-forward" },
};

function InfoRow({ icon, label, value, colors }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={ir.row}>
      <MaterialIcons name={icon} size={16} color={colors.textMuted} />
      <Text style={[ir.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[ir.value, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  label: { width: 100, fontSize: 13 },
  value: { flex: 1, fontSize: 13, fontWeight: "500" },
});

export default function WorkerProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [worker, setWorker] = useState<Worker | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [faceCount, setFaceCount] = useState(0);
  const [attStats, setAttStats] = useState({ present: 0, absent: 0, total: 0, rate: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const wid = Number(id);
    const [w, att, logs, fc, stats] = await Promise.all([
      getWorkerById(wid),
      getWorkerAttendance(wid),
      getWorkerAuditLogs(wid),
      getWorkerFaceImageCount(wid),
      getWorkerAttendanceStats(wid),
    ]);
    setWorker(w);
    setAttendance(att);
    setAuditLogs(logs);
    setFaceCount(fc);
    setAttStats(stats);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = useCallback((targetStatus: WorkerStatus) => {
    if (!worker?.id) return;
    const isDeactivating = targetStatus === "inactive";
    Alert.alert(
      isDeactivating ? "Deactivate Worker" : targetStatus === "transferred" ? "Mark as Transferred" : "Reactivate Worker",
      isDeactivating
        ? `Deactivate ${worker.fullName}? No records will be deleted. You can reactivate them at any time.`
        : targetStatus === "transferred"
        ? `Mark ${worker.fullName} as Transferred? This indicates the worker has moved to another site.`
        : `Reactivate ${worker.fullName}? Their status will return to Active.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isDeactivating ? "Deactivate" : targetStatus === "transferred" ? "Mark Transferred" : "Reactivate",
          style: isDeactivating ? "destructive" : "default",
          onPress: async () => {
            try {
              await setWorkerStatus(worker.id!, targetStatus, user?.name ?? "Operator");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              load();
            } catch {
              Alert.alert("Error", "Failed to update worker status.");
            }
          },
        },
      ]
    );
  }, [worker, user?.name, load]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  if (loading) {
    return (
      <DrawerOverlay>
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Worker Profile" showBack onBack={() => router.back()} />
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        </View>
      </DrawerOverlay>
    );
  }

  if (!worker) {
    return (
      <DrawerOverlay>
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Worker Profile" showBack onBack={() => router.back()} />
          <View style={s.center}>
            <MaterialIcons name="person-off" size={48} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>Worker not found</Text>
          </View>
        </View>
      </DrawerOverlay>
    );
  }

  const status = (worker.status ?? "active") as WorkerStatus;
  const sm = STATUS_META[status];
  const faceEnrolled = faceCount >= TOTAL_POSES;
  const facePercent = Math.min(100, Math.round((faceCount / TOTAL_POSES) * 100));

  return (
    <DrawerOverlay>
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Worker Profile" showBack onBack={() => router.back()} />
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ── */}
          <View style={[s.hero, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <View style={[s.heroAvatar, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <MaterialIcons name="person" size={44} color="rgba(255,255,255,0.85)" />
            </View>
            <Text style={s.heroName}>{worker.fullName}</Text>
            <Text style={s.heroId}>{worker.workerId}</Text>
            <Text style={s.heroSub}>{worker.employeeType} • {worker.department}</Text>
            <View style={[s.statusPill, { backgroundColor: sm.bg }]}>
              <MaterialIcons name={sm.icon} size={13} color={sm.text} />
              <Text style={[s.statusPillText, { color: sm.text }]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </View>
          </View>

          {/* ── Quick Actions ── */}
          <View style={s.quickActions}>
            <TouchableOpacity
              style={[s.qBtn, { backgroundColor: colors.card, borderColor: "#3B82F644" }]}
              onPress={() => router.push({ pathname: "/edit-worker", params: { id: String(worker.id) } } as never)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="edit" size={20} color="#3B82F6" />
              <Text style={[s.qBtnLabel, { color: "#3B82F6" }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.qBtn, { backgroundColor: colors.card, borderColor: "#8B5CF644" }]}
              onPress={() => router.push({ pathname: "/guided-face-capture", params: { sessionId: `reenroll_${worker.id}_${Date.now()}` } } as never)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="face" size={20} color="#8B5CF6" />
              <Text style={[s.qBtnLabel, { color: "#8B5CF6" }]}>Re-enroll</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.qBtn, { backgroundColor: colors.card, borderColor: "#0D948844" }]}
              onPress={() => router.push({ pathname: "/attendance-history" } as never)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="history" size={20} color="#0D9488" />
              <Text style={[s.qBtnLabel, { color: "#0D9488" }]}>History</Text>
            </TouchableOpacity>
          </View>

          {/* ── Attendance Stats Strip ── */}
          <View style={s.statsStrip}>
            {[
              { label: "Present", value: attStats.present, color: colors.success, bg: colors.successBg },
              { label: "Absent", value: attStats.absent, color: colors.destructive, bg: colors.destructive + "22" },
              { label: "Total Days", value: attStats.total, color: colors.accent, bg: colors.primary + "22" },
              { label: "Rate", value: `${attStats.rate}%`, color: "#8B5CF6", bg: "#8B5CF622" },
            ].map((item, i) => (
              <View key={i} style={[s.stripCard, { backgroundColor: item.bg, borderRadius: colors.radius }]}>
                <Text style={[s.stripVal, { color: item.color }]}>{item.value}</Text>
                <Text style={[s.stripLabel, { color: colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Worker Info ── */}
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.sectionHead}>
              <MaterialIcons name="person" size={16} color={colors.accent} />
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Worker Information</Text>
            </View>
            {[
              { icon: "call" as const, label: "Mobile", value: worker.mobile || "—" },
              { icon: "work" as const, label: "Department", value: worker.department },
              { icon: "business" as const, label: "Contractor", value: worker.contractorName || "—" },
              { icon: "location-on" as const, label: "Site Location", value: worker.siteLocation || "—" },
              { icon: "badge" as const, label: "Employee Type", value: worker.employeeType },
              { icon: "key" as const, label: "Plaza ID", value: worker.plazaId || "—" },
              { icon: "calendar-month" as const, label: "Registered", value: worker.createdAt?.split("T")[0] ?? "—" },
            ].map((row, i, arr) => (
              <View key={i}>
                <InfoRow icon={row.icon} label={row.label} value={row.value} colors={colors} />
                {i < arr.length - 1 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </View>

          {/* ── Face Enrollment ── */}
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.sectionHead}>
              <MaterialIcons name="face" size={16} color={colors.accent} />
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Face Enrollment</Text>
              <View style={[s.enrollBadge, { backgroundColor: faceEnrolled ? colors.successBg : colors.warningBg }]}>
                <MaterialIcons name={faceEnrolled ? "check-circle" : "error"} size={12} color={faceEnrolled ? colors.success : colors.warning} />
                <Text style={[s.enrollBadgeText, { color: faceEnrolled ? colors.success : colors.warning }]}>
                  {faceEnrolled ? "Complete" : "Incomplete"}
                </Text>
              </View>
            </View>
            <View style={s.faceRow}>
              <Text style={[s.faceSub, { color: colors.textSecondary }]}>
                {faceCount} of {TOTAL_POSES} poses captured
              </Text>
              <Text style={[s.facePct, { color: faceEnrolled ? colors.success : colors.warning }]}>{facePercent}%</Text>
            </View>
            <View style={[s.barBg, { backgroundColor: colors.surface }]}>
              <View style={[s.barFill, {
                width: `${facePercent}%` as never,
                backgroundColor: faceEnrolled ? colors.success : colors.warning,
              }]} />
            </View>
            {!faceEnrolled && (
              <TouchableOpacity
                style={[s.reenrollBtn, { backgroundColor: "#8B5CF6" + "22", borderColor: "#8B5CF633" }]}
                onPress={() => router.push({ pathname: "/guided-face-capture", params: { sessionId: `reenroll_${worker.id}_${Date.now()}` } } as never)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="face" size={16} color="#8B5CF6" />
                <Text style={[s.reenrollBtnText, { color: "#8B5CF6" }]}>Complete Face Re-enrollment</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Status Management ── */}
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.sectionHead}>
              <MaterialIcons name="security" size={16} color={colors.accent} />
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Status Management</Text>
            </View>
            <Text style={[s.statusNote, { color: colors.textSecondary }]}>
              Worker records are never permanently deleted. Use status changes to manage worker access.
            </Text>
            <View style={s.statusBtns}>
              {status !== "active" && (
                <TouchableOpacity
                  style={[s.statusActionBtn, { backgroundColor: colors.successBg, borderColor: colors.success + "44" }]}
                  onPress={() => handleStatusChange("active")}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="person-add" size={16} color={colors.success} />
                  <Text style={[s.statusActionText, { color: colors.success }]}>Reactivate</Text>
                </TouchableOpacity>
              )}
              {status !== "transferred" && (
                <TouchableOpacity
                  style={[s.statusActionBtn, { backgroundColor: "#FEF3C7", borderColor: "#D9770644" }]}
                  onPress={() => handleStatusChange("transferred")}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="arrow-forward" size={16} color="#D97706" />
                  <Text style={[s.statusActionText, { color: "#D97706" }]}>Mark Transferred</Text>
                </TouchableOpacity>
              )}
              {status === "active" && (
                <TouchableOpacity
                  style={[s.statusActionBtn, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "44" }]}
                  onPress={() => handleStatusChange("inactive")}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="person-remove" size={16} color={colors.destructive} />
                  <Text style={[s.statusActionText, { color: colors.destructive }]}>Deactivate Worker</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Recent Attendance ── */}
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.sectionHead}>
              <MaterialIcons name="calendar-month" size={16} color={colors.accent} />
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Recent Attendance</Text>
              <Text style={[s.sectionCount, { color: colors.textMuted }]}>{attendance.length} records</Text>
            </View>
            {attendance.length === 0 ? (
              <View style={s.emptySection}>
                <Text style={[s.emptyText, { color: colors.textMuted }]}>No attendance records yet</Text>
              </View>
            ) : (
              attendance.slice(0, 10).map((rec, i) => (
                <View key={rec.id}>
                  <View style={s.attRow}>
                    <View style={[s.attDot, { backgroundColor: rec.status === "present" ? colors.success : colors.destructive }]} />
                    <Text style={[s.attDate, { color: colors.foreground }]}>{rec.date}</Text>
                    <Text style={[s.attTime, { color: colors.textSecondary }]}>{rec.time !== "00:00" ? rec.time : "—"}</Text>
                    <View style={[s.attPill, { backgroundColor: rec.status === "present" ? colors.successBg : colors.destructive + "22" }]}>
                      <Text style={[s.attPillText, { color: rec.status === "present" ? colors.success : colors.destructive }]}>
                        {rec.status === "present" ? "Present" : "Absent"}
                      </Text>
                    </View>
                    <View style={[s.syncPill, { backgroundColor: rec.syncStatus === "synced" ? colors.primary + "15" : colors.warningBg }]}>
                      <Text style={[s.syncText, { color: rec.syncStatus === "synced" ? colors.accent : colors.warning }]}>
                        {rec.syncStatus === "synced" ? "Synced" : "Pending"}
                      </Text>
                    </View>
                  </View>
                  {i < Math.min(attendance.length, 10) - 1 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                </View>
              ))
            )}
          </View>

          {/* ── Audit Log ── */}
          {auditLogs.length > 0 && (
            <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={s.sectionHead}>
                <MaterialIcons name="history" size={16} color={colors.accent} />
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Audit Log</Text>
                <Text style={[s.sectionCount, { color: colors.textMuted }]}>{auditLogs.length} entries</Text>
              </View>
              {auditLogs.slice(0, 8).map((log, i) => (
                <View key={log.id}>
                  <View style={s.auditRow}>
                    <View style={[s.auditDot, {
                      backgroundColor: log.action === "status_change" ? colors.warning : colors.accent
                    }]} />
                    <View style={s.auditInfo}>
                      <Text style={[s.auditAction, { color: colors.foreground }]}>
                        {log.action === "status_change"
                          ? `Status: ${log.oldValue} → ${log.newValue}`
                          : `${log.fieldChanged} updated`}
                      </Text>
                      {log.action !== "status_change" && (
                        <Text style={[s.auditValues, { color: colors.textSecondary }]} numberOfLines={1}>
                          "{log.oldValue}" → "{log.newValue}"
                        </Text>
                      )}
                      <Text style={[s.auditMeta, { color: colors.textMuted }]}>
                        by {log.changedBy} • {log.createdAt?.split("T")[0] ?? "—"}
                      </Text>
                    </View>
                  </View>
                  {i < Math.min(auditLogs.length, 8) - 1 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14 },
  content: { padding: 16, gap: 14 },

  hero: { alignItems: "center", padding: 28, gap: 6 },
  heroAvatar: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroName: { color: "#fff", fontSize: 22, fontWeight: "800" },
  heroId: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  heroSub: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, marginTop: 4 },
  statusPillText: { fontSize: 12, fontWeight: "700" },

  quickActions: { flexDirection: "row", gap: 10 },
  qBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, gap: 5 },
  qBtnLabel: { fontSize: 12, fontWeight: "600" },

  statsStrip: { flexDirection: "row", gap: 8 },
  stripCard: { flex: 1, alignItems: "center", padding: 12, gap: 3 },
  stripVal: { fontSize: 20, fontWeight: "800" },
  stripLabel: { fontSize: 10, textAlign: "center" },

  section: { borderWidth: 1, padding: 14, gap: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  sectionCount: { fontSize: 11 },
  divider: { height: 1, marginVertical: 2 },

  enrollBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  enrollBadgeText: { fontSize: 10, fontWeight: "700" },
  faceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  faceSub: { fontSize: 12 },
  facePct: { fontSize: 13, fontWeight: "800" },
  barBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  reenrollBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  reenrollBtnText: { fontSize: 13, fontWeight: "600" },

  statusNote: { fontSize: 12, lineHeight: 18 },
  statusBtns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 10, borderWidth: 1, minWidth: 120 },
  statusActionText: { fontSize: 13, fontWeight: "600" },

  attRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  attDot: { width: 8, height: 8, borderRadius: 4 },
  attDate: { flex: 1, fontSize: 13 },
  attTime: { fontSize: 12 },
  attPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 },
  attPillText: { fontSize: 10, fontWeight: "700" },
  syncPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 },
  syncText: { fontSize: 10, fontWeight: "600" },

  auditRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  auditDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  auditInfo: { flex: 1, gap: 2 },
  auditAction: { fontSize: 13, fontWeight: "600" },
  auditValues: { fontSize: 11 },
  auditMeta: { fontSize: 11 },

  emptySection: { alignItems: "center", paddingVertical: 16 },
});
