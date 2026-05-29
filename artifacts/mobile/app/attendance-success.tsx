import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DrawerOverlay from "@/components/DrawerOverlay";
import { useColors } from "@/hooks/useColors";

export default function AttendanceSuccessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  /* Worker identity passed through the full chain:
     attendance → liveness-detection → attendance-success */
  const { workerName, workerId, department, confidence } =
    useLocalSearchParams<{
      workerName?: string;
      workerId?: string;
      department?: string;
      confidence?: string;
    }>();

  const displayName = workerName  ?? "Worker";
  const displayId   = workerId    ?? "—";
  const displayDept = department  ?? "—";
  const displayConf = confidence  ? `${confidence}%` : "—";

  const scale   = useSharedValue(0);
  const opacity = useSharedValue(0);
  const slideY  = useSharedValue(40);

  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  useEffect(() => {
    scale.value   = withDelay(200, withSequence(withSpring(1.15, { damping: 8 }), withSpring(1, { damping: 12 })));
    opacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    slideY.value  = withDelay(400, withTiming(0,  { duration: 500 }));
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 200);
  }, []);

  const iconStyle    = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }],   opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }], opacity: opacity.value }));

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 24;
  const topPad    = Platform.OS === "web" ? 67 : insets.top;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad + 20, paddingBottom: bottomPad }]}>

        {/* ── Success icon ── */}
        <Animated.View style={[styles.iconArea, iconStyle]}>
          <View style={[styles.outerCircle, { borderColor: colors.success + "44" }]}>
            <View style={[styles.innerCircle, { borderColor: colors.success + "88" }]}>
              <View style={[styles.iconCircle, { backgroundColor: colors.success }]}>
                <Ionicons name="checkmark" size={52} color="#fff" />
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.mainContent, contentStyle]}>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Attendance Marked!</Text>
          <Text style={[styles.successSub,   { color: colors.textSecondary }]}>
            Liveness verified · Successfully recorded in system
          </Text>

          {/* ── Worker details card ── */}
          <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[styles.workerHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.workerAvatar, { backgroundColor: colors.primary }]}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
              <View style={styles.workerInfo}>
                <Text style={[styles.workerName, { color: colors.foreground }]}>{displayName}</Text>
                <Text style={[styles.workerId, { color: colors.textSecondary }]}>
                  {displayId} · {displayDept}
                </Text>
              </View>
              <View style={[styles.presentBadge, { backgroundColor: colors.successBg }]}>
                <Text style={[styles.presentText, { color: colors.success }]}>Present</Text>
              </View>
            </View>

            <View>
              {[
                { icon: "calendar-outline"  as const, label: "Date",        value: dateStr,       color: colors.accent   },
                { icon: "time-outline"      as const, label: "Time",        value: timeStr,       color: colors.accent   },
                { icon: "location-outline"  as const, label: "Site",        value: "Site-A Delhi", color: colors.warning },
                { icon: "cloud-outline"     as const, label: "Sync Status", value: "Pending sync", color: colors.warning },
              ].map((row, i, arr) => (
                <View
                  key={i}
                  style={[
                    styles.detailRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.detailIconWrap, { backgroundColor: row.color + "22" }]}>
                    <Ionicons name={row.icon} size={16} color={row.color} />
                  </View>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Biometric verified badge ── */}
          <View style={[styles.bioBadge, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
            <View style={styles.bioInfo}>
              <Text style={[styles.bioTitle, { color: colors.foreground }]}>Liveness & Face Verified</Text>
              <Text style={[styles.bioSub, { color: colors.textSecondary }]}>
                Blink · Head movement · Eye tracking passed · Confidence: {displayConf}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Action buttons ── */}
        <Animated.View style={[styles.buttons, contentStyle]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/attendance");
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="scan-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Mark Another</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/dashboard");
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="grid-outline" size={20} color={colors.accent} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Dashboard</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, alignItems: "center", gap: 20 },
  iconArea: { marginTop: 20 },
  outerCircle: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  innerCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  iconCircle:  { width: 90,  height: 90,  borderRadius: 45, alignItems: "center", justifyContent: "center" },
  mainContent: { alignSelf: "stretch", gap: 16, alignItems: "center" },
  successTitle: { fontSize: 28, fontWeight: "800", textAlign: "center" },
  successSub:   { fontSize: 14, textAlign: "center", marginTop: -8 },
  detailCard: { alignSelf: "stretch", borderWidth: 1, overflow: "hidden" },
  workerHeader: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 1 },
  workerAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  workerInfo:   { flex: 1, gap: 2 },
  workerName:   { fontSize: 16, fontWeight: "700" },
  workerId:     { fontSize: 12 },
  presentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  presentText:  { fontSize: 12, fontWeight: "700" },
  detailRow:    { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  detailIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  detailLabel:  { flex: 1, fontSize: 13 },
  detailValue:  { fontSize: 13, fontWeight: "600" },
  bioBadge:     { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, borderWidth: 1 },
  bioInfo:      { flex: 1, gap: 2 },
  bioTitle:     { fontSize: 14, fontWeight: "600" },
  bioSub:       { fontSize: 11 },
  buttons:      { alignSelf: "stretch", gap: 12, marginTop: "auto" },
  primaryBtn:   { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1 },
  secondaryBtnText: { fontSize: 16, fontWeight: "600" },
});
