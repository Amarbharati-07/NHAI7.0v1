import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAdminData } from "@/contexts/AdminDataContext";
import { getWeeklyAttendance } from "@/services/database";
import { syncService } from "@/services/SyncService";
import { exportAttendanceCSV, exportWeeklyCSV, exportWorkersCSV } from "@/services/reportService";
import { useColors } from "@/hooks/useColors";
import { getApiBase } from "@/services/apiConfig";

type ViewTab = "live" | "trends" | "records" | "alerts" | "reports";

interface AttendanceRecord {
  id: number;
  workerIdCode: string;
  date: string;
  time: string;
  status: string;
  plazaId: string;
  operatorId: string;
  createdAt: string;
}

interface ApiStats {
  present: number;
  absent: number;
  total: number;
  rate: number;
}

const MISSING_ALERTS = [
  { worker: "Sunita Verma",  id: "WRK004", plaza: "NH-48 Gurugram", days: 2, contact: "9876543213" },
  { worker: "Mohan Lal",     id: "WRK005", plaza: "NH-8 Manesar",   days: 1, contact: "9876543214" },
  { worker: "Vikram Yadav",  id: "WRK010", plaza: "NH-44 Panipat",  days: 3, contact: "9871234560" },
];

const REPORT_TYPES = [
  { label: "Daily Report",    icon: "today-outline"     as const, color: "#3B82F6", desc: "Today's full attendance summary" },
  { label: "Weekly Report",   icon: "calendar-outline"  as const, color: "#0B7ED4", desc: "Last 7 days attendance analysis" },
  { label: "Monthly Report",  icon: "bar-chart-outline" as const, color: "#10B981", desc: "Month-wise attendance breakdown" },
  { label: "Custom Range",    icon: "options-outline"   as const, color: "#F59E0B", desc: "Select custom date range" },
  { label: "Plaza-wise",      icon: "business-outline"  as const, color: "#EF4444", desc: "Individual plaza attendance" },
  { label: "Worker Report",   icon: "person-outline"    as const, color: "#64748B", desc: "Per-worker attendance history" },
];

