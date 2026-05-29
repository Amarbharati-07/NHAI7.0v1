import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { useColors } from "@/hooks/useColors";

/* ── Module-level row component — never recreated inside render ── */
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
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}

function SettingRow({
  icon, label, desc, value, onPress,
  isToggle, toggleValue, onToggle,
  color, danger, colors,
}: SettingRowProps) {
  const iconColor = danger ? colors.destructive : (color ?? colors.accent);
  return (
    <TouchableOpacity
      style={rowStyles.row}
      onPress={isToggle ? undefined : onPress}
      activeOpacity={isToggle ? 1 : 0.7}
    >
      <View style={[rowStyles.icon, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={rowStyles.content}>
        <Text style={[rowStyles.label, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
        {desc ? <Text style={[rowStyles.desc, { color: colors.textMuted }]}>{desc}</Text> : null}
      </View>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle?.(v); }}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      ) : value ? (
        <Text style={[rowStyles.value, { color: colors.textSecondary }]}>{value}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, gap: 1 },
  label: { fontSize: 14, fontWeight: "500" },
  desc: { fontSize: 12 },
  value: { fontSize: 13 },
});

/* ─────────────────────────────────────────────────────────── */

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoSync, setAutoSync] = useState(false);

  const action = useCallback((label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(label, `"${label}" will be available in the next release.`);
  }, []);

  const onBackup    = useCallback(() => action("Backup Database"),  [action]);
  const onRestore   = useCallback(() => action("Restore Backup"),   [action]);
  const onExport    = useCallback(() => action("Export CSV"),       [action]);
  const onAbout     = useCallback(() => action("About"),            [action]);
  const onApiConfig = useCallback(() => action("API Configuration"), [action]);
  const onDebug     = useCallback(() => action("Debug Logs"),       [action]);

  const onClearData = useCallback(() => {
    Alert.alert(
      "Clear All Data",
      "This will permanently delete all attendance records, workers, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => action("Clear") },
      ]
    );
  }, [action]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Settings" showBack onBack={() => router.back()} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* App info */}
          <View style={[styles.appInfo, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[styles.appLogo, { backgroundColor: colors.primary }]}>
              <Ionicons name="scan-outline" size={28} color="#fff" />
            </View>
            <View style={styles.appMeta}>
              <Text style={[styles.appTitle, { color: colors.foreground }]}>SpectraID</Text>
              <Text style={[styles.appVersion, { color: colors.textSecondary }]}>Version 1.0.0 • Build 2025.05</Text>
              <View style={[styles.pill, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.pillText, { color: colors.accent }]}>Offline Mode Active</Text>
              </View>
            </View>
          </View>

          {/* Preferences */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PREFERENCES</Text>
            <SettingRow icon="moon-outline" label="Dark Mode" desc="Use dark theme" isToggle toggleValue={darkMode} onToggle={setDarkMode} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="notifications-outline" label="Notifications" desc="Show push notifications" isToggle toggleValue={notifications} onToggle={setNotifications} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="sync-outline" label="Auto Sync" desc="Sync when connected" isToggle toggleValue={autoSync} onToggle={setAutoSync} colors={colors} />
          </View>

          {/* Data management */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DATA MANAGEMENT</Text>
            <SettingRow icon="cloud-download-outline" label="Backup Database" desc="Save local backup" onPress={onBackup} color={colors.info} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="cloud-upload-outline" label="Restore Backup" desc="Restore from backup file" onPress={onRestore} color={colors.warning} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="document-text-outline" label="Export CSV" desc="Export attendance data" onPress={onExport} color={colors.success} colors={colors} />
          </View>

          {/* System */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SYSTEM</Text>
            <SettingRow icon="information-circle-outline" label="About Application" desc="Legal & licenses" onPress={onAbout} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="code-slash-outline" label="API Configuration" desc="Face recognition endpoint" onPress={onApiConfig} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="bug-outline" label="Debug Logs" desc="View system logs" onPress={onDebug} colors={colors} />
          </View>

          {/* Danger zone */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.destructive + "44", borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.destructive }]}>DANGER ZONE</Text>
            <SettingRow icon="trash-outline" label="Clear All Data" desc="Permanently delete all records" onPress={onClearData} danger colors={colors} />
          </View>
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  appInfo: { flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1, gap: 14 },
  appLogo: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  appMeta: { flex: 1, gap: 4 },
  appTitle: { fontSize: 18, fontWeight: "800" },
  appVersion: { fontSize: 12 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: "600" },
  section: { borderWidth: 1, overflow: "hidden" },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  divider: { height: 1, marginHorizontal: 14 },
});
