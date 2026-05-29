import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import * as FaceRecognitionService from "@/services/FaceRecognitionService";
import { getWorkers } from "@/services/database";

type ScanPhase = "idle" | "scanning" | "identified" | "no_match";

interface MatchedWorker {
  id: string;
  workerIdCode: string;
  name: string;
  department: string;
  confidence: number;
}

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const cameraRef = useRef<CameraView | null>(null);
  const scanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScanningRef = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase]   = useState<ScanPhase>("idle");
  const [matched, setMatched] = useState<MatchedWorker | null>(null);
  const [modelReady, setModelReady]   = useState(false);
  const [modelLoading, setModelLoading] = useState(false);

  const scanLine    = useSharedValue(0);
  const idCardScale = useSharedValue(0.85);
  const idCardOpac  = useSharedValue(0);

  /* ── Scan-line animation ── */
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLine.value }],
  }));

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

  /* ── Load AI models on mount (native only) ── */
  useEffect(() => {
    if (Platform.OS === "web") return;
    setModelLoading(true);
    Promise.all([
      FaceRecognitionService.initModels(),
      FaceRecognitionService.loadStoredEmbeddings(),
    ])
      .then(() => { setModelReady(true); setModelLoading(false); })
      .catch((err) => {
        console.warn("[Attendance] AI model load failed — using simulation:", err);
        setModelLoading(false);
      });

    return () => {
      clearTimeout(scanLoopRef.current ?? undefined);
      clearTimeout(hardTimeoutRef.current ?? undefined);
    };
  }, []);

  /* ── Request camera permission if granted state unknown ── */
  useEffect(() => {
    if (Platform.OS !== "web" && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, []);

  /* ── Navigate to liveness on match ── */
  const navigateToLiveness = useCallback((worker: MatchedWorker) => {
    isScanningRef.current = false;
    setMatched(worker);
    setPhase("identified");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    idCardScale.value = withTiming(1, { duration: 350 });
    idCardOpac.value  = withTiming(1, { duration: 350 });

    setTimeout(() => {
      idCardScale.value = withTiming(0.9, { duration: 200 });
      idCardOpac.value  = withTiming(0, { duration: 200 });
      setTimeout(() => {
        setPhase("idle");
        idCardScale.value = 0.85;
        idCardOpac.value  = 0;
        router.push({
          pathname: "/liveness-detection",
          params: {
            workerName: worker.name,
            workerId: worker.workerIdCode,
            department: worker.department,
            confidence: String(worker.confidence),
          },
        } as never);
      }, 220);
    }, 1600);
  }, []);

  /* ── Simulation fallback ── */
  const runSimulation = useCallback(async () => {
    const workers = await getWorkers().catch(() => []);
    const workerList = workers.length > 0
      ? workers.map((w) => ({ id: String(w.id ?? "1"), workerIdCode: w.workerId ?? "WRK001", fullName: w.fullName, department: w.department ?? "General" }))
      : [{ id: "1", workerIdCode: "WRK001", fullName: "Rajesh Kumar", department: "Civil" }];

    setTimeout(() => {
      if (!isScanningRef.current) return;
      const result = FaceRecognitionService.simulateScan(workerList);
      if (result.matched) {
        navigateToLiveness({ id: result.workerId!, workerIdCode: result.workerIdCode!, name: result.workerName!, department: result.department, confidence: result.confidence });
      } else {
        isScanningRef.current = false;
        setPhase("no_match");
      }
    }, 2200);
  }, [navigateToLiveness]);

  /* ── Real AI scan loop ── */
  const runCapture = useCallback(async () => {
    if (!isScanningRef.current || !cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: false,
        skipProcessing: true,
      });
      if (!isScanningRef.current) return;

      const result = await FaceRecognitionService.identifyFromCamera(photo.uri);
      if (!isScanningRef.current) return;

      if (result.faceDetected && result.matched && result.workerIdCode) {
        clearTimeout(hardTimeoutRef.current ?? undefined);
        navigateToLiveness({
          id: result.workerId ?? result.workerIdCode,
          workerIdCode: result.workerIdCode,
          name: result.workerName ?? result.workerIdCode,
          department: "",
          confidence: result.confidence,
        });
      } else {
        scanLoopRef.current = setTimeout(runCapture, 850);
      }
    } catch (err) {
      console.warn("[Attendance] Capture error:", err);
      if (isScanningRef.current) scanLoopRef.current = setTimeout(runCapture, 850);
    }
  }, [navigateToLiveness]);

  /* ── Start scan ── */
  const startScan = useCallback(async () => {
    if (phase !== "idle" && phase !== "no_match") return;
    setMatched(null);
    isScanningRef.current = true;
    setPhase("scanning");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const useRealAI = Platform.OS !== "web" && modelReady && cameraRef.current && permission?.granted;

    if (!useRealAI) {
      runSimulation();
      return;
    }

    hardTimeoutRef.current = setTimeout(() => {
      if (isScanningRef.current) {
        isScanningRef.current = false;
        clearTimeout(scanLoopRef.current ?? undefined);
        setPhase("no_match");
      }
    }, 12000);

    runCapture();
  }, [phase, modelReady, permission, runSimulation, runCapture]);

  const cancelScan = useCallback(() => {
    isScanningRef.current = false;
    clearTimeout(scanLoopRef.current ?? undefined);
    clearTimeout(hardTimeoutRef.current ?? undefined);
    setPhase("idle");
  }, []);

  const bottomPad    = Platform.OS === "web" ? 34 : insets.bottom + 20;
  const isOperator   = user?.role === "operator";
  const deviceBlocked = isOperator && user?.isDeviceAuthorized === false;
  const cameraActive  = Platform.OS !== "web" && permission?.granted;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Mark Attendance" showBack onBack={() => { cancelScan(); router.back(); }} />

        {/* Device authorization gate */}
        {deviceBlocked && <UnauthorizedDeviceScreen reason={user?.deviceVerifyReason} />}

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

                {/* Live camera feed (native only, always active for fast scanning) */}
                {cameraActive && (
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="front"
                    active
                  />
                )}

                {/* Darkening overlay when idle/no-match */}
                {(phase === "idle" || phase === "no_match") && (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.42)" }]} />
                )}

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
                      <Text style={[styles.scanHint, { color: colors.accent }]}>
                        {modelReady ? "AI face recognition active…" : "Recognising face…"}
                      </Text>
                      <TouchableOpacity onPress={cancelScan} style={{ marginTop: 8, padding: 8 }}>
                        <Text style={{ color: "#fff88a", fontSize: 12, fontWeight: "600" }}>Cancel</Text>
                      </TouchableOpacity>
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
                          {matched.workerIdCode}{matched.department ? ` · ${matched.department}` : ""}
                        </Text>
                        <View style={styles.matchBadgeRow}>
                          <View style={[styles.matchBadge, { backgroundColor: colors.successBg }]}>
                            <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                            <Text style={[styles.matchBadgeText, { color: colors.success }]}>Worker identified</Text>
                          </View>
                          <View style={[styles.matchBadge, { backgroundColor: colors.primary + "22" }]}>
                            <Text style={[styles.matchBadgeText, { color: colors.accent }]}>{matched.confidence}% match</Text>
                          </View>
                        </View>
                      </View>
                      <View style={[styles.livenessNext, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={[styles.livenessNextText, { color: colors.accent }]}>Starting liveness check…</Text>
                      </View>
                    </Animated.View>
                  )}

                  {(phase === "idle" || phase === "no_match") && (
                    <>
                      <MaterialCommunityIcons name="face-recognition" size={64} color={colors.primary + "aa"} />
                      {phase === "no_match" ? (
                        <Text style={[styles.scanHint, { color: "#F97316" }]}>No face matched — try again</Text>
                      ) : (
                        <Text style={[styles.scanHint, { color: "#ffffffbb" }]}>Position face in frame</Text>
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* AI status banner */}
              <View style={[styles.noticeBanner, {
                backgroundColor: modelReady ? colors.success + "10" : colors.primary + "0f",
                borderColor: modelReady ? colors.success + "33" : colors.primary + "2a",
              }]}>
                {modelLoading ? (
                  <>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.noticeText, { color: colors.textSecondary }]}>Loading AI face recognition model…</Text>
                  </>
                ) : modelReady ? (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                    <Text style={[styles.noticeText, { color: colors.success }]}>
                      Offline AI active — BlazeFace + MobileNet v2 (~5.8 MB)
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                    <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                      {Platform.OS === "web"
                        ? "Simulation mode — real AI runs on mobile device"
                        : "AI unavailable — using demo simulation"}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* ── Attendance flow diagram ── */}
            <View style={[styles.flowCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.flowTitle, { color: colors.foreground }]}>Attendance Verification Flow</Text>
              <View style={styles.flowRow}>
                {[
                  { icon: "camera-outline",           label: "Face Scan",     color: colors.accent },
                  { icon: "person-circle-outline",    label: "Identify",      color: colors.primary },
                  { icon: "eye-outline",              label: "Liveness",      color: colors.warning },
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
                { icon: "wifi-outline"             as const, label: "Offline",  value: "Active",  color: colors.success },
                { icon: "phone-portrait-outline"   as const, label: "Camera",   value: cameraActive ? "Live" : "Ready", color: cameraActive ? colors.success : colors.accent },
                { icon: "shield-checkmark-outline" as const, label: "AI Model", value: modelReady ? "Loaded" : modelLoading ? "Loading" : "Pending", color: modelReady ? colors.success : colors.warning },
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
                    {phase === "scanning" ? (modelReady ? "AI Scanning…" : "Recognising…") : "Starting liveness…"}
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

  cameraWrap: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  cameraView: { height: 300, alignItems: "center", justifyContent: "center", position: "relative" },
  bracket: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  bTL: { top: 16, left: 16, borderRightWidth: 0, borderBottomWidth: 0 },
  bTR: { top: 16, right: 16, borderLeftWidth: 0, borderBottomWidth: 0 },
  bBL: { bottom: 16, left: 16, borderRightWidth: 0, borderTopWidth: 0 },
  bBR: { bottom: 16, right: 16, borderLeftWidth: 0, borderTopWidth: 0 },
  cameraCenter: { alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  scanLine: { position: "absolute", top: -100, width: "80%", height: 2, borderRadius: 1 },
  scanHint: { fontSize: 14, fontWeight: "500", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  matchCard: { width: "92%", borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10, alignItems: "stretch" },
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

  flowCard: { padding: 14, borderWidth: 1, gap: 12 },
  flowTitle: { fontSize: 13, fontWeight: "700" },
  flowRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  flowStep: { alignItems: "center", gap: 4 },
  flowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  flowLabel: { fontSize: 10, fontWeight: "600" },
  flowArrow: { marginHorizontal: 2, marginBottom: 12 },

  instrCard: { padding: 16, borderWidth: 1, gap: 10 },
  instrTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  instrRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  instrDot: { width: 6, height: 6, borderRadius: 3 },
  instrText: { flex: 1, fontSize: 13 },

  statusRow: { flexDirection: "row", gap: 10 },
  statusCard: { flex: 1, alignItems: "center", padding: 14, borderWidth: 1, gap: 4 },
  statusVal: { fontSize: 13, fontWeight: "700" },
  statusLabel: { fontSize: 11 },

  scanBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  scanBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  contextBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1 },
  contextText: { flex: 1, fontSize: 12, fontWeight: "600" },
  authBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  authBadgeText: { fontSize: 11, fontWeight: "700" },
});
