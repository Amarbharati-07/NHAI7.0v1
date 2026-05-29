import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import type { SecurityEvent, AuditLog } from "@/services/adminData";
import * as adminStore from "@/services/adminStore";
import { useAdminData } from "@/contexts/AdminDataContext";
import { useColors } from "@/hooks/useColors";

type TabType = "alerts" | "audit" | "blocked" | "activity";

const SEVERITY_META = {
  high: { color: "#EF4444", icon: "warning" as const, label: "HIGH" },
  medium: { color: "#F59E0B", icon: "alert-circle-outline" as const, label: "MED" },
  low: { color: "#3B82F6", icon: "information-circle-outline" as const, label: "LOW" },
};

const EVENT_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  unauthorized_device: "phone-portrait-outline",
  failed_login: "lock-closed-outline",
  blocked_access: "ban-outline",
  password_reset: "key-outline",
  device_blocked: "phone-portrait-outline",
  suspicious_activity: "eye-outline",
};

function AlertCard({ event, onResolve }: { event: SecurityEvent; onResolve: (id: string) => void }) {
  const colors = useColors();
  const sev = SEVERITY_META[event.severity];
  return (
    <View style={[styles.alertCard, {
      backgroundColor: colors.card,
      borderColor: event.resolved ? colors.border : sev.color + "44",
      borderRadius: colors.radius,
      opacity: event.resolved ? 0.65 : 1,
    }]}>
      <View style={styles.alertHeader}>
        <View style={[styles.alertIconWrap, { backgroundColor: sev.color + "22" }]}>
          <Ionicons name={EVENT_TYPE_ICONS[event.type] ?? "warning-outline"} size={20} color={sev.color} />
        </View>
        <View style={styles.alertInfo}>
          <View style={styles.alertTitleRow}>
            <View style={[styles.sevBadge, { backgroundColor: sev.color + "22" }]}>
              <Ionicons name={sev.icon} size={10} color={sev.color} />
              <Text style={[styles.sevText, { color: sev.color }]}>{sev.label}</Text>
            </View>
            {event.resolved && (
              <View style={[styles.resolvedBadge, { backgroundColor: colors.successBg }]}>
                <Ionicons name="checkmark-circle-outline" size={10} color={colors.success} />
                <Text style={[styles.sevText, { color: colors.success }]}>RESOLVED</Text>
              </View>
            )}
          </View>
          <Text style={[styles.alertDesc, { color: colors.foreground }]}>{event.description}</Text>
          {event.operatorName && event.operatorName !== "Unknown" && (
            <Text style={[styles.alertMeta, { color: colors.textMuted }]}>Operator: {event.operatorName}</Text>
          )}
          <Text style={[styles.alertTime, { color: colors.textMuted }]}>{event.timestamp}</Text>
        </View>
      </View>
      {!event.resolved && (
        <View style={[styles.alertActions, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={[styles.resolveBtn, { backgroundColor: colors.success + "18" }]} onPress={() => onResolve(event.id)}>
            <Ionicons name="checkmark-outline" size={14} color={colors.success} />
            <Text style={[styles.resolveBtnText, { color: colors.success }]}>Mark Resolved</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.resolveBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => Alert.alert("Investigate", "Investigation details (coming soon)")}>
            <Ionicons name="search-outline" size={14} color={colors.accent} />
            <Text style={[styles.resolveBtnText, { color: colors.accent }]}>Investigate</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  const colors = useColors();
  return (
    <View style={[styles.auditRow]}>
      <View style={[styles.auditDot, { backgroundColor: colors.primary + "66" }]} />
      <View style={styles.auditContent}>
        <View style={styles.auditTitleRow}>
          <Text style={[styles.auditAction, { color: colors.foreground }]}>{log.action}</Text>
          <Text style={[styles.auditTime, { color: colors.textMuted }]}>{log.timestamp}</Text>
        </View>
        <Text style={[styles.auditDetails, { color: colors.textSecondary }]}>{log.details}</Text>
        <Text style={[styles.auditBy, { color: colors.textMuted }]}>By {log.performedBy} • {log.targetType}: {log.targetId}</Text>
      </View>
    </View>
  );
}

export default function AdminSecurityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabType>("alerts");
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { devices } = useAdminData();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [evts, logs] = await Promise.all([
        adminStore.getSecurityEvents(),
        adminStore.getAuditLogs(),
      ]);
      if (!mounted) return;
      setEvents(evts);
      setAuditLogs(logs);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const handleResolve = useCallback(async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, resolved: true } : e));
    await adminStore.resolveSecurityEvent(id);
  }, []);

  const unresolved = events.filter((e) => !e.resolved).length;
  const blockedDevices = devices.filter((d) => d.status === "blocked");

  const operatorActivity = [
    { operator: "Rajan Mehta", action: "Marked attendance for 32 workers", time: "Today 08:15 AM", color: colors.success },
    { operator: "Kavita Joshi", action: "Registered 2 new workers", time: "Today 09:30 AM", color: colors.accent },
    { operator: "Arun Patel", action: "Synced 14 records to server", time: "Today 07:48 AM", color: "#3B82F6" },
    { operator: "Rajan Mehta", action: "Login from authorized device", time: "Yesterday 08:00 AM", color: colors.success },
    { operator: "Kavita Joshi", action: "Generated daily attendance report", time: "Yesterday 06:00 PM", color: colors.accent },
  ];

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const TABS: { key: TabType; label: string; badge?: number }[] = [
    { key: "alerts", label: "Alerts", badge: unresolved },
    { key: "audit", label: "Audit Log" },
    { key: "blocked", label: "Blocked", badge: blockedDevices.length },
    { key: "activity", label: "Activity" },
  ];

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Security Center" showBack onBack={() => router.back()} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>

          {/* KPI Row */}
          <View style={styles.kpiRow}>
            {[
              { label: "Total Alerts", val: events.length, color: colors.warning, icon: "warning-outline" as const },
              { label: "Unresolved", val: unresolved, color: colors.destructive, icon: "alert-circle-outline" as const },
              { label: "Blocked Devices", val: blockedDevices.length, color: colors.destructive, icon: "ban-outline" as const },
              { label: "Audit Logs", val: auditLogs.length, color: colors.accent, icon: "document-text-outline" as const },
            ].map((k, i) => (
              <View key={i} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={[styles.kpiIcon, { backgroundColor: k.color + "22" }]}>
                  <Ionicons name={k.icon} size={16} color={k.color} />
                </View>
                <Text style={[styles.kpiVal, { color: colors.foreground }]}>{k.val}</Text>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Tab Bar */}
          <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, { backgroundColor: tab === t.key ? colors.primary : "transparent" }]}
                onPress={() => { setTab(t.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: tab === t.key ? "#fff" : colors.textSecondary }]}>{t.label}</Text>
                {t.badge ? (
                  <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? "rgba(255,255,255,0.3)" : colors.destructive }]}>
                    <Text style={styles.tabBadgeText}>{t.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {/* Alerts Tab */}
          {tab === "alerts" && (
            <>
              {unresolved > 0 && (
                <View style={[styles.alertBanner, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44", borderRadius: colors.radius }]}>
                  <Ionicons name="warning" size={16} color={colors.destructive} />
                  <Text style={[styles.bannerText, { color: colors.destructive }]}>{unresolved} unresolved security alert{unresolved > 1 ? "s" : ""} require your attention</Text>
                </View>
              )}
              {events.map((event) => (
                <AlertCard key={event.id} event={event} onResolve={handleResolve} />
              ))}
            </>
          )}

          {/* Audit Log Tab */}
          {tab === "audit" && (
            <View style={[styles.auditCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={styles.auditHeader}>
                <Ionicons name="document-text-outline" size={16} color={colors.accent} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>System Audit Log</Text>
              </View>
              <View style={[styles.auditTimeline, { borderLeftColor: colors.border }]}>
                {auditLogs.map((log) => <AuditRow key={log.id} log={log} />)}
              </View>
            </View>
          )}

          {/* Blocked Devices Tab */}
          {tab === "blocked" && (
            <>
              {blockedDevices.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Ionicons name="shield-checkmark-outline" size={40} color={colors.success} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No blocked devices</Text>
                </View>
              ) : (
                blockedDevices.map((device) => (
                  <View key={device.id} style={[styles.blockedCard, { backgroundColor: colors.card, borderColor: colors.destructive + "44", borderRadius: colors.radius }]}>
                    <View style={styles.blockedHeader}>
                      <View style={[styles.deviceIcon, { backgroundColor: colors.destructive + "18" }]}>
                        <Ionicons name={device.platform === "ios" ? "logo-apple" : "logo-android"} size={22} color={colors.destructive} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[styles.deviceModel, { color: colors.foreground }]}>{device.deviceModel}</Text>
                        <Text style={[styles.deviceImei, { color: colors.textMuted }]}>IMEI: {device.imeiNumber.slice(0, 8)}••••{device.imeiNumber.slice(-4)}</Text>
                        <Text style={[styles.deviceAttempts, { color: colors.destructive }]}>Blocked • last seen {device.lastActiveTime}</Text>
                      </View>
                      <View style={[styles.blockedBadge, { backgroundColor: colors.destructive + "22" }]}>
                        <Ionicons name="ban" size={12} color={colors.destructive} />
                        <Text style={[styles.blockedText, { color: colors.destructive }]}>BLOCKED</Text>
                      </View>
                    </View>
                    <View style={[styles.blockedActions, { borderTopColor: colors.border }]}>
                      <TouchableOpacity
                        style={[styles.resolveBtn, { backgroundColor: colors.success + "18" }]}
                        onPress={() => Alert.alert("Unblock Device", `Unblock "${device.deviceModel}"?`, [{ text: "Cancel" }, { text: "Unblock", style: "default" }])}
                      >
                        <Ionicons name="checkmark-outline" size={14} color={colors.success} />
                        <Text style={[styles.resolveBtnText, { color: colors.success }]}>Unblock</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.resolveBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => Alert.alert("Device Details", `Last active: ${device.lastActiveTime}`)}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
                        <Text style={[styles.resolveBtnText, { color: colors.accent }]}>Details</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* Operator Activity Tab */}
          {tab === "activity" && (
            <View style={[styles.auditCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={styles.auditHeader}>
                <Ionicons name="people-outline" size={16} color={colors.accent} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Operator Activity</Text>
              </View>
              {operatorActivity.map((item, i) => (
                <View key={i}>
                  <View style={styles.activityRow}>
                    <View style={[styles.actAvatar, { backgroundColor: item.color + "22" }]}>
                      <Ionicons name="person" size={15} color={item.color} />
                    </View>
                    <View style={styles.actInfo}>
                      <Text style={[styles.actName, { color: colors.foreground }]}>{item.operator}</Text>
                      <Text style={[styles.actDesc, { color: colors.textSecondary }]}>{item.action}</Text>
                      <Text style={[styles.actTime, { color: colors.textMuted }]}>{item.time}</Text>
                    </View>
                  </View>
                  {i < operatorActivity.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpiCard: { flex: 1, alignItems: "center", padding: 10, borderWidth: 1, gap: 4 },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  kpiVal: { fontSize: 18, fontWeight: "800" },
  kpiLabel: { fontSize: 10, textAlign: "center" },
  tabBar: { flexDirection: "row", padding: 4, borderRadius: 10, borderWidth: 1, gap: 2 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  tabText: { fontSize: 12, fontWeight: "600" },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: "500" },
  alertCard: { borderWidth: 1, overflow: "hidden" },
  alertHeader: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 10 },
  alertIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertInfo: { flex: 1, gap: 5 },
  alertTitleRow: { flexDirection: "row", gap: 7 },
  sevBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99 },
  resolvedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99 },
  sevText: { fontSize: 10, fontWeight: "700" },
  alertDesc: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  alertMeta: { fontSize: 12 },
  alertTime: { fontSize: 11 },
  alertActions: { flexDirection: "row", borderTopWidth: 1, padding: 8, gap: 8 },
  resolveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  resolveBtnText: { fontSize: 12, fontWeight: "600" },
  auditCard: { borderWidth: 1, overflow: "hidden" },
  auditHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  auditTimeline: { borderLeftWidth: 2, marginLeft: 20, paddingLeft: 14, paddingBottom: 8 },
  auditRow: { flexDirection: "row", marginBottom: 16, position: "relative" },
  auditDot: { width: 10, height: 10, borderRadius: 5, position: "absolute", left: -20, top: 4, marginLeft: -5 },
  auditContent: { flex: 1, gap: 3 },
  auditTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  auditAction: { fontSize: 13, fontWeight: "700" },
  auditTime: { fontSize: 11 },
  auditDetails: { fontSize: 12 },
  auditBy: { fontSize: 11 },
  emptyState: { alignItems: "center", padding: 40, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 14 },
  blockedCard: { borderWidth: 1, overflow: "hidden" },
  blockedHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  deviceIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deviceModel: { fontSize: 14, fontWeight: "700" },
  deviceImei: { fontSize: 12 },
  deviceAttempts: { fontSize: 12, fontWeight: "600" },
  blockedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  blockedText: { fontSize: 10, fontWeight: "700" },
  blockedActions: { flexDirection: "row", borderTopWidth: 1, padding: 8, gap: 8 },
  activityRow: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 10 },
  actAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  actInfo: { flex: 1, gap: 3 },
  actName: { fontSize: 13, fontWeight: "700" },
  actDesc: { fontSize: 12 },
  actTime: { fontSize: 11 },
  divider: { height: 1, marginHorizontal: 12 },
});
