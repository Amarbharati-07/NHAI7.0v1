import { Ionicons } from "@expo/vector-icons";
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
import { useColors } from "@/hooks/useColors";
import type { DeviceVerifyReason } from "@/services/deviceService";

const REASON_CONFIG: Record<
  DeviceVerifyReason,
  { title: string; body: string; icon: keyof typeof Ionicons.glyphMap; severity: "critical" | "warning" }
> = {
  authorized: {
    title: "Device Authorized",
    body: "This device is authorized.",
    icon: "checkmark-circle-outline",
    severity: "warning",
  },
  no_allocation: {
    title: "No Device Allocated",
    body: "This device has not been registered or allocated to your operator account. Contact your system administrator to allocate an authorized device before performing field operations.",
    icon: "phone-portrait-outline",
    severity: "warning",
  },
  device_mismatch: {
    title: "Unauthorized Device",
    body: "This device does not match the device allocated to your operator account. Attendance operations are blocked for security. If you have a new device, contact your administrator to update the device allocation.",
    icon: "shield-half-outline",
    severity: "critical",
  },
  allocation_blocked: {
    title: "Device Blocked",
    body: "Your allocated device has been blocked by the system administrator. All attendance and registration operations are suspended. Please contact your administrator immediately.",
    icon: "ban-outline",
    severity: "critical",
  },
};

interface Props {
  reason?: DeviceVerifyReason;
  onRefresh?: () => void;
}

export default function UnauthorizedDeviceScreen({ reason = "device_mismatch", onRefresh }: Props) {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user, refreshDeviceAuth } = useAuth();
  const cfg     = REASON_CONFIG[reason];
  const isCrit  = cfg.severity === "critical";

  const topPad  = Platform.OS === "web" ? 60 : insets.top;
  const botPad  = Platform.OS === "web" ? 24 : insets.bottom + 20;

  const handleRefresh = async () => {
    await refreshDeviceAuth();
    onRefresh?.();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[st.scroll, { paddingTop: topPad + 16, paddingBottom: botPad }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Alert Banner */}
      <View style={[
        st.banner,
        {
          backgroundColor: isCrit ? colors.destructive + "18" : colors.warning + "18",
          borderColor:      isCrit ? colors.destructive + "55" : colors.warning + "55",
          borderRadius: colors.radius,
        }
      ]}>
        <View style={[
          st.iconCircle,
          { backgroundColor: isCrit ? colors.destructive + "22" : colors.warning + "22" }
        ]}>
          <Ionicons
            name={cfg.icon}
            size={48}
            color={isCrit ? colors.destructive : colors.warning}
          />
        </View>
        <Text style={[st.alertTitle, { color: isCrit ? colors.destructive : colors.warning }]}>
          {cfg.title}
        </Text>
        <Text style={[st.alertBody, { color: colors.textSecondary }]}>
          {cfg.body}
        </Text>
      </View>

      {/* Operator Info */}
      <View style={[st.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[st.infoHeading, { color: colors.foreground }]}>Operator Details</Text>
        <View style={st.infoRow}>
          <Ionicons name="person-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[st.infoLabel, { color: colors.textMuted }]}>Name</Text>
          <Text style={[st.infoValue, { color: colors.foreground }]}>{user?.name ?? "—"}</Text>
        </View>
        <View style={st.infoRow}>
          <Ionicons name="id-card-outline" size={16} color={colors.textMuted} />
          <Text style={[st.infoLabel, { color: colors.textMuted }]}>Operator ID</Text>
          <Text style={[st.infoValue, { color: colors.foreground }]}>{user?.userId ?? "—"}</Text>
        </View>
        <View style={st.infoRow}>
          <Ionicons name="business-outline" size={16} color={colors.textMuted} />
          <Text style={[st.infoLabel, { color: colors.textMuted }]}>Assigned Plaza</Text>
          <Text style={[st.infoValue, { color: colors.foreground }]}>
            {user?.plazaName ?? "Not Assigned"}
          </Text>
        </View>
        <View style={st.infoRow}>
          <Ionicons name="phone-portrait-outline" size={16} color={colors.textMuted} />
          <Text style={[st.infoLabel, { color: colors.textMuted }]}>Allocated Device</Text>
          <Text style={[st.infoValue, { color: colors.foreground }]}>
            {user?.allocatedDeviceId ?? "None"}
          </Text>
        </View>
      </View>

      {/* What to do */}
      <View style={[st.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[st.infoHeading, { color: colors.foreground }]}>What To Do</Text>
        {[
          "Contact your System Administrator immediately",
          "Do NOT attempt to bypass device security",
          "All unauthorized access attempts are logged",
          "Report this to: admin@spectra.nhai.in",
        ].map((item, i) => (
          <View key={i} style={st.bulletRow}>
            <View style={[st.bullet, { backgroundColor: isCrit ? colors.destructive : colors.warning }]} />
            <Text style={[st.bulletText, { color: colors.textSecondary }]}>{item}</Text>
          </View>
        ))}
      </View>

      {/* Security Note */}
      <View style={[st.secNote, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33", borderRadius: colors.radius }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
        <Text style={[st.secNoteText, { color: colors.primary }]}>
          This security event has been automatically logged and reported to the Admin Dashboard.
        </Text>
      </View>

      {/* Refresh Button */}
      <TouchableOpacity
        style={[st.refreshBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        onPress={handleRefresh}
        activeOpacity={0.85}
      >
        <Ionicons name="refresh-outline" size={18} color="#fff" />
        <Text style={st.refreshBtnText}>Re-verify Device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 16 },
  banner: { borderWidth: 1, padding: 24, alignItems: "center", gap: 12 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  alertTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  alertBody: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  infoCard: { borderWidth: 1, padding: 16, gap: 12 },
  infoHeading: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontSize: 13, width: 110 },
  infoValue: { fontSize: 13, fontWeight: "600", flex: 1 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 20 },
  secNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1 },
  secNoteText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  refreshBtn: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  refreshBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
