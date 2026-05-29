import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { getWeeklyAttendance, getAttendanceRecords, getWorkers } from "@/services/database";
import { exportAttendanceCSV, exportWeeklyCSV, exportWorkersCSV } from "@/services/reportService";
import { useColors } from "@/hooks/useColors";

type Period = "daily" | "weekly" | "monthly";

const { width: SCREEN_W } = Dimensions.get("window");

const MONTHLY_DATA = [
  { month: "Jan", present: 22, absent: 3 },
  { month: "Feb", present: 19, absent: 2 },
  { month: "Mar", present: 21, absent: 4 },
  { month: "Apr", present: 20, absent: 1 },
  { month: "May", present: 18, absent: 5 },
];

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod]     = useState<Period>("weekly");
  const [weeklyData, setWeeklyData] = useState<{ day: string; count: number }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const [liveStats, setLiveStats] = useState({ total: 0, present: 0, absent: 0, rate: "0%" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [data, records, workers] = await Promise.all([
        getWeeklyAttendance(),
        getAttendanceRecords(),
        getWorkers(),
      ]);
      setWeeklyData(data);
      const today = new Date().toISOString().split("T")[0];
      const todayRecs = records.filter((r) => r.date === today);
      const present = todayRecs.filter((r) => r.status === "present").length;
      const absent  = todayRecs.filter((r) => r.status === "absent").length;
      const total   = workers.length;
      const rate    = total > 0 ? `${Math.round((present / total) * 100)}%` : "0%";
      setLiveStats({ total, present, absent, rate });
      setLoading(false);
    })();
  }, []);

  const doExport = async (type: "daily" | "weekly" | "workers") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExporting(type);
    try {
      let result: { success: boolean; error?: string };
      if (type === "daily") {
        const today = new Date().toISOString().split("T")[0];
        result = await exportAttendanceCSV({ dateFilter: today, label: "daily_attendance" });
      } else if (type === "weekly") {
        result = await exportWeeklyCSV();
      } else {
        result = await exportWorkersCSV();
      }
      if (!result.success) Alert.alert("Export Failed", result.error ?? "Could not export.");
    } catch (e) {
      Alert.alert("Export Failed", (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const maxCount = Math.max(...weeklyData.map((d) => d.count), 1);
  const CHART_HEIGHT = 140;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Reports" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>

          {/* Period Tabs */}
          <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.tab, { backgroundColor: period === p ? colors.primary : "transparent" }]}
                onPress={() => setPeriod(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: period === p ? "#fff" : colors.textSecondary }]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Export Buttons */}
          <View style={styles.exportRow}>
            {[
              { key: "daily",   label: "Daily CSV",   icon: "today-outline" as const,   color: colors.accent },
              { key: "weekly",  label: "Weekly CSV",  icon: "calendar-outline" as const, color: colors.success },
              { key: "workers", label: "Workers CSV", icon: "people-outline" as const,  color: colors.warning },
            ].map((btn) => (
              <TouchableOpacity
                key={btn.key}
                style={[styles.exportBtn, { backgroundColor: btn.color + "18", borderColor: btn.color + "44" }]}
                onPress={() => doExport(btn.key as "daily" | "weekly" | "workers")}
                disabled={exporting !== null}
                activeOpacity={0.8}
              >
                {exporting === btn.key ? (
                  <ActivityIndicator size="small" color={btn.color} />
                ) : (
                  <Ionicons name="download-outline" size={14} color={btn.color} />
                )}
                <Text style={[styles.exportBtnText, { color: btn.color }]}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary Stats (live) */}
          <View style={styles.summaryRow}>
            {[
              { label: "Total Workers", value: loading ? "…" : String(liveStats.total), icon: "people-outline" as const, color: colors.accent },
              { label: "Today Present", value: loading ? "…" : String(liveStats.present), icon: "checkmark-circle-outline" as const, color: colors.success },
              { label: "Attendance Rate", value: loading ? "…" : liveStats.rate, icon: "trending-up-outline" as const, color: colors.warning },
            ].map((s, i) => (
              <View key={i} style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Ionicons name={s.icon} size={20} color={s.color} />
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Bar Chart */}
          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>
                {period === "weekly" ? "Weekly Attendance" : period === "monthly" ? "Monthly Attendance" : "Today's Hourly"}
              </Text>
              <Ionicons name="bar-chart-outline" size={18} color={colors.accent} />
            </View>

            {loading ? (
              <View style={styles.loadingChart}><ActivityIndicator color={colors.primary} /></View>
            ) : (
              <View style={styles.chart}>
                {/* Y-axis labels */}
                <View style={styles.yAxis}>
                  {[maxCount, Math.ceil(maxCount / 2), 0].map((v, i) => (
                    <Text key={i} style={[styles.yLabel, { color: colors.textMuted }]}>{v}</Text>
                  ))}
                </View>
                {/* Bars */}
                <View style={styles.barsArea}>
                  {(period === "weekly" ? weeklyData : MONTHLY_DATA.map((m) => ({ day: m.month, count: m.present }))).map((d, i) => {
                    const barH = Math.max(4, (d.count / maxCount) * CHART_HEIGHT);
                    return (
                      <View key={i} style={styles.barGroup}>
                        <View style={[styles.bar, { height: barH, backgroundColor: colors.primary, borderRadius: 4 }]} />
                        <Text style={[styles.barLabel, { color: colors.textMuted }]}>{d.day}</Text>
                        <Text style={[styles.barValue, { color: colors.accent }]}>{d.count}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Attendance Rate Donut (simplified) */}
          <View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>Attendance Breakdown</Text>
            {[
              { label: "Present", pct: 78, color: colors.success },
              { label: "Absent", pct: 15, color: colors.destructive },
              { label: "Pending", pct: 7, color: colors.warning },
            ].map((item) => (
              <View key={item.label} style={styles.rateRow}>
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                <View style={[styles.rateBarBg, { backgroundColor: colors.surface }]}>
                  <View style={[styles.rateBarFill, { width: `${item.pct}%` as never, backgroundColor: item.color }]} />
                </View>
                <Text style={[styles.ratePct, { color: item.color }]}>{item.pct}%</Text>
              </View>
            ))}
          </View>

          {/* Department-wise */}
          <View style={[styles.deptCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>By Department</Text>
            {[
              { dept: "Civil", count: 12, total: 14 },
              { dept: "Electrical", count: 8, total: 10 },
              { dept: "Plumbing", count: 5, total: 6 },
              { dept: "Security", count: 4, total: 5 },
              { dept: "Admin", count: 3, total: 3 },
            ].map((d, i) => (
              <View key={i} style={styles.deptRow}>
                <View style={[styles.deptDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.deptName, { color: colors.foreground }]}>{d.dept}</Text>
                <Text style={[styles.deptCount, { color: colors.textSecondary }]}>{d.count}/{d.total}</Text>
                <View style={[styles.deptBarBg, { backgroundColor: colors.surface }]}>
                  <View style={[styles.deptBarFill, { width: `${(d.count / d.total) * 100}%` as never, backgroundColor: colors.primary }]} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  tabs: { flexDirection: "row", padding: 4, borderRadius: 10, borderWidth: 1 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabText: { fontSize: 13, fontWeight: "600" },
  exportRow: { flexDirection: "row", gap: 8 },
  exportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  exportBtnText: { fontSize: 11, fontWeight: "700" },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: { flex: 1, alignItems: "center", padding: 12, borderWidth: 1, gap: 4 },
  summaryVal: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { fontSize: 11, textAlign: "center" },
  chartCard: { padding: 16, borderWidth: 1, gap: 12 },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chartTitle: { fontSize: 15, fontWeight: "700" },
  loadingChart: { height: 160, alignItems: "center", justifyContent: "center" },
  chart: { flexDirection: "row", gap: 8, alignItems: "flex-end", height: 180 },
  yAxis: { justifyContent: "space-between", paddingBottom: 30, alignItems: "flex-end", width: 24 },
  yLabel: { fontSize: 10 },
  barsArea: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 6, height: 180, paddingBottom: 30 },
  barGroup: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  bar: { width: "100%" },
  barLabel: { fontSize: 10 },
  barValue: { fontSize: 10, fontWeight: "700" },
  rateCard: { padding: 16, borderWidth: 1, gap: 12 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rateLabel: { width: 56, fontSize: 12 },
  rateBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  rateBarFill: { height: "100%", borderRadius: 4 },
  ratePct: { width: 36, fontSize: 12, fontWeight: "700", textAlign: "right" },
  deptCard: { padding: 16, borderWidth: 1, gap: 10 },
  deptRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  deptDot: { width: 8, height: 8, borderRadius: 4 },
  deptName: { width: 70, fontSize: 13 },
  deptCount: { width: 36, fontSize: 12 },
  deptBarBg: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  deptBarFill: { height: "100%", borderRadius: 3 },
});
