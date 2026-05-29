import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import UnauthorizedDeviceScreen from "@/components/UnauthorizedDeviceScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

/** Simulated face recognition result — replace body with real SDK call. */
const MOCK_WORKERS = [
  { id: "WRK001", name: "Rajesh Kumar",    department: "Civil",      confidence: 97 },
  { id: "WRK002", name: "Anita Singh",     department: "Electrical", confidence: 95 },
  { id: "WRK003", name: "Mohammed Farooq", department: "Plumbing",   confidence: 98 },
];

type ScanPhase = "idle" | "scanning" | "identified" | "no_match";

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [phase, setPhase]   = useState<ScanPhase>("idle");
  const [matched, setMatched] = useState<typeof MOCK_WORKERS[0] | null>(null);
  const scanLine = useSharedValue(0);
  const idCardScale = useSharedValue(0.85);
  const idCardOpac  = useSharedValue(0);

  /* Scan-line animation */
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLine.value }],
  }));

  /* ID card pop-in */
  const idCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: idCardScale.value }],
    opacity: idCardOpac.value,
  }));

  useEffect(() => {
    if (phase === "scanning") {
      scanLine.value = withRepeat(
        withSequence(withTiming(200, { duration: 1200 }), withTiming(0, { duration: 0 })),
        -1
      );
    } else {
      scanLine.value = withTiming(0);
    }
  }, [phase]);

  const startScan = () => {
    if (phase !== "idle" && phase !== "no_match") return;
    setMatched(null);
    setPhase("scanning");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    /* Step 1 – simulate face recognition (2 s) */
    setTimeout(() => {
      const worker = MOCK_WORKERS[Math.floor(Math.random() * MOCK_WORKERS.length)];
      setMatched(worker);
      setPhase("identified");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      /* ID card pop-in animation */
      idCardScale.value = withTiming(1, { duration: 350 });
      idCardOpac.value  = withTiming(1, { duration: 350 });

      /* Step 2 – auto-navigate to liveness after showing the match (1.5 s) */
      setTimeout(() => {
        idCardScale.value = withTiming(0.9, { duration: 200 });
        idCardOpac.value  = withTiming(0,   { duration: 200 });
        setTimeout(() => {
          setPhase("idle");
          idCardScale.value = 0.85;
          idCardOpac.value  = 0;
          router.push({
            pathname: "/liveness-detection",
            params: {
              workerName: worker.name,
              workerId: worker.id,
              department: worker.department,
              confidence: String(worker.confidence),
            },
          } as never);
        }, 220);
      }, 1600);
    }, 2200);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;
  const isOperator = user?.role === "operator";
  const deviceBlocked = isOperator && user?.isDeviceAuthorized === false;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Mark Attendance" showBack onBack={() => router.back()} />

        {/* Device authorization gate */}
        {deviceBlocked && (
          <UnauthorizedDeviceScreen reason={user?.deviceVerifyReason} />
        )}

        {/* Operator plaza context banner */}
        {!deviceBlocked && isOperator && user?.plazaName && (
          <View style={[styles.contextBanner, { backgroundColor: colors.primary + "12", borderBottomColor: colors.primary + "22" }]}>
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text style={[styles.contextText, { color: colors.primary }]}>
              {user.plazaName} · {user.userId}
            </Text>
            <View style={[styles.authBadge, { backgroundColor: colors.success + "22" }]}>
              <Ionicons name="shield-checkmark-outline" size={11} color={colors.success} />
              <Text style={[styles.authBadgeText, { color: colors.success }]}>Authorized</Text>
            </View>
          </View>
        )}

        {!deviceBlocked && (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
          >
          {/* ── Camera viewfinder ── */}
          <View style={[styles.cameraWrap, { borderColor: colors.primary + "66", backgroundColor: colors.card }]}>
            <View style={[styles.cameraView, { backgroundColor: colors.header }]}>
              {/* Corner brackets */}
              {([styles.bTL, styles.bTR, styles.bBL, styles.bBR] as const).map((pos, i) => (
                <View key={i} style={[styles.bracket, pos, {
                  borderColor: phase === "identified" ? colors.success : colors.primary,
                }]} />
              ))}

              <View style={styles.cameraCenter}>
                {phase === "scanning" && (
                  <>
                    <Animated.View style={[styles.scanLine, { backgroundColor: colors.primary }, scanLineStyle]} />
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
                    <Text style={[styles.scanHint, { color: colors.accent }]}>Recognising face…</Text>
                  </>
                )}

                {phase === "identified" && matched && (
                  <Animated.View style={[styles.matchCard, { backgroundColor: colors.card, borderColor: colors.success + "66" }, idCardStyle]}>
                    <View style={[styles.matchAvatar, { backgroundColor: colors.success + "22" }]}>
                      <Ionicons name="person-circle" size={42} color={colors.success} />
                    </View>
                    <View style={styles.matchInfo}>
                      <Text style={[styles.matchName, { color: colors.foreground }]}>{matched.name}</Text>
                      <Text style={[styles.matchMeta, { color: colors.textSecondary }]}>
                        {matched.id} · {matched.department}
                      </Text>
                      <View style={styles.matchBadgeRow}>
                        <View style={[styles.matchBadge, { backgroundColor: colors.successBg }]}>
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                          <Text style={[styles.matchBadgeText, { color: colors.success }]}>
                            Worker identified
                          </Text>
                        </View>
                        <View style={[styles.matchBadge, { backgroundColor: colors.primary + "22" }]}>
                          <Text style={[styles.matchBadgeText, { color: colors.accent }]}>
                            {matched.confidence}% match
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.livenessNext, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                      <ActivityIndicator size="small" color={colors.accent} />
                      <Text style={[styles.livenessNextText, { color: colors.accent }]}>
                        Starting liveness check…
                      </Text>
                    </View>
                  </Animated.View>
                )}

                {(phase === "idle" || phase === "no_match") && (
                  <>
                    <MaterialCommunityIcons
                      name="face-recognition"
                      size={64}
                      color={colors.primary + "88"}
                    />
                    <Text style={[styles.scanHint, { color: colors.textSecondary }]}>
                      Position face in frame
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Placeholder notice */}
            <View style={[styles.noticeBanner, { backgroundColor: colors.primary + "0f", borderColor: colors.primary + "2a" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                Face recognition model integration point — currently simulated
              </Text>
            </View>
          </View>

          {/* ── Attendance flow diagram ── */}
          <View style={[styles.flowCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.flowTitle, { color: colors.foreground }]}>Attendance Verification Flow</Text>
            <View style={styles.flowRow}>
              {[
                { icon: "camera-outline",          label: "Face Scan",      color: colors.accent },
                { icon: "person-circle-outline",   label: "Identify",       color: colors.primary },
                { icon: "eye-outline",             label: "Liveness",       color: colors.warning },
                { icon: "checkmark-circle-outline", label: "Mark Present",  color: colors.success },
              ].map((step, i, arr) => (
                <React.Fragment key={step.label}>
                  <View style={styles.flowStep}>
                    <View style={[styles.flowIcon, { backgroundColor: step.color + "22" }]}>
                      <Ionicons name={step.icon as keyof typeof Ionicons.glyphMap} size={18} color={step.color} />
                    </View>
                    <Text style={[styles.flowLabel, { color: colors.textSecondary }]}>{step.label}</Text>
                  </View>
                  {i < arr.length - 1 && (
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={styles.flowArrow} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* ── Instructions ── */}
          <View style={[styles.instrCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.instrTitle, { color: colors.foreground }]}>Instructions</Text>
            {[
              "Ensure face is well-lit and visible",
              "Remove glasses or face coverings",
              "Look directly at the camera",
              "After recognition, complete the liveness check",
            ].map((inst, i) => (
              <View key={i} style={styles.instrRow}>
                <View style={[styles.instrDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.instrText, { color: colors.textSecondary }]}>{inst}</Text>
              </View>
            ))}
          </View>

          {/* ── Status chips ── */}
          <View style={styles.statusRow}>
            {[
              { icon: "wifi-outline"            as const, label: "Offline",  value: "Active",   color: colors.success },
              { icon: "phone-portrait-outline"  as const, label: "Camera",   value: "Ready",    color: colors.accent  },
              { icon: "shield-checkmark-outline" as const, label: "Liveness", value: "Enabled",  color: colors.warning },
            ].map((s) => (
              <View key={s.label} style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Ionicons name={s.icon} size={20} color={s.color} />
                <Text style={[styles.statusVal,   { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Scan button ── */}
          <TouchableOpacity
            style={[styles.scanBtn, {
              backgroundColor: phase === "scanning" || phase === "identified" ? colors.primaryDark : colors.primary,
              borderRadius: colors.radius,
            }]}
            onPress={startScan}
            disabled={phase === "scanning" || phase === "identified"}
            activeOpacity={0.85}
          >
            {phase === "scanning" || phase === "identified" ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.scanBtnText}>
                  {phase === "scanning" ? "Recognising…" : "Starting liveness…"}
                </Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="face-recognition" size={24} color="#fff" />
                <Text style={styles.scanBtnText}>Start Face Scan</Text>
              </>
            )}
          </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },

  /* Camera */
  cameraWrap: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  cameraView: { height: 300, alignItems: "center", justifyContent: "center", position: "relative" },
  bracket: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  bTL: { top: 16, left: 16, borderRightWidth: 0, borderBottomWidth: 0 },
  bTR: { top: 16, right: 16, borderLeftWidth: 0, borderBottomWidth: 0 },
  bBL: { bottom: 16, left: 16, borderRightWidth: 0, borderTopWidth: 0 },
  bBR: { bottom: 16, right: 16, borderLeftWidth: 0, borderTopWidth: 0 },
  cameraCenter: { alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  scanLine: { position: "absolute", top: -100, width: "80%", height: 2, borderRadius: 1 },
  scanHint: { fontSize: 14, fontWeight: "500" },

  /* Match card */
  matchCard: {
    width: "92%",
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    alignItems: "stretch",
  },
  matchAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  matchInfo: { flex: 1, gap: 3 },
  matchName: { fontSize: 16, fontWeight: "700" },
  matchMeta: { fontSize: 12 },
  matchBadgeRow: { flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" },
  matchBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  matchBadgeText: { fontSize: 11, fontWeight: "600" },
  livenessNext: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  livenessNextText: { fontSize: 12, fontWeight: "600" },

  noticeBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1 },
  noticeText: { flex: 1, fontSize: 11 },

  /* Flow diagram */
  flowCard: { padding: 14, borderWidth: 1, gap: 12 },
  flowTitle: { fontSize: 13, fontWeight: "700" },
  flowRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  flowStep: { alignItems: "center", gap: 4 },
  flowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  flowLabel: { fontSize: 10, fontWeight: "600" },
  flowArrow: { marginHorizontal: 2, marginBottom: 12 },

  /* Instructions */
  instrCard: { padding: 16, borderWidth: 1, gap: 10 },
  instrTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  instrRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  instrDot: { width: 6, height: 6, borderRadius: 3 },
  instrText: { flex: 1, fontSize: 13 },

  /* Status */
  statusRow: { flexDirection: "row", gap: 10 },
  statusCard: { flex: 1, alignItems: "center", padding: 14, borderWidth: 1, gap: 4 },
  statusVal: { fontSize: 13, fontWeight: "700" },
  statusLabel: { fontSize: 11 },

  /* Scan button */
  scanBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  scanBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  /* Operator context banner */
  contextBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1 },
  contextText: { flex: 1, fontSize: 12, fontWeight: "600" },
  authBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  authBadgeText: { fontSize: 11, fontWeight: "700" },
});
