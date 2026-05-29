import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import StatCard from "@/components/StatCard";
import { useAuth } from "@/contexts/AuthContext";
import { getAttendanceStats } from "@/services/database";
import { getAdminKpis, MOCK_SECURITY_EVENTS, MOCK_PLAZA_ATTENDANCE, MOCK_OPERATORS } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";

interface Stats { total: number; present: number; absent: number; pending: number }

const OPERATOR_QUICK_ACTIONS = [
  { label: "Register Worker", icon: "person-add-outline" as const, color: "#F97316", route: "/register-worker" },
  { label: "Mark Attendance", icon: "scan-outline" as const, color: "#EA580C", route: "/attendance" },
  { label: "Attendance History", icon: "calendar-outline" as const, color: "#0B7ED4", route: "/attendance-history" },
  { label: "Sync Data", icon: "cloud-upload-outline" as const, color: "#16A34A", route: "/sync-center" },
];

const ADMIN_QUICK_ACTIONS = [
  { label: "Manage Plazas", icon: "business-outline" as const, color: "#0B7ED4", route: "/admin-toll-plazas" },
  { label: "Manage Operators", icon: "people-circle-outline" as const, color: "#0B5EA8", route: "/admin-operators" },
  { label: "Allocate Device", icon: "phone-portrait-outline" as const, color: "#F97316", route: "/admin-devices" },
  { label: "Monitor Attendance", icon: "pulse-outline" as const, color: "#0D9488", route: "/admin-attendance" },
  { label: "Security Center", icon: "shield-outline" as const, color: "#DC2626", route: "/admin-security" },
  { label: "Generate Report", icon: "document-text-outline" as const, color: "#16A34A", route: "/reports" },
];

const RECENT_ACTIVITY = [
  { name: "Rajesh Kumar", action: "Attendance Marked", time: "08:32 AM", status: "present", id: "WRK001" },
  { name: "Priya Sharma", action: "Attendance Marked", time: "08:45 AM", status: "present", id: "WRK002" },
  { name: "Amit Singh", action: "Attendance Marked", time: "09:10 AM", status: "present", id: "WRK003" },
  { name: "Sunita Verma", action: "Marked Absent", time: "09:00 AM", status: "absent", id: "WRK004" },
];

function PulsingDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: anim }]} />;
}

