import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
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
  badge?: string;
  badgeColor?: string;
}

const sharedItems: NavItem[] = [
  { label: "Dashboard", icon: "grid-outline", route: "/dashboard" },
  { label: "Settings", icon: "settings-outline", route: "/settings" },
];

const operatorItems: NavItem[] = [
  { label: "Register Worker", icon: "person-add-outline", route: "/register-worker" },
  { label: "Mark Attendance", icon: "scan-outline", route: "/attendance" },
  { label: "Attendance History", icon: "calendar-outline", route: "/attendance-history" },
  { label: "Sync Center", icon: "cloud-upload-outline", route: "/sync-center" },
  { label: "Reports", icon: "bar-chart-outline", route: "/reports" },
];

const adminItems: NavItem[] = [
  { label: "Toll Plaza Management", icon: "business-outline", route: "/admin-toll-plazas" },
  { label: "Operator Management", icon: "people-circle-outline", route: "/admin-operators" },
  { label: "Device Allocation", icon: "phone-portrait-outline", route: "/admin-devices" },
  { label: "Worker Management", icon: "people-outline", route: "/admin-workers" },
  { label: "Attendance Monitor", icon: "pulse-outline", route: "/admin-attendance" },
  { label: "Security Center", icon: "shield-outline", route: "/admin-security", badge: "2", badgeColor: "#EF4444" },
  { label: "Reports & Analytics", icon: "bar-chart-outline", route: "/reports" },
];

function NavRow({ item, onPress }: { item: NavItem; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.navItem, { borderRadius: colors.radius }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.navIconWrap, { backgroundColor: colors.primary + "22" }]}>
        <Ionicons name={item.icon} size={20} color={colors.accent} />
      </View>
      <Text style={[styles.navLabel, { color: colors.foreground }]}>{item.label}</Text>
      {item.badge ? (
        <View style={[styles.navBadge, { backgroundColor: item.badgeColor ?? colors.destructive }]}>
          <Text style={styles.navBadgeText}>{item.badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

export default function DrawerContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { closeDrawer } = useDrawer();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

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
          <Ionicons name={isAdmin ? "shield-checkmark" : "person"} size={26} color="#fff" />
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name ?? "User"}</Text>
          <Text style={[styles.profileRole, { color: colors.textSecondary }]}>
            {isAdmin ? "System Administrator" : "Operator"}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: colors.successBg }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusText, { color: colors.success }]}>Active</Text>
          </View>
        </View>
        {isAdmin && (
          <View style={[styles.adminBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
            <Ionicons name="star" size={12} color={colors.accent} />
            <Text style={[styles.adminBadgeText, { color: colors.accent }]}>ADMIN</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 8 }]}
      >
        {/* Shared Navigation */}
        <View style={styles.navSection}>
          <Text style={[styles.navGroupLabel, { color: colors.textMuted }]}>NAVIGATION</Text>
          {sharedItems.map((item) => (
            <NavRow key={item.route} item={item} onPress={() => navigate(item.route)} />
          ))}
        </View>

        {/* Operator-only Navigation */}
        {!isAdmin && (
          <View style={styles.navSection}>
            <Text style={[styles.navGroupLabel, { color: colors.textMuted }]}>FIELD OPERATIONS</Text>
            {operatorItems.map((item) => (
              <NavRow key={item.route} item={item} onPress={() => navigate(item.route)} />
            ))}
          </View>
        )}

        {/* Admin Control Center */}
        {isAdmin && (
          <View style={[styles.navSection, styles.adminSection]}>
            <View style={[styles.adminDivider, { backgroundColor: colors.primary + "33" }]} />
            <View style={styles.adminSectionHeader}>
              <Ionicons name="shield-half-outline" size={14} color={colors.accent} />
              <Text style={[styles.navGroupLabel, { color: colors.accent }]}>ADMIN CONTROL CENTER</Text>
            </View>
            {adminItems.map((item) => (
              <NavRow key={item.route} item={item} onPress={() => navigate(item.route)} />
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={[styles.footer, { marginTop: 8 }]}>
          <View style={[styles.versionBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
            <Text style={[styles.versionText, { color: colors.textMuted }]}>SpectraID v1.0.0  •  Offline Mode</Text>
          </View>
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: colors.destructive + "44", borderRadius: colors.radius }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 18,
    marginBottom: 4,
    borderBottomWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: 15, fontWeight: "700" },
  profileRole: { fontSize: 12 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    gap: 4,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "600" },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  adminBadgeText: { fontSize: 10, fontWeight: "800" },
  scrollContent: { paddingTop: 4 },
  navSection: { paddingHorizontal: 12, paddingTop: 4, gap: 1 },
  adminSection: { paddingTop: 0 },
  adminDivider: { height: 1, marginHorizontal: 4, marginVertical: 10 },
  adminSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, marginBottom: 2 },
  navGroupLabel: { fontSize: 10, fontWeight: "700", paddingHorizontal: 4, paddingBottom: 4, letterSpacing: 0.5 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    gap: 11,
  },
  navIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { flex: 1, fontSize: 13, fontWeight: "500" },
  navBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  navBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  footer: { paddingHorizontal: 14, gap: 10, paddingTop: 4 },
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
    paddingVertical: 12,
    borderWidth: 1,
  },
  logoutText: { fontSize: 14, fontWeight: "600" },
});
