import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import StatCard from "@/components/StatCard";
import { useAuth } from "@/contexts/AuthContext";
import { getAttendanceStats } from "@/services/database";
import { useColors } from "@/hooks/useColors";

interface Stats { total: number; present: number; absent: number; pending: number }

const QUICK_ACTIONS = [
  { label: "Register Worker", icon: "person-add-outline" as const, color: "#7C3AED", route: "/register-worker" },
  { label: "Mark Attendance", icon: "scan-outline" as const, color: "#3B82F6", route: "/attendance" },
  { label: "Attendance History", icon: "calendar-outline" as const, color: "#10B981", route: "/attendance-history" },
  { label: "Sync Data", icon: "cloud-upload-outline" as const, color: "#F59E0B", route: "/sync-center" },
];

const RECENT_ACTIVITY = [
  { name: "Rajesh Kumar", action: "Attendance Marked", time: "08:32 AM", status: "present", id: "WRK001" },
  { name: "Priya Sharma", action: "Attendance Marked", time: "08:45 AM", status: "present", id: "WRK002" },
  { name: "Amit Singh", action: "Attendance Marked", time: "09:10 AM", status: "present", id: "WRK003" },
  { name: "Sunita Verma", action: "Marked Absent", time: "09:00 AM", status: "absent", id: "WRK004" },
];

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, present: 0, absent: 0, pending: 0 });
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Dashboard" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Welcome Card */}
          <View style={[styles.welcomeCard, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <View style={styles.welcomeLeft}>
              <Text style={styles.welcomeGreet}>Welcome back,</Text>
              <Text style={styles.welcomeName}>{user?.name ?? "User"}</Text>
              <Text style={styles.welcomeDate}>{dateStr}</Text>
            </View>
            <View style={[styles.welcomeIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <MaterialCommunityIcons name="face-recognition" size={40} color="rgba(255,255,255,0.9)" />
            </View>
          </View>

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
            {QUICK_ACTIONS.map((a) => (
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
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  welcomeCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, marginBottom: 4 },
  welcomeLeft: { gap: 4 },
  welcomeGreet: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  welcomeName: { color: "#fff", fontSize: 22, fontWeight: "800" },
  welcomeDate: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  welcomeIcon: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionCard: { width: "47%", padding: 18, borderWidth: 1, gap: 10, alignItems: "center" },
  actionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  listCard: { borderWidth: 1, overflow: "hidden" },
  activityRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  activityAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  activityInfo: { flex: 1, gap: 2 },
  activityName: { fontSize: 14, fontWeight: "600" },
  activitySub: { fontSize: 12 },
  activityRight: { alignItems: "flex-end", gap: 4 },
  activityTime: { fontSize: 11 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: "600" },
  divider: { height: 1, marginHorizontal: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  statusIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statusLabel: { flex: 1, fontSize: 14 },
  statusValue: { fontSize: 13, fontWeight: "600" },
});