function AdminKpiCard({ label, value, icon, color, bg, badge }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; badge?: string }) {
  const colors = useColors();
  return (
    <View style={[akStyles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      {badge ? (
        <View style={[akStyles.badge, { backgroundColor: color + "22" }]}>
          <Text style={[akStyles.badgeText, { color }]}>{badge}</Text>
        </View>
      ) : null}
      <View style={[akStyles.iconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[akStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[akStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const akStyles = StyleSheet.create({
  card: { flex: 1, minWidth: 100, padding: 14, borderWidth: 1, gap: 5, position: "relative" },
  iconWrap: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  value: { fontSize: 22, fontWeight: "800" },
  label: { fontSize: 11, fontWeight: "500" },
  badge: { position: "absolute", top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: "700" },
});

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, present: 0, absent: 0, pending: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = user?.role === "admin";
  const kpis = getAdminKpis();
  const unresolvedAlerts = MOCK_SECURITY_EVENTS.filter((e) => !e.resolved);
  const activeOps = MOCK_OPERATORS.filter((o) => o.status === "active");

  const loadStats = useCallback(async () => {
    const s = await getAttendanceStats();
    setStats(s);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const navigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  };

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title={isAdmin ? "Command Center" : "Dashboard"} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Welcome / Hero Card */}
          <View style={[styles.welcomeCard, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <View style={styles.welcomeLeft}>
              <Text style={styles.welcomeGreet}>{isAdmin ? "Admin Control" : "Welcome back,"}</Text>
              <Text style={styles.welcomeName}>{user?.name ?? "User"}</Text>
              <Text style={styles.welcomeDate}>{dateStr}</Text>
              {isAdmin && (
                <View style={styles.systemOkBadge}>
                  <PulsingDot color="#10B981" />
                  <Text style={styles.systemOkText}>All Systems Operational</Text>
                </View>
              )}
            </View>
            <View style={[styles.welcomeIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <MaterialCommunityIcons
                name={isAdmin ? "shield-crown" : "face-recognition"}
                size={40}
                color="rgba(255,255,255,0.9)"
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════ ADMIN DASHBOARD ══════════════════════════════════════════ */}
          {isAdmin ? (
            <>
              {/* KPI Row 1 */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Infrastructure Overview</Text>
              <View style={styles.kpiRow}>
                <AdminKpiCard label="Toll Plazas" value={kpis.totalPlazas} icon="business-outline" color={colors.accent} bg={colors.primary + "22"} badge={`${kpis.activePlazas} Active`} />
                <AdminKpiCard label="Operators" value={kpis.totalOperators} icon="people-circle-outline" color="#3B82F6" bg="#3B82F622" badge={`${kpis.activeOperators} Active`} />
                <AdminKpiCard label="Total Workers" value={kpis.totalWorkers} icon="person-outline" color={colors.success} bg={colors.successBg} />
              </View>

              {/* KPI Row 2 */}
              <View style={styles.kpiRow}>
                <AdminKpiCard label="Present Today" value={kpis.presentToday} icon="checkmark-circle-outline" color={colors.success} bg={colors.successBg} />
                <AdminKpiCard label="Absent Today" value={kpis.absentToday} icon="close-circle-outline" color={colors.destructive} bg={colors.destructive + "22"} />
                <AdminKpiCard label="Active Devices" value={kpis.activeDevices} icon="phone-portrait-outline" color={colors.warning} bg={colors.warningBg} />
              </View>

              {/* KPI Row 3 */}
              <View style={styles.kpiRow}>
                <AdminKpiCard label="Unauth Attempts" value={kpis.unauthorizedAttempts} icon="shield-outline" color={colors.destructive} bg={colors.destructive + "22"} badge={kpis.unauthorizedAttempts > 0 ? "Alert" : undefined} />
                <AdminKpiCard label="Pending Sync" value={kpis.pendingSync} icon="cloud-upload-outline" color={colors.warning} bg={colors.warningBg} />
                <AdminKpiCard label="System Health" value="98%" icon="pulse-outline" color={colors.success} bg={colors.successBg} />
              </View>

              {/* Quick Actions */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsScroll}>
                {ADMIN_QUICK_ACTIONS.map((a) => (
                  <TouchableOpacity
                    key={a.route}
                    style={[styles.quickActionPill, { backgroundColor: colors.card, borderColor: a.color + "55", borderRadius: colors.radius }]}
                    onPress={() => navigate(a.route)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: a.color + "22" }]}>
                      <Ionicons name={a.icon} size={22} color={a.color} />
                    </View>
                    <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Security Alerts */}
              {unresolvedAlerts.length > 0 && (
                <>
                  <View style={styles.sectionRow}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Security Alerts</Text>
                    <TouchableOpacity onPress={() => navigate("/admin-security")}>
                      <Text style={[styles.sectionLink, { color: colors.accent }]}>View All</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.destructive + "44", borderRadius: colors.radius }]}>
                    {unresolvedAlerts.slice(0, 3).map((alert, i) => (
                      <View key={alert.id}>
                        <View style={styles.alertRow}>
                          <View style={[styles.alertIconWrap, {
                            backgroundColor: alert.severity === "high" ? colors.destructive + "22" : colors.warning + "22"
                          }]}>
                            <Ionicons
                              name={alert.severity === "high" ? "warning" : "alert-circle-outline"}
                              size={18}
                              color={alert.severity === "high" ? colors.destructive : colors.warning}
                            />
                          </View>
                          <View style={styles.alertInfo}>
                            <Text style={[styles.alertDesc, { color: colors.foreground }]} numberOfLines={1}>
                              {alert.description}
                            </Text>
                            <Text style={[styles.alertTime, { color: colors.textMuted }]}>{alert.timestamp}</Text>
                          </View>
                          <View style={[styles.severityBadge, {
                            backgroundColor: alert.severity === "high" ? colors.destructive + "22" : colors.warning + "22"
                          }]}>
                            <Text style={[styles.severityText, {
                              color: alert.severity === "high" ? colors.destructive : colors.warning
                            }]}>
                              {alert.severity.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        {i < unresolvedAlerts.slice(0, 3).length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Plaza Attendance Monitor */}
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live Attendance</Text>
                <TouchableOpacity onPress={() => navigate("/admin-attendance")}>
                  <Text style={[styles.sectionLink, { color: colors.accent }]}>View All</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {MOCK_PLAZA_ATTENDANCE.map((plaza, i) => (
                  <View key={plaza.plazaId}>
                    <View style={styles.plazaRow}>
                      <View style={styles.plazaInfo}>
                        <View style={styles.plazaNameRow}>
                          <View style={[styles.plazaDot, { backgroundColor: plaza.attendancePct >= 90 ? colors.success : plaza.attendancePct >= 80 ? colors.warning : colors.destructive }]} />
                          <Text style={[styles.plazaName, { color: colors.foreground }]}>{plaza.plazaName}</Text>
                        </View>
                        <Text style={[styles.plazaSub, { color: colors.textMuted }]}>{plaza.route} • {plaza.present}/{plaza.totalWorkers} present</Text>
                      </View>
                      <View style={styles.plazaPctWrap}>
                        <Text style={[styles.plazaPct, { color: plaza.attendancePct >= 90 ? colors.success : plaza.attendancePct >= 80 ? colors.warning : colors.destructive }]}>
                          {plaza.attendancePct}%
                        </Text>
                        <View style={[styles.miniBarBg, { backgroundColor: colors.surface }]}>
                          <View style={[styles.miniBarFill, {
                            width: `${plaza.attendancePct}%` as never,
                            backgroundColor: plaza.attendancePct >= 90 ? colors.success : plaza.attendancePct >= 80 ? colors.warning : colors.destructive,
                          }]} />
                        </View>
                      </View>
                    </View>
                    {i < MOCK_PLAZA_ATTENDANCE.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                ))}
              </View>

              {/* Operator Status */}
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Operator Status</Text>
                <TouchableOpacity onPress={() => navigate("/admin-operators")}>
                  <Text style={[styles.sectionLink, { color: colors.accent }]}>Manage</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {activeOps.map((op, i) => (
                  <View key={op.id}>
                    <View style={styles.opRow}>
                      <View style={[styles.opAvatar, { backgroundColor: colors.primary + "22" }]}>
                        <Ionicons name="person" size={18} color={colors.accent} />
                      </View>
                      <View style={styles.opInfo}>
                        <Text style={[styles.opName, { color: colors.foreground }]}>{op.name}</Text>
                        <Text style={[styles.opPlaza, { color: colors.textMuted }]}>{op.plazaName}</Text>
                      </View>
                      <View style={styles.opRight}>
                        <Text style={[styles.opLogin, { color: colors.textMuted }]}>{op.lastLogin.includes("Today") ? op.lastLogin.split(", ")[1] : op.lastLogin}</Text>
                        <View style={[styles.pill, { backgroundColor: colors.successBg }]}>
                          <View style={[styles.pillDot, { backgroundColor: colors.success }]} />
                          <Text style={[styles.pillText, { color: colors.success }]}>Online</Text>
                        </View>
                      </View>
                    </View>
                    {i < activeOps.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                ))}
              </View>

              {/* Admin System Status */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>System Status</Text>
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {[
                  { label: "Database", value: "Healthy", icon: "server-outline" as const, color: colors.success },
                  { label: "Device Sync", value: "Active", icon: "sync-outline" as const, color: colors.accent },
                  { label: "Security Monitor", value: "Running", icon: "shield-checkmark-outline" as const, color: colors.success },
                  { label: "Offline Cache", value: `${kpis.pendingSync} pending`, icon: "cloud-offline-outline" as const, color: colors.warning },
                ].map((row, i, arr) => (
                  <View key={i}>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusIconWrap, { backgroundColor: row.color + "22" }]}>
                        <Ionicons name={row.icon} size={18} color={row.color} />
                      </View>
                      <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                      <Text style={[styles.statusValue, { color: row.color }]}>{row.value}</Text>
                    </View>
                    {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                ))}
              </View>
            </>
          ) : (
            /* ══════════════════════════════════════════ OPERATOR DASHBOARD (unchanged) ══════════════════════════════════════════ */
            <>
              {/* Stats */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Today's Statistics</Text>
              <View style={styles.statsRow}>
                <StatCard label="Total Workers" value={stats.total} icon="people-outline" color={colors.accent} bg={colors.primary + "22"} />
                <StatCard label="Present Today" value={stats.present} icon="checkmark-circle-outline" color={colors.success} bg={colors.successBg} subtitle="On time" />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Absent Today" value={stats.absent} icon="close-circle-outline" color={colors.destructive} bg={colors.destructive + "22"} />
                <StatCard label="Pending Sync" value={stats.pending} icon="cloud-upload-outline" color={colors.warning} bg={colors.warningBg} subtitle="Records" />
              </View>

              {/* Quick Actions */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
              <View style={styles.actionsGrid}>
                {OPERATOR_QUICK_ACTIONS.map((a) => (
                  <TouchableOpacity
                    key={a.route}
                    style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(a.route as never); }}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: a.color + "22" }]}>
                      <Ionicons name={a.icon} size={26} color={a.color} />
                    </View>
                    <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Recent Activity */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Activity</Text>
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {RECENT_ACTIVITY.map((item, i) => (
                  <View key={i}>
                    <View style={styles.activityRow}>
                      <View style={[styles.activityAvatar, { backgroundColor: colors.primary + "22" }]}>
                        <Ionicons name="person" size={18} color={colors.accent} />
                      </View>
                      <View style={styles.activityInfo}>
                        <Text style={[styles.activityName, { color: colors.foreground }]}>{item.name}</Text>
                        <Text style={[styles.activitySub, { color: colors.textSecondary }]}>{item.id} • {item.action}</Text>
                      </View>
                      <View style={styles.activityRight}>
                        <Text style={[styles.activityTime, { color: colors.textMuted }]}>{item.time}</Text>
                        <View style={[styles.pill, { backgroundColor: item.status === "present" ? colors.successBg : colors.destructive + "22" }]}>
                          <Text style={[styles.pillText, { color: item.status === "present" ? colors.success : colors.destructive }]}>
                            {item.status === "present" ? "Present" : "Absent"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {i < RECENT_ACTIVITY.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                ))}
              </View>

              {/* System Status */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>System Status</Text>
              <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {[
                  { label: "Device Status", value: "Online & Active", icon: "phone-portrait-outline" as const, color: colors.success },
                  { label: "Offline Mode", value: "Enabled", icon: "wifi-outline" as const, color: colors.accent },
                  { label: "Pending Records", value: `${stats.pending} records`, icon: "time-outline" as const, color: colors.warning },
                  { label: "Last Sync Time", value: "Not synced yet", icon: "sync-outline" as const, color: colors.textSecondary },
                ].map((row, i, arr) => (
                  <View key={i}>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusIconWrap, { backgroundColor: row.color + "22" }]}>
                        <Ionicons name={row.icon} size={18} color={row.color} />
                      </View>
                      <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                      <Text style={[styles.statusValue, { color: row.color }]}>{row.value}</Text>
                    </View>
                    {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  welcomeCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, marginBottom: 4 },
  welcomeLeft: { gap: 4, flex: 1 },
  welcomeGreet: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  welcomeName: { color: "#fff", fontSize: 22, fontWeight: "800" },
  welcomeDate: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  systemOkBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, backgroundColor: "rgba(16,185,129,0.15)", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  systemOkText: { color: "#10B981", fontSize: 11, fontWeight: "600" },
  welcomeIcon: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionLink: { fontSize: 13, fontWeight: "600" },
  kpiRow: { flexDirection: "row", gap: 10 },
  quickActionsScroll: { paddingBottom: 4, gap: 10 },
  quickActionPill: { alignItems: "center", padding: 14, borderWidth: 1, gap: 8, minWidth: 90 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  listCard: { borderWidth: 1, overflow: "hidden" },
  alertRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  alertIconWrap: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  alertInfo: { flex: 1, gap: 2 },
  alertDesc: { fontSize: 13, fontWeight: "500" },
  alertTime: { fontSize: 11 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  severityText: { fontSize: 10, fontWeight: "700" },
  plazaRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  plazaInfo: { flex: 1, gap: 3 },
  plazaNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  plazaDot: { width: 7, height: 7, borderRadius: 4 },
  plazaName: { fontSize: 13, fontWeight: "600" },
  plazaSub: { fontSize: 11 },
  plazaPctWrap: { alignItems: "flex-end", gap: 4, minWidth: 52 },
  plazaPct: { fontSize: 15, fontWeight: "800" },
  miniBarBg: { width: 52, height: 5, borderRadius: 3, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 3 },
  opRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  opAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  opInfo: { flex: 1, gap: 2 },
  opName: { fontSize: 13, fontWeight: "600" },
  opPlaza: { fontSize: 11 },
  opRight: { alignItems: "flex-end", gap: 4 },
  opLogin: { fontSize: 11 },
  statsRow: { flexDirection: "row", gap: 12 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionCard: { width: "47%", padding: 18, borderWidth: 1, gap: 10, alignItems: "center" },
  actionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  activityRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  activityAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  activityInfo: { flex: 1, gap: 2 },
  activityName: { fontSize: 14, fontWeight: "600" },
  activitySub: { fontSize: 12 },
  activityRight: { alignItems: "flex-end", gap: 4 },
  activityTime: { fontSize: 11 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "600" },
  divider: { height: 1, marginHorizontal: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  statusIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statusLabel: { flex: 1, fontSize: 14 },
  statusValue: { fontSize: 13, fontWeight: "600" },
});
