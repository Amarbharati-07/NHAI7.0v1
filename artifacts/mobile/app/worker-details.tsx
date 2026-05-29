import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { AttendanceRecord, Worker, getWorkerAttendance, getWorkerById } from "@/services/database";
import { useColors } from "@/hooks/useColors";

const FACE_POSES = ["front", "left", "right", "up", "down", "smile", "blink", "neutral"];

export default function WorkerDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const w = await getWorkerById(Number(id));
      const a = await getWorkerAttendance(Number(id));
      setWorker(w);
      setAttendance(a);
      setLoading(false);
    })();
  }, [id]);

  const presentCount = attendance.filter((a) => a.status === "present").length;
  const absentCount = attendance.filter((a) => a.status === "absent").length;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  if (loading) {
    return (
      <DrawerOverlay>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Worker Details" showBack onBack={() => router.back()} />
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        </View>
      </DrawerOverlay>
    );
  }

  if (!worker) {
    return (
      <DrawerOverlay>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Worker Details" showBack onBack={() => router.back()} />
          <View style={styles.center}>
            <Ionicons name="person-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Worker not found</Text>
          </View>
        </View>
      </DrawerOverlay>
    );
  }

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Worker Details" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>

          {/* Profile Hero */}
          <View style={[styles.heroCard, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <View style={styles.heroAvatar}>
              <Ionicons name="person" size={40} color="rgba(255,255,255,0.6)" />
            </View>
            <Text style={styles.heroName}>{worker.fullName}</Text>
            <Text style={styles.heroId}>{worker.workerId}</Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{worker.employeeType}</Text>
            </View>
          </View>

          {/* Stats Strip */}
          <View style={styles.statsStrip}>
            {[
              { label: "Present", value: presentCount, color: colors.success, bg: colors.successBg },
              { label: "Absent", value: absentCount, color: colors.destructive, bg: colors.destructive + "22" },
              { label: "Total", value: attendance.length, color: colors.accent, bg: colors.primary + "22" },
            ].map((s, i) => (
              <View key={i} style={[styles.stripCard, { backgroundColor: s.bg, borderRadius: colors.radius }]}>
                <Text style={[styles.stripVal, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.stripLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Worker Info */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={16} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Worker Information</Text>
            </View>
            {[
              { label: "Mobile", value: worker.mobile || "—", icon: "call-outline" as const },
              { label: "Department", value: worker.department, icon: "briefcase-outline" as const },
              { label: "Contractor", value: worker.contractorName || "—", icon: "business-outline" as const },
              { label: "Site Location", value: worker.siteLocation || "—", icon: "location-outline" as const },
              { label: "Employee Type", value: worker.employeeType, icon: "id-card-outline" as const },
              { label: "Registered", value: worker.createdAt?.split("T")[0] ?? "—", icon: "calendar-outline" as const },
            ].map((row, i, arr) => (
              <View key={i}>
                <View style={styles.infoRow}>
                  <Ionicons name={row.icon} size={16} color={colors.textMuted} />
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                </View>
                {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </View>

          {/* Face Images */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="scan-outline" size={16} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Registered Face Images</Text>
            </View>
            <Text style={[styles.faceSub, { color: colors.textSecondary }]}>
              Face recognition integration pending — image placeholders shown
            </Text>
            <View style={styles.faceGrid}>
              {FACE_POSES.map((pose) => (
                <View key={pose} style={[styles.faceCell, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10 }]}>
                  <Ionicons name="person-outline" size={22} color={colors.textMuted} />
                  <Text style={[styles.faceLabel, { color: colors.textMuted }]}>{pose.charAt(0).toUpperCase() + pose.slice(1)}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Attendance History */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={16} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attendance History</Text>
            </View>
            {attendance.length === 0 ? (
              <View style={styles.emptySection}>
                <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No records yet</Text>
              </View>
            ) : (
              attendance.slice(0, 10).map((rec, i) => (
                <View key={rec.id}>
                  <View style={styles.attRow}>
                    <View style={[styles.attDot, { backgroundColor: rec.status === "present" ? colors.success : colors.destructive }]} />
                    <Text style={[styles.attDate, { color: colors.foreground }]}>{rec.date}</Text>
                    <Text style={[styles.attTime, { color: colors.textSecondary }]}>{rec.time !== "00:00" ? rec.time : "—"}</Text>
                    <View style={[styles.attPill, { backgroundColor: rec.status === "present" ? colors.successBg : colors.destructive + "22" }]}>
                      <Text style={[styles.attPillText, { color: rec.status === "present" ? colors.success : colors.destructive }]}>
                        {rec.status === "present" ? "Present" : "Absent"}
                      </Text>
                    </View>
                  </View>
                  {i < Math.min(attendance.length, 10) - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  heroCard: { alignItems: "center", padding: 28, gap: 6 },
  heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroName: { color: "#fff", fontSize: 22, fontWeight: "800" },
  heroId: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  heroBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, marginTop: 4 },
  heroBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  statsStrip: { flexDirection: "row", gap: 10 },
  stripCard: { flex: 1, alignItems: "center", padding: 14, gap: 4 },
  stripVal: { fontSize: 24, fontWeight: "800" },
  stripLabel: { fontSize: 12 },
  section: { borderWidth: 1, padding: 14, gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  infoLabel: { width: 90, fontSize: 13 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: "500" },
  faceSub: { fontSize: 12 },
  faceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  faceCell: { width: "22%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, gap: 4 },
  faceLabel: { fontSize: 9, fontWeight: "500" },
  attRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  attDot: { width: 8, height: 8, borderRadius: 4 },
  attDate: { flex: 1, fontSize: 13 },
  attTime: { fontSize: 12 },
  attPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  attPillText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, marginVertical: 2 },
  emptySection: { alignItems: "center", paddingVertical: 20, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14 },
});