export default function AdminAttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ViewTab>("live");
  const [refreshing, setRefreshing] = useState(false);

  const [weeklyData, setWeeklyData]       = useState<{ day: string; count: number }[]>([]);
  const [apiStats, setApiStats]           = useState<ApiStats | null>(null);
  const [apiRecords, setApiRecords]       = useState<AttendanceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [isOnline, setIsOnline]           = useState(syncService.getState().isOnline);

  const { plazas, refresh: refreshAdminData } = useAdminData();

  useEffect(() => {
    const unsub = syncService.subscribe((s) => setIsOnline(s.isOnline));
    return () => unsub();
  }, []);

  const loadLocalWeekly = useCallback(async () => {
    const data = await getWeeklyAttendance();
    setWeeklyData(data);
  }, []);

  const loadApiStats = useCallback(async () => {
    if (!isOnline) return;
    try {
      const resp = await fetch(`${getApiBase()}/attendance/stats`);
      if (resp.ok) setApiStats(await resp.json());
    } catch {}
  }, [isOnline]);

  const loadApiWeekly = useCallback(async () => {
    if (!isOnline) return;
    try {
      const resp = await fetch(`${getApiBase()}/attendance/weekly`);
      if (resp.ok) {
        const data: { day: string; count: number }[] = await resp.json();
        setWeeklyData(data);
      }
    } catch {}
  }, [isOnline]);

  const loadApiRecords = useCallback(async () => {
    if (!isOnline) return;
    setRecordsLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const resp = await fetch(`${getApiBase()}/attendance?date=${today}&limit=100`);
      if (resp.ok) {
        const data = await resp.json();
        setApiRecords(data.records ?? []);
      }
    } catch {}
    setRecordsLoading(false);
  }, [isOnline]);

  useEffect(() => {
    loadLocalWeekly();
    loadApiStats();
    loadApiWeekly();
  }, [loadLocalWeekly, loadApiStats, loadApiWeekly]);

  useEffect(() => {
    if (tab === "records") loadApiRecords();
  }, [tab, loadApiRecords]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadLocalWeekly(),
      refreshAdminData(),
      loadApiStats(),
      loadApiWeekly(),
      tab === "records" ? loadApiRecords() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [loadLocalWeekly, refreshAdminData, loadApiStats, loadApiWeekly, loadApiRecords, tab]);

  const plazaAttendance = plazas.map((p) => ({
    plazaId:       p.id,
    plazaName:     p.name,
    route:         p.route,
    totalWorkers:  p.workerCount,
    present:       p.attendanceToday,
    absent:        Math.max(0, p.workerCount - p.attendanceToday),
    late:          0,
    attendancePct: p.attendancePct,
    lastUpdate:    p.lastSync,
  }));

  const serverPresent = apiStats?.present ?? plazaAttendance.reduce((s, p) => s + p.present, 0);
  const serverAbsent  = apiStats?.absent  ?? plazaAttendance.reduce((s, p) => s + p.absent,  0);
  const totalWorkers  = plazaAttendance.reduce((s, p) => s + p.totalWorkers, 0);
  const overallPct    = apiStats?.rate ?? (totalWorkers > 0 ? Math.round((serverPresent / totalWorkers) * 100) : 0);

  const maxWeekly = Math.max(...weeklyData.map((d) => d.count), 1);
  const CHART_H = 110;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const TABS: { key: ViewTab; label: string }[] = [
    { key: "live",    label: "Live"    },
    { key: "trends",  label: "Trends"  },
    { key: "records", label: "Records" },
    { key: "alerts",  label: "Alerts"  },
    { key: "reports", label: "Reports" },
  ];

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Attendance Monitor" showBack onBack={() => router.back()} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Data source badge */}
          <View style={[styles.sourceBadge, {
            backgroundColor: isOnline ? colors.successBg : colors.warningBg,
            borderRadius: colors.radius,
          }]}>
            <Ionicons
              name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
              size={14}
              color={isOnline ? colors.success : colors.warning}
            />
            <Text style={[styles.sourceBadgeText, { color: isOnline ? colors.success : colors.warning }]}>
              {isOnline
                ? apiStats ? "Live data from server" : "Fetching server data..."
                : "Offline — showing cached data"}
            </Text>
          </View>

          {/* Overall KPI Banner */}
          <View style={[styles.heroBanner, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>Today's Overall Attendance</Text>
              <Text style={styles.heroPct}>{overallPct}%</Text>
              <View style={[styles.progressBarBg, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <View style={[styles.progressBarFill, {
                  width: `${overallPct}%` as never,
                  backgroundColor: overallPct >= 90 ? "#10B981" : overallPct >= 75 ? "#F59E0B" : "#EF4444",
                }]} />
              </View>
            </View>
            <View style={styles.heroStats}>
              {[
                { val: serverPresent, label: "Present", color: "#10B981" },
                { val: serverAbsent,  label: "Absent",  color: "#EF4444" },
                { val: totalWorkers,  label: "Total",   color: "#fff"    },
              ].map((s, i) => (
                <View key={i} style={styles.heroStatItem}>
                  <Text style={[styles.heroStatVal, { color: s.color }]}>{s.val}</Text>
                  <Text style={styles.heroStatLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScrollView}>
            <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {TABS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tab, { backgroundColor: tab === t.key ? colors.primary : "transparent" }]}
                  onPress={() => { setTab(t.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, { color: tab === t.key ? "#fff" : colors.textSecondary }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* ── LIVE TAB ── */}
          {tab === "live" && (
            <>
              <View style={styles.liveHeader}>
                <View style={styles.livePulse}>
                  <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.liveText, { color: colors.success }]}>LIVE</Text>
                </View>
                <Text style={[styles.liveTime, { color: colors.textMuted }]}>Pull to refresh</Text>
              </View>
              {plazaAttendance.map((plaza) => (
                <View key={plaza.plazaId} style={[styles.plazaCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <View style={styles.plazaHeader}>
                    <View style={[styles.plazaIconWrap, { backgroundColor: colors.primary + "22" }]}>
                      <Ionicons name="business-outline" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.plazaInfo}>
                      <Text style={[styles.plazaName, { color: colors.foreground }]}>{plaza.plazaName}</Text>
                      <Text style={[styles.plazaRoute, { color: colors.textMuted }]}>{plaza.route} · {plaza.lastUpdate}</Text>
                    </View>
                    <Text style={[styles.plazaPct, {
                      color: plaza.attendancePct >= 90 ? colors.success : plaza.attendancePct >= 75 ? colors.warning : colors.destructive,
                    }]}>{plaza.attendancePct}%</Text>
                  </View>
                  <View style={[styles.plazaProgressBg, { backgroundColor: colors.surface }]}>
                    <View style={[styles.plazaProgressFill, {
                      width: `${plaza.attendancePct}%` as never,
                      backgroundColor: plaza.attendancePct >= 90 ? colors.success : plaza.attendancePct >= 75 ? colors.warning : colors.destructive,
                    }]} />
                  </View>
                  <View style={[styles.plazaStatsRow, { borderTopColor: colors.border }]}>
                    {[
                      { val: plaza.totalWorkers, label: "Total",   color: colors.textSecondary },
                      { val: plaza.present,      label: "Present", color: colors.success },
                      { val: plaza.absent,       label: "Absent",  color: colors.destructive },
                      { val: plaza.late,         label: "Late",    color: colors.warning },
                    ].map((s, i) => (
                      <View key={i} style={[styles.plazaStat, i < 3 ? { borderRightWidth: 1, borderRightColor: colors.border } : {}]}>
                        <Text style={[styles.plazaStatVal, { color: s.color }]}>{s.val}</Text>
                        <Text style={[styles.plazaStatLabel, { color: colors.textMuted }]}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ── TRENDS TAB ── */}
          {tab === "trends" && (
            <>
              <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={styles.chartHeader}>
                  <Text style={[styles.chartTitle, { color: colors.foreground }]}>7-Day Attendance Trend</Text>
                  <View style={styles.chartBadge}>
                    <Ionicons name={isOnline ? "cloud-done-outline" : "phone-portrait-outline"} size={14} color={isOnline ? colors.success : colors.textMuted} />
                    <Text style={[styles.chartBadgeText, { color: isOnline ? colors.success : colors.textMuted }]}>
                      {isOnline ? "Server" : "Local"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.chart, { height: CHART_H + 40 }]}>
                  <View style={styles.yAxis}>
                    {[maxWeekly, Math.ceil(maxWeekly / 2), 0].map((v, i) => (
                      <Text key={i} style={[styles.yLabel, { color: colors.textMuted }]}>{v}</Text>
                    ))}
                  </View>
                  <View style={[styles.barsArea, { height: CHART_H + 40 }]}>
                    {weeklyData.map((d, i) => {
                      const barH = Math.max(4, (d.count / maxWeekly) * CHART_H);
                      return (
                        <View key={i} style={styles.barGroup}>
                          <View style={[styles.bar, { height: barH, backgroundColor: colors.primary, borderRadius: 4 }]} />
                          <Text style={[styles.barLabel, { color: colors.textMuted }]}>{d.day}</Text>
                          <Text style={[styles.barVal, { color: colors.accent }]}>{d.count}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.chartTitle, { color: colors.foreground }]}>Plaza-wise Comparison</Text>
                {plazaAttendance.map((p, i) => (
                  <View key={i} style={styles.compareRow}>
                    <Text style={[styles.compareName, { color: colors.textSecondary }]} numberOfLines={1}>{p.plazaName}</Text>
                    <View style={[styles.compareBarBg, { backgroundColor: colors.surface }]}>
                      <View style={[styles.compareBarFill, {
                        width: `${p.attendancePct}%` as never,
                        backgroundColor: p.attendancePct >= 90 ? colors.success : p.attendancePct >= 75 ? colors.warning : colors.destructive,
                      }]} />
                    </View>
                    <Text style={[styles.comparePct, {
                      color: p.attendancePct >= 90 ? colors.success : p.attendancePct >= 75 ? colors.warning : colors.destructive,
                    }]}>{p.attendancePct}%</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── RECORDS TAB ── */}
          {tab === "records" && (
            <>
              <View style={[styles.recordsHeader, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                <Ionicons name="list-outline" size={16} color={colors.accent} />
                <Text style={[styles.recordsTitle, { color: colors.foreground }]}>
                  Today's Records {apiRecords.length > 0 ? `(${apiRecords.length})` : ""}
                </Text>
                <TouchableOpacity onPress={loadApiRecords} style={styles.refreshBtn}>
                  <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {!isOnline ? (
                <View style={[styles.offlinePlaceholder, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.offlineTitle, { color: colors.foreground }]}>No Internet Connection</Text>
                  <Text style={[styles.offlineSub, { color: colors.textMuted }]}>
                    Server records are only available when online. Attendance marked offline will appear here once synced.
                  </Text>
                </View>
              ) : recordsLoading ? (
                <View style={[styles.center, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textMuted }]}>Fetching from server...</Text>
                </View>
              ) : apiRecords.length === 0 ? (
                <View style={[styles.center, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={colors.textMuted} />
                  <Text style={[styles.offlineTitle, { color: colors.foreground }]}>No records yet today</Text>
                  <Text style={[styles.offlineSub, { color: colors.textMuted }]}>
                    Attendance marked by operators will appear here after syncing.
                  </Text>
                </View>
              ) : (
                apiRecords.map((rec, i) => (
                  <View key={rec.id} style={[styles.recordCard, {
                    backgroundColor: colors.card,
                    borderColor: rec.status === "present" ? colors.success + "44" : colors.destructive + "44",
                    borderRadius: colors.radius,
                  }]}>
                    <View style={[styles.recordStatusDot, {
                      backgroundColor: rec.status === "present" ? colors.success : colors.destructive,
                    }]} />
                    <View style={styles.recordInfo}>
                      <Text style={[styles.recordWorker, { color: colors.foreground }]}>
                        {rec.workerIdCode || `Worker #${i + 1}`}
                      </Text>
                      <Text style={[styles.recordMeta, { color: colors.textMuted }]}>
                        {rec.date} · {rec.time} · Plaza: {rec.plazaId || "—"} · Op: {rec.operatorId || "—"}
                      </Text>
                    </View>
                    <View style={[styles.recordBadge, {
                      backgroundColor: rec.status === "present" ? colors.successBg : colors.destructive + "22",
                    }]}>
                      <Text style={[styles.recordBadgeText, {
                        color: rec.status === "present" ? colors.success : colors.destructive,
                      }]}>
                        {rec.status === "present" ? "Present" : "Absent"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ── ALERTS TAB ── */}
          {tab === "alerts" && (
            <>
              <View style={[styles.alertBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "44", borderRadius: colors.radius }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                <Text style={[styles.alertBannerText, { color: colors.warning }]}>
                  {MISSING_ALERTS.length} workers with missing attendance require follow-up
                </Text>
              </View>
              {MISSING_ALERTS.map((alert, i) => (
                <View key={i} style={[styles.missingCard, { backgroundColor: colors.card, borderColor: colors.warning + "44", borderRadius: colors.radius }]}>
                  <View style={styles.missingHeader}>
                    <View style={[styles.missingAvatar, { backgroundColor: colors.warning + "22" }]}>
                      <Ionicons name="person-outline" size={20} color={colors.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.missingName, { color: colors.foreground }]}>{alert.worker}</Text>
                      <Text style={[styles.missingId, { color: colors.textMuted }]}>{alert.id} · {alert.plaza}</Text>
                    </View>
                    <View style={[styles.daysBadge, { backgroundColor: colors.destructive + "22" }]}>
                      <Text style={[styles.daysText, { color: colors.destructive }]}>{alert.days}d absent</Text>
                    </View>
                  </View>
                  <View style={[styles.missingActions, { borderTopColor: colors.border }]}>
                    <TouchableOpacity style={[styles.missingBtn, { backgroundColor: "#3B82F622" }]} onPress={() => Alert.alert("Contact", `Calling ${alert.contact}`)}>
                      <Ionicons name="call-outline" size={14} color="#3B82F6" />
                      <Text style={[styles.missingBtnText, { color: "#3B82F6" }]}>Contact</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.missingBtn, { backgroundColor: colors.warning + "18" }]} onPress={() => Alert.alert("Mark Absent", `Mark ${alert.worker} as officially absent?`, [{ text: "Cancel" }, { text: "Confirm", style: "destructive" }])}>
                      <Ionicons name="close-circle-outline" size={14} color={colors.warning} />
                      <Text style={[styles.missingBtnText, { color: colors.warning }]}>Mark Absent</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.missingBtn, { backgroundColor: colors.success + "18" }]} onPress={() => Alert.alert("Acknowledge", `Alert acknowledged for ${alert.worker}`)}>
                      <Ionicons name="checkmark-outline" size={14} color={colors.success} />
                      <Text style={[styles.missingBtnText, { color: colors.success }]}>Acknowledge</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ── REPORTS TAB ── */}
          {tab === "reports" && (
            <>
              <View style={[styles.exportInfoBanner, { backgroundColor: colors.primary + "11", borderRadius: colors.radius }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                <Text style={[styles.exportInfoText, { color: colors.textSecondary }]}>
                  Reports export as CSV files with GPS coordinates, plaza, operator, and timestamp data.
                </Text>
              </View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SELECT REPORT TYPE</Text>
              <View style={styles.reportsGrid}>
                {REPORT_TYPES.map((rt) => {
                  const handleExport = async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const today = new Date().toISOString().split("T")[0];
                    let result: { success: boolean; error?: string };

                    try {
                      if (rt.label === "Daily Report") {
                        result = await exportAttendanceCSV({ dateFilter: today, label: "daily_attendance" });
                      } else if (rt.label === "Weekly Report") {
                        result = await exportWeeklyCSV();
                      } else if (rt.label === "Worker Report") {
                        result = await exportWorkersCSV();
                      } else {
                        result = await exportAttendanceCSV({ label: rt.label.toLowerCase().replace(/\s+/g, "_") });
                      }

                      if (!result.success) {
                        Alert.alert("Export Failed", result.error ?? "Could not generate report.");
                      }
                    } catch (e) {
                      Alert.alert("Export Failed", (e as Error).message);
                    }
                  };

                  return (
                    <TouchableOpacity
                      key={rt.label}
                      style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
                      onPress={handleExport}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.reportIcon, { backgroundColor: rt.color + "22" }]}>
                        <Ionicons name={rt.icon} size={24} color={rt.color} />
                      </View>
                      <Text style={[styles.reportLabel, { color: colors.foreground }]}>{rt.label}</Text>
                      <Text style={[styles.reportDesc, { color: colors.textMuted }]}>{rt.desc}</Text>
                      <View style={styles.exportRow}>
                        <View style={[styles.fmtBadge, { backgroundColor: rt.color + "22" }]}>
                          <Ionicons name="download-outline" size={10} color={rt.color} />
                          <Text style={[styles.fmtText, { color: rt.color }]}>CSV</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
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
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  sourceBadgeText: { fontSize: 12, fontWeight: "600" },
  heroBanner: { padding: 18, gap: 12 },
  heroLeft: { gap: 6 },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  heroPct: { color: "#fff", fontSize: 40, fontWeight: "900", lineHeight: 44 },
  progressBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 3 },
  heroStats: { flexDirection: "row", gap: 24 },
  heroStatItem: { alignItems: "center", gap: 2 },
  heroStatVal: { fontSize: 20, fontWeight: "800" },
  heroStatLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  tabScrollView: { flexGrow: 0 },
  tabBar: { flexDirection: "row", padding: 4, borderRadius: 10, borderWidth: 1, gap: 2 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 7, alignItems: "center" },
  tabText: { fontSize: 13, fontWeight: "600" },
  liveHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePulse: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: "700" },
  liveTime: { fontSize: 12 },
  plazaCard: { borderWidth: 1, overflow: "hidden" },
  plazaHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  plazaIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  plazaInfo: { flex: 1, gap: 3 },
  plazaName: { fontSize: 14, fontWeight: "700" },
  plazaRoute: { fontSize: 12 },
  plazaPct: { fontSize: 20, fontWeight: "800" },
  plazaProgressBg: { height: 5, marginHorizontal: 14, marginBottom: 2, borderRadius: 3, overflow: "hidden" },
  plazaProgressFill: { height: "100%", borderRadius: 3 },
  plazaStatsRow: { flexDirection: "row", borderTopWidth: 1 },
  plazaStat: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  plazaStatVal: { fontSize: 16, fontWeight: "700" },
  plazaStatLabel: { fontSize: 10 },
  chartCard: { borderWidth: 1, padding: 16, gap: 14 },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chartBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  chartBadgeText: { fontSize: 11 },
  chartTitle: { fontSize: 14, fontWeight: "700" },
  chart: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  yAxis: { justifyContent: "space-between", paddingBottom: 30, alignItems: "flex-end", width: 24 },
  yLabel: { fontSize: 10 },
  barsArea: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 6, paddingBottom: 30 },
  barGroup: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  bar: { width: "100%" },
  barLabel: { fontSize: 10 },
  barVal: { fontSize: 10, fontWeight: "700" },
  compareRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  compareName: { width: 80, fontSize: 11 },
  compareBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  compareBarFill: { height: "100%", borderRadius: 4 },
  comparePct: { width: 36, fontSize: 12, fontWeight: "700", textAlign: "right" },
  recordsHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  recordsTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  refreshBtn: { padding: 4 },
  recordCard: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, gap: 10 },
  recordStatusDot: { width: 10, height: 10, borderRadius: 5 },
  recordInfo: { flex: 1, gap: 2 },
  recordWorker: { fontSize: 13, fontWeight: "600" },
  recordMeta: { fontSize: 11 },
  recordBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  recordBadgeText: { fontSize: 11, fontWeight: "700" },
  offlinePlaceholder: { padding: 32, alignItems: "center", gap: 10 },
  offlineTitle: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  offlineSub: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  center: { padding: 32, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 13 },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1 },
  alertBannerText: { flex: 1, fontSize: 13, fontWeight: "500" },
  missingCard: { borderWidth: 1, overflow: "hidden" },
  missingHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  missingAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  missingName: { fontSize: 14, fontWeight: "700" },
  missingId: { fontSize: 12 },
  daysBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  daysText: { fontSize: 12, fontWeight: "700" },
  missingActions: { flexDirection: "row", borderTopWidth: 1, padding: 8, gap: 6 },
  missingBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  missingBtnText: { fontSize: 11, fontWeight: "600" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  reportsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  reportCard: { width: "47%", padding: 16, borderWidth: 1, gap: 8 },
  reportIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reportLabel: { fontSize: 13, fontWeight: "700" },
  reportDesc: { fontSize: 11, lineHeight: 15 },
  exportRow: { flexDirection: "row", gap: 5, marginTop: 2 },
  fmtBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  fmtText: { fontSize: 10, fontWeight: "700" },
  exportInfoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, marginBottom: 4 },
  exportInfoText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
