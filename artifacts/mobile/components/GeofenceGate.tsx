import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { formatDistance } from "@/services/locationService";
import { friendlyGeofenceMessage } from "@/services/userMessages";

interface Props {
  plazaName?: string;
  distanceMeters?: number | null;
  radiusMeters?: number | null;
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export default function GeofenceGate({
  plazaName,
  distanceMeters,
  radiusMeters,
  message,
  onRetry,
  onBack,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 20;
  const isGpsMissing = Boolean(message?.startsWith("Plaza GPS coordinates not configured"));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.banner, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "55", borderRadius: colors.radius }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.destructive + "22" }]}>
          <Ionicons name="location-outline" size={42} color={colors.destructive} />
        </View>
        <Text style={[styles.title, { color: colors.destructive }]}>
          {isGpsMissing ? "Plaza coordinates not configured" : "Plaza Geofence Locked"}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {message ?? friendlyGeofenceMessage()}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.heading, { color: colors.foreground }]}>Location Status</Text>
        <Row label="Plaza" value={plazaName ?? "—"} colors={colors} />
        <Row label="Distance" value={distanceMeters == null ? "Unavailable" : formatDistance(distanceMeters)} colors={colors} />
        <Row label="Required Radius" value={radiusMeters == null ? "Unavailable" : formatDistance(radiusMeters)} colors={colors} />
      </View>

      <View style={[styles.note, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33", borderRadius: colors.radius }]}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={[styles.noteText, { color: colors.primary }]}>
          GPS validation works offline using the plaza coordinates cached on this device.
        </Text>
      </View>

      <View style={styles.actions}>
        {onRetry ? (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]} onPress={onRetry} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Check Again</Text>
          </TouchableOpacity>
        ) : null}
        {onBack ? (
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: colors.radius }]} onPress={onBack} activeOpacity={0.85}>
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Go Back</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 16 },
  banner: { borderWidth: 1, padding: 24, alignItems: "center", gap: 12 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  card: { borderWidth: 1, padding: 16, gap: 12 },
  heading: { fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, fontWeight: "700", flex: 1, textAlign: "right" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  actions: { gap: 12 },
  primaryBtn: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: { height: 52, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: "700" },
});
