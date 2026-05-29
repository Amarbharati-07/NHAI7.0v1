import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";
import {
  clearAllAppData,
  clearSyncedRecords,
  getAttendanceForCSV,
  getSyncStats,
  getWorkers,
} from "@/services/database";
import {
  getOrCreateDeviceToken,
  getDevicePlatform,
  getDefaultOsVersion,
  getRegisteredDevices,
  getAllocations,
} from "@/services/deviceService";

/* ─── Types ─── */
interface SyncStats { pending: number; synced: number; failed: number; lastSync: string | null }
interface DeviceInfo {
  deviceId: string; deviceToken: string; deviceModel: string;
  platform: string; osVersion: string; registrationDate: string;
  assignedPlaza: string; assignedOperator: string; imeiNumber: string;
}

/* ─── SettingRow ─── */
interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc?: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  color?: string;
  danger?: boolean;
  loading?: boolean;
  colors: ReturnType<typeof useColors>;
}
function SettingRow({ icon, label, desc, value, onPress, isToggle, toggleValue, onToggle, color, danger, loading, colors }: SettingRowProps) {
  const iconColor = danger ? colors.destructive : (color ?? colors.accent);
  return (
    <TouchableOpacity
      style={rw.row}
      onPress={isToggle ? undefined : onPress}
      activeOpacity={isToggle ? 1 : 0.7}
      disabled={loading}
    >
      <View style={[rw.icon, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={rw.content}>
        <Text style={[rw.label, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
        {desc ? <Text style={[rw.desc, { color: colors.textMuted }]}>{desc}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle?.(v); }}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      ) : value ? (
        <Text style={[rw.value, { color: colors.textSecondary }]}>{value}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}
const rw = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, gap: 1 },
  label: { fontSize: 14, fontWeight: "500" },
  desc: { fontSize: 12 },
  value: { fontSize: 13 },
});

/* ─── Info Row (non-tappable key-value) ─── */
function InfoRow({ label, value, colors, mono }: { label: string; value: string; colors: ReturnType<typeof useColors>; mono?: boolean }) {
  return (
    <View style={ir.row}>
      <Text style={[ir.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[ir.value, { color: colors.foreground, fontFamily: mono && Platform.OS !== "web" ? "Courier" : undefined }]} numberOfLines={1} selectable>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, gap: 16 },
  label: { fontSize: 12, fontWeight: "500", flexShrink: 0 },
  value: { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },
});

/* ─── Section wrapper ─── */
function Section({ title, children, borderColor, colors }: { title: string; children: React.ReactNode; borderColor?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[sc.section, { backgroundColor: colors.card, borderColor: borderColor ?? colors.border, borderRadius: colors.radius }]}>
      <Text style={[sc.title, { color: borderColor ?? colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  section: { borderWidth: 1, overflow: "hidden" },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
});
function Divider({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 14 }} />;
}

/* ════════════════════════════ MAIN ════════════════════════════ */

const APP_VERSION  = "1.0.0";
const BUILD_NUMBER = "2025.05.29";
const API_BASE     = "https://api.spectra-nhai.gov.in/v1";

export default function SettingsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user }       = useAuth();
  const { isDark, toggleDark } = useTheme();

  /* ── Preferences state ── */
  const [notifications, setNotificationsState] = useState(true);
  const [autoSync,      setAutoSyncState]       = useState(false);

  /* ── Operation loading ── */
  const [loadingBackup,  setLoadingBackup]  = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [loadingExport,  setLoadingExport]  = useState(false);
  const [loadingCache,   setLoadingCache]   = useState(false);
  const [loadingClear,   setLoadingClear]   = useState(false);

  /* ── Status ── */
  const [isOnline,    setIsOnline]    = useState(false);
  const [syncStats,   setSyncStats]   = useState<SyncStats>({ pending: 0, synced: 0, failed: 0, lastSync: null });
  const [deviceInfo,  setDeviceInfo]  = useState<DeviceInfo | null>(null);
  const [feedback,    setFeedback]    = useState<{ msg: string; ok: boolean } | null>(null);

  /* ── Modals ── */
  const [showAbout,     setShowAbout]     = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [showDebug,     setShowDebug]     = useState(false);
  const [debugLogs,     setDebugLogs]     = useState<string[]>([]);

  const feedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string, ok = true) => {
    setFeedback({ msg, ok });
    if (feedTimer.current) clearTimeout(feedTimer.current);
    feedTimer.current = setTimeout(() => setFeedback(null), 4000);
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
  }, []);

  /* ── Load persisted prefs ── */
  useEffect(() => {
    AsyncStorage.multiGet(["@spectra_notifications", "@spectra_auto_sync"]).then((pairs) => {
      pairs.forEach(([key, val]) => {
        if (key === "@spectra_notifications" && val !== null) setNotificationsState(val === "true");
        if (key === "@spectra_auto_sync"      && val !== null) setAutoSyncState(val === "true");
      });
    });
  }, []);

  /* ── Network monitoring ── */
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => setIsOnline(!!state.isConnected));
    NetInfo.fetch().then((state) => setIsOnline(!!state.isConnected));
    return () => unsub();
  }, []);

  /* ── Load sync stats + device info ── */
  useEffect(() => {
    getSyncStats().then(setSyncStats).catch(() => {});
    (async () => {
      try {
        const token      = await getOrCreateDeviceToken();
        const platform   = getDevicePlatform();
        const osVersion  = getDefaultOsVersion(platform);
        const devices    = await getRegisteredDevices();
        const allocs     = await getAllocations();
        const myDevice   = devices.find((d) => d.deviceToken === token);
        const myAlloc    = allocs.find((a) => a.deviceToken === token && a.status === "active");
        setDeviceInfo({
          deviceId:        myDevice?.id ?? "—",
          deviceToken:     token,
          deviceModel:     myDevice?.deviceModel ?? "Unknown",
          platform:        platform.charAt(0).toUpperCase() + platform.slice(1),
          osVersion:       myDevice?.osVersion ?? osVersion,
          registrationDate: myDevice?.registrationDate ?? "—",
          assignedPlaza:   myAlloc?.plazaName ?? myDevice?.assignedPlazaName ?? "Unassigned",
          assignedOperator: myAlloc?.operatorName ?? myDevice?.assignedOperatorName ?? "Unassigned",
          imeiNumber:      myDevice?.imeiNumber ?? "N/A",
        });
      } catch {}
    })();
  }, []);

  /* ── Persist preference ── */
  const setNotifications = async (v: boolean) => {
    setNotificationsState(v);
    await AsyncStorage.setItem("@spectra_notifications", String(v));
    toast(v ? "Notifications enabled" : "Notifications disabled");
  };
  const setAutoSync = async (v: boolean) => {
    setAutoSyncState(v);
    await AsyncStorage.setItem("@spectra_auto_sync", String(v));
    toast(v ? "Auto Sync enabled — will sync when online" : "Auto Sync disabled");
  };

  /* ── Backup ── */
  const handleBackup = async () => {
    setLoadingBackup(true);
    try {
      const [workers, attendance, devices, allocations] = await Promise.all([
        getWorkers(), getAttendanceForCSV(), getRegisteredDevices(), getAllocations(),
      ]);
      const prefs = await AsyncStorage.multiGet(["@spectra_notifications", "@spectra_auto_sync", "@spectra_theme_mode"]);
      const payload = {
        _meta: { app: "SpectraID", version: APP_VERSION, build: BUILD_NUMBER, backupDate: new Date().toISOString(), records: { workers: workers.length, attendance: attendance.length, devices: devices.length, allocations: allocations.length } },
        workers, attendance, devices, allocations,
        preferences: Object.fromEntries(prefs.map(([k, v]) => [k, v])),
      };
      const json     = JSON.stringify(payload, null, 2);
      const filename = `spectraID_backup_${new Date().toISOString().split("T")[0]}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        toast(`Backup downloaded: ${filename}`);
      } else {
        const path = `${Paths.document.uri}${filename}`;
        await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Save Backup" });
        toast(`Backup saved: ${filename}`);
      }
    } catch (e) {
      toast("Backup failed. Please try again.", false);
    }
    setLoadingBackup(false);
  };

  /* ── Restore ── */
  const handleRestore = async () => {
    setLoadingRestore(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: Platform.OS === "web" ? "*/*" : "application/json", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) { setLoadingRestore(false); return; }
      const asset = result.assets[0];
      let json: string;
      if (Platform.OS === "web") {
        const resp = await fetch(asset.uri);
        json = await resp.text();
      } else {
        json = await FileSystem.readAsStringAsync(asset.uri);
      }
      const data = JSON.parse(json);
      if (!data._meta || !data.workers || !data.attendance) throw new Error("Invalid backup file");
      const { _meta } = data;
      Alert.alert(
        "Restore Backup?",
        `Backup from ${new Date(_meta.backupDate).toLocaleDateString("en-IN")}\n\n• ${_meta.records.workers} workers\n• ${_meta.records.attendance} attendance records\n• ${_meta.records.devices} devices\n\nThis will replace all current data. Continue?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setLoadingRestore(false) },
          {
            text: "Restore", style: "destructive",
            onPress: async () => {
              try {
                await clearAllAppData();
                const db2 = await import("@/services/database").then(m => m.getDb());
                for (const w of data.workers) {
                  await db2.runAsync(
                    "INSERT OR IGNORE INTO workers (workerId,fullName,mobile,department,contractorName,employeeType,siteLocation,plazaId,operatorId,deviceToken,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    [w.workerId,w.fullName,w.mobile,w.department,w.contractorName,w.employeeType,w.siteLocation,w.plazaId??"",w.operatorId??"",w.deviceToken??"",w.status??"active",w.createdAt??new Date().toISOString()]
                  );
                }
                for (const a of data.attendance) {
                  await db2.runAsync(
                    "INSERT INTO attendance (workerId,date,time,status,syncStatus,plazaId,operatorId,createdAt) VALUES (?,?,?,?,?,?,?,?)",
                    [a.workerId,a.date,a.time,a.status??"present",a.syncStatus??"pending",a.plazaId??"",a.operatorId??"",a.createdAt??new Date().toISOString()]
                  );
                }
                if (data.devices) await AsyncStorage.setItem("@spectra_registered_devices", JSON.stringify(data.devices));
                if (data.allocations) await AsyncStorage.setItem("@spectra_allocations", JSON.stringify(data.allocations));
                getSyncStats().then(setSyncStats);
                toast(`Restored: ${_meta.records.workers} workers, ${_meta.records.attendance} records`);
              } catch { toast("Restore failed. File may be corrupted.", false); }
              setLoadingRestore(false);
            },
          },
        ]
      );
    } catch {
      toast("Could not read backup file. Ensure it is a valid SpectraID backup.", false);
      setLoadingRestore(false);
    }
  };

  /* ── Export CSV ── */
  const handleExport = async () => {
    setLoadingExport(true);
    try {
      const records = await getAttendanceForCSV();
      const header  = "Worker ID,Worker Name,Department,Contractor,Date,Time,Status,Sync Status,Plaza ID,Operator ID\n";
      const rows    = records.map((r) =>
        [r.workerIdCode ?? "", r.workerName ?? "", (r as any).department ?? "", (r as any).contractorName ?? "", r.date, r.time, r.status, r.syncStatus, r.plazaId ?? "", r.operatorId ?? ""].join(",")
      ).join("\n");
      const csv      = header + rows;
      const filename = `spectraID_attendance_${new Date().toISOString().split("T")[0]}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        toast(`Exported ${records.length} records to ${filename}`);
      } else {
        const path = `${Paths.document.uri}${filename}`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export CSV" });
        } else {
          await Share.share({ title: filename, message: csv.slice(0, 2000) });
        }
        toast(`Exported ${records.length} attendance records`);
      }
    } catch {
      toast("Export failed. Please try again.", false);
    }
    setLoadingExport(false);
  };

  /* ── Clear Cache ── */
  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "This will remove synced records from the queue and uncaptured face image entries. Attendance data and worker records will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache", onPress: async () => {
            setLoadingCache(true);
            try {
              const cleared = await clearSyncedRecords();
              getSyncStats().then(setSyncStats);
              toast(`Cache cleared — ${cleared} synced records removed`);
            } catch {
              toast("Cache clear failed.", false);
            }
            setLoadingCache(false);
          },
        },
      ]
    );
  };

  /* ── Clear All Data ── */
  const handleClearAll = () => {
    Alert.alert(
      "Clear All Data",
      "This will permanently delete ALL attendance records, workers, and device data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "I Understand, Delete", style: "destructive",
          onPress: () => Alert.alert(
            "Final Confirmation",
            "Are you absolutely sure? All data will be lost permanently.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete Everything", style: "destructive",
                onPress: async () => {
                  setLoadingClear(true);
                  try {
                    const { workers, attendance } = await clearAllAppData();
                    await AsyncStorage.multiRemove(["@spectra_registered_devices", "@spectra_allocations", "@spectra_device_token"]);
                    getSyncStats().then(setSyncStats);
                    toast(`Cleared: ${workers} workers, ${attendance} records`);
                  } catch {
                    toast("Clear failed. Please try again.", false);
                  }
                  setLoadingClear(false);
                },
              },
            ]
          ),
        },
      ]
    );
  };

  /* ── Debug Logs ── */
  const openDebug = async () => {
    try {
      const { getDb } = await import("@/services/database");
      const db = await getDb();
      const queue = await db.getAllAsync<{ id: number; recordType: string; recordId: number; status: string; createdAt: string }>(
        "SELECT * FROM sync_queue ORDER BY createdAt DESC LIMIT 50"
      );
      const settings = await db.getAllAsync<{ key: string; value: string }>("SELECT * FROM app_settings");
      const lines = [
        `=== Sync Queue (${queue.length} items) ===`,
        ...queue.map((r) => `[${r.status.toUpperCase()}] ${r.recordType}#${r.recordId} @ ${r.createdAt?.split("T")[0]}`),
        "",
        "=== App Settings ===",
        ...settings.map((s) => `${s.key}: ${s.value}`),
        "",
        `=== Platform ===`,
        `OS: ${Platform.OS}`,
        `Version: ${APP_VERSION} (${BUILD_NUMBER})`,
        `Network: ${isOnline ? "Online" : "Offline"}`,
      ];
      setDebugLogs(lines);
      setShowDebug(true);
    } catch (e) {
      toast("Could not load debug logs.", false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;
  const lastSyncFormatted = syncStats.lastSync
    ? new Date(syncStats.lastSync).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
    : "Never";

  return (
    <DrawerOverlay>
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Settings" showBack onBack={() => router.back()} />

        {/* Toast feedback */}
        {feedback && (
          <View style={[st.toast, { backgroundColor: feedback.ok ? colors.success + "EE" : colors.destructive + "EE" }]}>
            <Ionicons name={feedback.ok ? "checkmark-circle" : "alert-circle"} size={15} color="#fff" />
            <Text style={st.toastText}>{feedback.msg}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={[st.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── App Info Banner ── */}
          <View style={[st.appInfo, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[st.appLogo, { backgroundColor: colors.primary }]}>
              <Ionicons name="scan-outline" size={28} color="#fff" />
            </View>
            <View style={st.appMeta}>
              <Text style={[st.appTitle, { color: colors.foreground }]}>SpectraID</Text>
              <Text style={[st.appVersion, { color: colors.textSecondary }]}>v{APP_VERSION} · Build {BUILD_NUMBER}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                <View style={[st.pill, { backgroundColor: isOnline ? colors.success + "22" : colors.warning + "22" }]}>
                  <View style={[st.dot, { backgroundColor: isOnline ? colors.success : colors.warning }]} />
                  <Text style={[st.pillText, { color: isOnline ? colors.success : colors.warning }]}>
                    {isOnline ? "Online" : "Offline Mode"}
                  </Text>
                </View>
                {isDark && (
                  <View style={[st.pill, { backgroundColor: colors.primary + "22" }]}>
                    <Ionicons name="moon" size={10} color={colors.primary} />
                    <Text style={[st.pillText, { color: colors.primary }]}>Dark</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* ── Device Information ── */}
          {deviceInfo && (
            <Section title="DEVICE INFORMATION" colors={colors}>
              <InfoRow label="Device ID"       value={deviceInfo.deviceId}        colors={colors} />
              <Divider colors={colors} />
              <InfoRow label="Device Token"    value={deviceInfo.deviceToken}     colors={colors} mono />
              <Divider colors={colors} />
              {deviceInfo.imeiNumber !== "N/A" && (
                <>
                  <InfoRow label="IMEI Number"   value={deviceInfo.imeiNumber}      colors={colors} mono />
                  <Divider colors={colors} />
                </>
              )}
              <InfoRow label="Device Model"    value={deviceInfo.deviceModel}     colors={colors} />
              <Divider colors={colors} />
              <InfoRow label="Platform"        value={deviceInfo.platform}        colors={colors} />
              <Divider colors={colors} />
              <InfoRow label="OS Version"      value={deviceInfo.osVersion}       colors={colors} />
              <Divider colors={colors} />
              <InfoRow label="Registered"      value={deviceInfo.registrationDate} colors={colors} />
              <Divider colors={colors} />
              <InfoRow label="Assigned Plaza"  value={deviceInfo.assignedPlaza}   colors={colors} />
              <Divider colors={colors} />
              <InfoRow label="Assigned Operator" value={deviceInfo.assignedOperator} colors={colors} />
            </Section>
          )}

          {/* ── Sync Status ── */}
          <Section title="SYNC STATUS" colors={colors}>
            <View style={st.syncGrid}>
              {[
                { label: "Pending",    count: syncStats.pending, color: colors.warning },
                { label: "Synced",     count: syncStats.synced,  color: colors.success },
                { label: "Failed",     count: syncStats.failed,  color: colors.destructive },
              ].map((s) => (
                <View key={s.label} style={[st.syncCard, { backgroundColor: s.color + "12", borderColor: s.color + "33" }]}>
                  <Text style={[st.syncCount, { color: s.color }]}>{s.count}</Text>
                  <Text style={[st.syncLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={[{ paddingHorizontal: 14, paddingBottom: 12 }]}>
              <Text style={[st.lastSync, { color: colors.textMuted }]}>Last sync: {lastSyncFormatted}</Text>
            </View>
          </Section>

          {/* ── Preferences ── */}
          <Section title="PREFERENCES" colors={colors}>
            <SettingRow icon="moon-outline" label="Dark Mode" desc={isDark ? "Dark theme active" : "Light theme active"} isToggle toggleValue={isDark} onToggle={toggleDark} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="notifications-outline" label="Notifications" desc={notifications ? "Push notifications enabled" : "Notifications are off"} isToggle toggleValue={notifications} onToggle={setNotifications} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="sync-outline" label="Auto Sync" desc={autoSync ? "Syncs automatically when online" : "Manual sync only"} isToggle toggleValue={autoSync} onToggle={setAutoSync} color={colors.success} colors={colors} />
          </Section>

          {/* ── Data Management ── */}
          <Section title="DATA MANAGEMENT" colors={colors}>
            <SettingRow icon="cloud-download-outline" label="Backup Database" desc="Export all data to JSON file" onPress={handleBackup} color={colors.info} loading={loadingBackup} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="cloud-upload-outline" label="Restore Backup" desc="Restore from a backup file" onPress={handleRestore} color={colors.warning} loading={loadingRestore} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="document-text-outline" label="Export CSV" desc="Download attendance as CSV" onPress={handleExport} color={colors.success} loading={loadingExport} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="trash-bin-outline" label="Clear Cache" desc="Remove synced & temporary records" onPress={handleClearCache} color={colors.textSecondary} loading={loadingCache} colors={colors} />
          </Section>

          {/* ── System ── */}
          <Section title="SYSTEM" colors={colors}>
            <SettingRow icon="information-circle-outline" label="About Application" desc="Version, developer, legal info" onPress={() => setShowAbout(true)} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="code-slash-outline" label="API Configuration" desc={`${isOnline ? "Connected" : "Offline"} · ${API_BASE}`} onPress={() => setShowApiConfig(true)} colors={colors} />
            <Divider colors={colors} />
            <SettingRow icon="bug-outline" label="Debug Logs" desc="View sync queue & system state" onPress={openDebug} colors={colors} />
          </Section>

          {/* ── Danger Zone ── */}
          <Section title="DANGER ZONE" borderColor={colors.destructive + "66"} colors={colors}>
            <SettingRow icon="trash-outline" label="Clear All Data" desc="Permanently delete all records" onPress={handleClearAll} danger loading={loadingClear} colors={colors} />
          </Section>

        </ScrollView>
      </View>

      {/* ════ About Modal ════ */}
      <Modal visible={showAbout} animationType="slide" transparent onRequestClose={() => setShowAbout(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHead, { borderBottomColor: colors.border }]}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>About SpectraID</Text>
              <TouchableOpacity onPress={() => setShowAbout(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.sheetBody} showsVerticalScrollIndicator={false}>
              <View style={[st.aboutLogo, { backgroundColor: colors.primary }]}>
                <Ionicons name="scan-outline" size={40} color="#fff" />
              </View>
              <Text style={[st.aboutTitle, { color: colors.foreground }]}>SpectraID</Text>
              <Text style={[st.aboutSub, { color: colors.textSecondary }]}>NHAI Smart Attendance System</Text>

              {[
                { section: "APPLICATION", rows: [
                  ["Version",      APP_VERSION],
                  ["Build Number", BUILD_NUMBER],
                  ["Release Date", "29 May 2025"],
                  ["Platform",     Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)],
                ]},
                { section: "DEVICE", rows: [
                  ["Device ID",    deviceInfo?.deviceId      ?? "—"],
                  ["Model",        deviceInfo?.deviceModel    ?? "—"],
                  ["OS Version",   deviceInfo?.osVersion      ?? "—"],
                  ...(deviceInfo?.imeiNumber && deviceInfo.imeiNumber !== "N/A"
                    ? [["IMEI", deviceInfo.imeiNumber]] : []),
                  ["Network",      isOnline ? "Online" : "Offline"],
                ]},
                { section: "DEVELOPER", rows: [
                  ["Organisation",  "National Highways Authority of India"],
                  ["Division",      "IT & Technology Division"],
                  ["Contact",       "tech@nhai.gov.in"],
                  ["Website",       "www.nhai.gov.in"],
                ]},
                { section: "LEGAL", rows: [
                  ["License",   "Proprietary — NHAI Internal Use Only"],
                  ["Copyright", "© 2025 NHAI. All rights reserved."],
                  ["Privacy",   "Data stored locally on device"],
                  ["Security",  "AES-256 encrypted local database"],
                ]},
              ].map(({ section, rows }) => (
                <View key={section} style={{ marginTop: 16 }}>
                  <Text style={[st.aboutSection, { color: colors.textMuted }]}>{section}</Text>
                  <View style={[st.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
                    {rows.map(([label, value], i) => (
                      <View key={label}>
                        {i > 0 && <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 12 }} />}
                        <View style={st.aboutRow}>
                          <Text style={[st.aboutLabel, { color: colors.textMuted }]}>{label}</Text>
                          <Text style={[st.aboutValue, { color: colors.foreground }]} selectable>{value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              <View style={[st.releaseNotes, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "33", borderRadius: colors.radius }]}>
                <Text style={[st.rnTitle, { color: colors.primary }]}>Release Notes — v1.0.0</Text>
                {["Initial production release", "Facial recognition attendance system", "Offline-first SQLite database", "Device token verification for security", "Worker registration with photo capture", "Real-time sync queue management", "Multi-toll plaza support"].map((note) => (
                  <Text key={note} style={[st.rnItem, { color: colors.textSecondary }]}>• {note}</Text>
                ))}
              </View>
            </ScrollView>
            <View style={[st.sheetFoot, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAbout(false)}>
                <Text style={st.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════ API Config Modal ════ */}
      <Modal visible={showApiConfig} animationType="slide" transparent onRequestClose={() => setShowApiConfig(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHead, { borderBottomColor: colors.border }]}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>API Configuration</Text>
              <TouchableOpacity onPress={() => setShowApiConfig(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.sheetBody} showsVerticalScrollIndicator={false}>
              <View style={[st.statusBanner, { backgroundColor: isOnline ? colors.success + "15" : colors.warning + "15", borderColor: isOnline ? colors.success + "44" : colors.warning + "44", borderRadius: colors.radius }]}>
                <View style={[st.statusDot, { backgroundColor: isOnline ? colors.success : colors.warning }]} />
                <Text style={[st.statusText, { color: isOnline ? colors.success : colors.warning }]}>
                  {isOnline ? "Server Reachable" : "Offline — Using local data only"}
                </Text>
              </View>

              {[
                { label: "ENDPOINTS", rows: [
                  { k: "Face Recognition",  v: `${API_BASE}/face` },
                  { k: "Attendance Sync",   v: `${API_BASE}/sync` },
                  { k: "Worker Registry",   v: `${API_BASE}/workers` },
                  { k: "Device Auth",       v: `${API_BASE}/devices/verify` },
                ]},
                { label: "SYNC CONFIGURATION", rows: [
                  { k: "Sync Mode",        v: autoSync ? "Automatic" : "Manual" },
                  { k: "Retry Attempts",   v: "3" },
                  { k: "Timeout",          v: "30 seconds" },
                  { k: "Batch Size",       v: "50 records" },
                ]},
                { label: "STATUS", rows: [
                  { k: "Connection",  v: isOnline ? "Online" : "Offline" },
                  { k: "Pending",     v: `${syncStats.pending} records` },
                  { k: "Last Sync",   v: lastSyncFormatted },
                  { k: "Device Token", v: deviceInfo?.deviceToken ? deviceInfo.deviceToken.slice(0, 16) + "…" : "—" },
                ]},
              ].map(({ label, rows }) => (
                <View key={label} style={{ marginTop: 16 }}>
                  <Text style={[st.aboutSection, { color: colors.textMuted }]}>{label}</Text>
                  <View style={[st.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
                    {rows.map((row, i) => (
                      <View key={row.k}>
                        {i > 0 && <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 12 }} />}
                        <View style={st.aboutRow}>
                          <Text style={[st.aboutLabel, { color: colors.textMuted }]}>{row.k}</Text>
                          <Text style={[st.aboutValue, { color: colors.foreground }]} selectable numberOfLines={1}>{row.v}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={[st.sheetFoot, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowApiConfig(false)}>
                <Text style={st.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════ Debug Logs Modal ════ */}
      <Modal visible={showDebug} animationType="slide" transparent onRequestClose={() => setShowDebug(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHead, { borderBottomColor: colors.border }]}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>Debug Logs</Text>
              <TouchableOpacity onPress={() => setShowDebug(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={[st.sheetBody, { backgroundColor: colors.surface }]} showsVerticalScrollIndicator>
              {debugLogs.map((line, i) => (
                <Text
                  key={i}
                  selectable
                  style={[st.logLine, {
                    color: line.startsWith("===") ? colors.accent
                         : line.startsWith("[PENDING]") ? colors.warning
                         : line.startsWith("[SYNCED]") ? colors.success
                         : line.startsWith("[FAILED]") ? colors.destructive
                         : colors.textSecondary,
                    fontFamily: Platform.OS !== "web" ? "Courier" : undefined,
                  }]}
                >{line}</Text>
              ))}
              {debugLogs.length === 0 && (
                <Text style={[st.logLine, { color: colors.textMuted }]}>No logs available.</Text>
              )}
            </ScrollView>
            <View style={[st.sheetFoot, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[st.closeBtn, { backgroundColor: colors.muted, flex: 1 }]}
                onPress={async () => {
                  const text = debugLogs.join("\n");
                  await Share.share({ title: "SpectraID Debug Logs", message: text });
                }}
              >
                <Ionicons name="share-outline" size={16} color={colors.foreground} />
                <Text style={[st.closeBtnText, { color: colors.foreground }]}>Export</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.closeBtn, { backgroundColor: colors.primary }]} onPress={() => setShowDebug(false)}>
                <Text style={st.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </DrawerOverlay>
  );
}

/* ─── Styles ─── */
const st = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10 },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 },
  appInfo: { flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1, gap: 14 },
  appLogo: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  appMeta: { flex: 1, gap: 4 },
  appTitle: { fontSize: 18, fontWeight: "800" },
  appVersion: { fontSize: 12 },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: "600" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  syncGrid: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  syncCard: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8, borderWidth: 1, gap: 2 },
  syncCount: { fontSize: 22, fontWeight: "800" },
  syncLabel: { fontSize: 10, fontWeight: "600" },
  lastSync: { fontSize: 11, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%", overflow: "hidden" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, flexGrow: 0 },
  sheetFoot: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1 },
  closeBtn: { flex: 1, height: 46, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  closeBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  aboutLogo: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 8, marginBottom: 12 },
  aboutTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  aboutSub: { fontSize: 13, textAlign: "center", marginBottom: 4 },
  aboutSection: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  aboutCard: { borderWidth: 1, overflow: "hidden" },
  aboutRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, gap: 8 },
  aboutLabel: { fontSize: 12, fontWeight: "500" },
  aboutValue: { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },
  releaseNotes: { padding: 14, borderWidth: 1, marginTop: 16, marginBottom: 8, gap: 4 },
  rnTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  rnItem: { fontSize: 12, lineHeight: 20 },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: "600" },
  logLine: { fontSize: 11, lineHeight: 18, paddingHorizontal: 4 },
});
