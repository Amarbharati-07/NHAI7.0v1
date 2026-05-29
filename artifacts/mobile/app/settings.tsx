import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [autoSync, setAutoSync] = useState(false);

  const action = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(label, `"${label}" action will be available in the next release.`);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  const SettingRow = ({
    icon, label, desc, value, onPress, isToggle, toggleValue, onToggle, color, danger
  }: {
    icon: keyof typeof Ionicons.glyphMap; label: string; desc?: string;
    value?: string; onPress?: () => void; isToggle?: boolean;
    toggleValue?: boolean; onToggle?: (v: boolean) => void;
    color?: string; danger?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={isToggle ? undefined : onPress}
      activeOpacity={isToggle ? 1 : 0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: (color ?? colors.primary) + "22" }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.destructive : (color ?? colors.accent)} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
        {desc ? <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{desc}</Text> : null}
      </View>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle?.(v); }}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      ) : value ? (
        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Settings" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>

          {/* App Info */}
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
            <SettingRow icon="moon-outline" label="Dark Mode" desc="Use dark theme" isToggle toggleValue={darkMode} onToggle={setDarkMode} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="notifications-outline" label="Notifications" desc="Show push notifications" isToggle toggleValue={notifications} onToggle={setNotifications} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="sync-outline" label="Auto Sync" desc="Sync when connected" isToggle toggleValue={autoSync} onToggle={setAutoSync} />
          </View>

          {/* Data Management */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DATA MANAGEMENT</Text>
            <SettingRow icon="cloud-download-outline" label="Backup Database" desc="Save local backup" onPress={() => action("Backup Database")} color={colors.info} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="cloud-upload-outline" label="Restore Backup" desc="Restore from backup file" onPress={() => action("Restore Backup")} color={colors.warning} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="document-text-outline" label="Export CSV" desc="Export attendance data" onPress={() => action("Export CSV")} color={colors.success} />
          </View>

          {/* System */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SYSTEM</Text>
            <SettingRow icon="information-circle-outline" label="About Application" desc="Legal & licenses" onPress={() => action("About")} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="code-slash-outline" label="API Configuration" desc="Face recognition endpoint" onPress={() => action("API Configuration")} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingRow icon="bug-outline" label="Debug Logs" desc="View system logs" onPress={() => action("Debug Logs")} />
          </View>

          {/* Danger zone */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.destructive + "44", borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.destructive }]}>DANGER ZONE</Text>
            <SettingRow icon="trash-outline" label="Clear All Data" desc="Permanently delete all records" onPress={() => Alert.alert("Clear Data", "This will permanently delete all attendance records, workers, and settings. This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => action("Clear") }])} danger />
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
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 14, fontWeight: "500" },
  rowDesc: { fontSize: 12 },
  rowValue: { fontSize: 13 },
  divider: { height: 1, marginHorizontal: 14 },
});
