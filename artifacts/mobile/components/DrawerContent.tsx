import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useDrawer } from "@/contexts/DrawerContext";
import { useColors } from "@/hooks/useColors";

interface NavItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: "grid-outline", route: "/dashboard" },
  { label: "Register Worker", icon: "person-add-outline", route: "/register-worker" },
  { label: "Mark Attendance", icon: "scan-outline", route: "/attendance" },
  { label: "Attendance History", icon: "calendar-outline", route: "/attendance-history" },
  { label: "Sync Center", icon: "cloud-upload-outline", route: "/sync-center" },
  { label: "Reports", icon: "bar-chart-outline", route: "/reports" },
  { label: "Settings", icon: "settings-outline", route: "/settings" },
];

export default function DrawerContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { closeDrawer } = useDrawer();
  const { user, logout } = useAuth();

  const navigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeDrawer();
    router.push(route as never);
  };

  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    closeDrawer();
    await logout();
    router.replace("/login");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.header, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[styles.profileSection, { borderBottomColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="person" size={28} color="#fff" />
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name ?? "User"}</Text>
          <Text style={[styles.profileRole, { color: colors.textSecondary }]}>{user?.role === "admin" ? "System Administrator" : "Operator"}</Text>
          <View style={[styles.statusBadge, { backgroundColor: colors.successBg }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusText, { color: colors.success }]}>Active</Text>
          </View>
        </View>
      </View>

      {/* Navigation Items */}
      <View style={styles.navSection}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.navItem, { borderRadius: colors.radius }]}
            onPress={() => navigate(item.route)}
            activeOpacity={0.7}
          >
            <View style={[styles.navIconWrap, { backgroundColor: colors.primary + "22" }]}>
              <Ionicons name={item.icon} size={20} color={colors.accent} />
            </View>
            <Text style={[styles.navLabel, { color: colors.foreground }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.versionBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
          <Text style={[styles.versionText, { color: colors.textMuted }]}>SpectraID v1.0.0  •  Offline Mode</Text>
        </View>
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.destructive + "44", borderRadius: colors.radius }]} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: 8,
    borderBottomWidth: 1,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 16, fontWeight: "700" },
  profileRole: { fontSize: 12 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    gap: 4,
    marginTop: 2,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  navSection: { flex: 1, paddingHorizontal: 12, paddingTop: 8, gap: 2 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  navIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { flex: 1, fontSize: 14, fontWeight: "500" },
  footer: { paddingHorizontal: 16, gap: 12, paddingTop: 8 },
  versionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  versionText: { fontSize: 11 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderWidth: 1,
  },
  logoutText: { fontSize: 14, fontWeight: "600" },
});
