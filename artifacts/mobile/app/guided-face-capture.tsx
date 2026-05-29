/**
 * GuidedFaceCaptureScreen
 *
 * Sequential guided workflow: walks the user through all 8 poses
 * one by one using a camera → preview → confirm loop.
 *
 * Phases per pose:
 *   'guide'   – instruction screen with animated oval, "Open Camera" CTA
 *   'preview' – shows the captured image with Retake / Continue buttons
 *
 * After the last pose is confirmed the screen navigates back; the
 * registration screen reads the completed session via useFocusEffect.
 */

import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type CaptureResult,
  type FacePose,
  POSE_CONFIGS,
  getSessionCaptures,
  setCapture,
} from "@/services/FaceCaptureService";
import { useColors } from "@/hooks/useColors";

type Phase = "guide" | "preview";

/* ── Take one photo using the front camera ── */
async function shootPhoto(sessionId: string, pose: FacePose): Promise<CaptureResult | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: "images",
    allowsEditing: false,
    quality: 0.85,
    exif: false,
    cameraType: ImagePicker.CameraType.front,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  const dir = `${FileSystem.documentDirectory}spectra_faces/${sessionId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const ext = asset.uri.split(".").pop() ?? "jpg";
  const dest = `${dir}${pose}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });

  return { pose, uri: dest, localPath: dest, capturedAt: new Date().toISOString() };
}

/* ─────────────────────────────────────────────────────────── */

export default function GuidedFaceCaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  /* Resume from partial session */
  const firstPending = () => {
    const done = Object.keys(getSessionCaptures(sessionId ?? ""));
    const idx = POSE_CONFIGS.findIndex((p) => !done.includes(p.key));
    return idx === -1 ? 0 : idx;
  };

  const [currentIndex, setCurrentIndex] = useState(firstPending);
  const [phase, setPhase] = useState<Phase>("guide");
  const [pendingResult, setPendingResult] = useState<CaptureResult | null>(null);
  const [completed, setCompleted] = useState<Set<FacePose>>(() => {
    const done = Object.keys(getSessionCaptures(sessionId ?? "")) as FacePose[];
    return new Set(done);
  });
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const poseConfig = POSE_CONFIGS[currentIndex];
  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? 32 : insets.bottom + 20;

  /* ── Animations ── */
  const pulse      = useSharedValue(1);
  const slideY     = useSharedValue(50);
  const cardOpac   = useSharedValue(0);

  const animateIn = () => {
    slideY.value   = 50;
    cardOpac.value = 0;
    slideY.value   = withSpring(0,  { damping: 18 });
    cardOpac.value = withTiming(1,  { duration: 280 });
  };

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1, true
    );
    animateIn();
    setErrorMsg("");
  }, [currentIndex, phase]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const cardStyle  = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
    opacity: cardOpac.value,
  }));

  /* ── Open camera ── */
  const handleOpenCamera = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const result = await shootPhoto(sessionId ?? "", poseConfig.key);
      if (result) {
        setPendingResult(result);
        setPhase("preview");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setErrorMsg("Camera was cancelled or permission denied.");
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Camera error occurred.");
    }
    setBusy(false);
  };

  /* ── Retake: delete pending file, go back to guide phase ── */
  const handleRetake = async () => {
    if (busy) return;
    if (pendingResult) {
      try { await FileSystem.deleteAsync(pendingResult.localPath, { idempotent: true }); } catch {}
    }
    setPendingResult(null);
    setPhase("guide");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  /* ── Confirm capture, advance or finish ── */
  const handleContinue = async () => {
    if (!pendingResult || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    /* Commit to the shared session store */
    setCapture(sessionId ?? "", pendingResult);

    const newCompleted = new Set(completed);
    newCompleted.add(poseConfig.key);
    setCompleted(newCompleted);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= POSE_CONFIGS.length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBusy(false);
      router.back();
      return;
    }

    setPendingResult(null);
    setCurrentIndex(nextIndex);
    setPhase("guide");
    setBusy(false);
  };

  /* ── Close / cancel ── */
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  /* ═══════════════ PREVIEW PHASE ════════════════ */
  if (phase === "preview" && pendingResult) {
    return (
      <View style={[styles.root, { backgroundColor: "#000" }]}>
        {/* Full-bleed captured image */}
        <Image
          source={{ uri: pendingResult.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />

        {/* Top overlay */}
        <View style={[styles.previewTopBar, { paddingTop: topPad }]}>
          <View style={[styles.poseBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.poseBadgeText}>{poseConfig.label}</Text>
          </View>
          <View style={[styles.stepBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
            <Text style={styles.stepBadgeText}>{currentIndex + 1} / {POSE_CONFIGS.length}</Text>
          </View>
        </View>

        {/* Centre quality label */}
        <View style={styles.previewCentreWrap} pointerEvents="none">
          <View style={[styles.previewQualityPill, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.previewQualityText}>Does the image look clear?</Text>
          </View>
        </View>

        {/* Bottom actions */}
        <View style={[styles.previewBottomBar, { paddingBottom: bottomPad, backgroundColor: "rgba(0,0,0,0.72)" }]}>
          <TouchableOpacity
            style={[styles.retakeBtn, { borderColor: "rgba(255,255,255,0.3)" }]}
            onPress={handleRetake}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.retakeBtnText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: busy ? colors.primaryDark : colors.primary }]}
            onPress={handleContinue}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.continueBtnText}>
                  {currentIndex + 1 === POSE_CONFIGS.length ? "Finish" : "Continue"}
                </Text>
                <Ionicons
                  name={currentIndex + 1 === POSE_CONFIGS.length ? "checkmark-circle" : "arrow-forward"}
                  size={20}
                  color="#fff"
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ═══════════════ GUIDE PHASE ════════════════ */
  return (
    <View style={[styles.root, { backgroundColor: "#050B1F" }]}>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: "rgba(255,255,255,0.1)" }]}
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Face Capture</Text>
        <View style={[styles.stepBadge, { backgroundColor: colors.primary + "33" }]}>
          <Text style={[styles.stepBadgeText, { color: colors.accent }]}>
            {completed.size}/{POSE_CONFIGS.length}
          </Text>
        </View>
      </View>

      {/* Progress dots — pill widens for the active step */}
      <View style={styles.dotsRow}>
        {POSE_CONFIGS.map((p, i) => {
          const isDone   = completed.has(p.key);
          const isActive = i === currentIndex;
          return (
            <View
              key={p.key}
              style={[
                styles.dot,
                {
                  width: isActive ? 28 : 10,
                  backgroundColor: isDone
                    ? colors.success
                    : isActive
                    ? colors.primary
                    : "rgba(255,255,255,0.14)",
                },
              ]}
            >
              {isDone && <Ionicons name="checkmark" size={7} color="#fff" />}
            </View>
          );
        })}
      </View>

      {/* Pose heading */}
      <View style={styles.headingArea}>
        <Text style={styles.stepLabel}>STEP {currentIndex + 1} OF {POSE_CONFIGS.length}</Text>
        <Text style={styles.poseName}>{poseConfig.label}</Text>
      </View>

      {/* Animated face oval */}
      <View style={styles.ovalArea}>
        <Animated.View style={pulseStyle}>
          <View style={styles.ovalFrame}>
            {/* Corner brackets */}
            <View style={[styles.bracket, styles.bTL, { borderColor: colors.primary }]} />
            <View style={[styles.bracket, styles.bTR, { borderColor: colors.primary }]} />
            <View style={[styles.bracket, styles.bBL, { borderColor: colors.primary }]} />
            <View style={[styles.bracket, styles.bBR, { borderColor: colors.primary }]} />

            {/* Oval rings */}
            <View style={[styles.ovalOuter, { borderColor: colors.primary + "55" }]}>
              <View style={[styles.ovalInner, { borderColor: colors.primary + "33" }]}>
                <Ionicons name="person-outline" size={72} color={colors.primary + "44"} />
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Instruction card — slides in per pose */}
      <Animated.View
        style={[
          styles.instrCard,
          { backgroundColor: "rgba(124,58,237,0.11)", borderColor: colors.primary + "30" },
          cardStyle,
        ]}
      >
        <View style={[styles.instrIcon, { backgroundColor: colors.primary + "30" }]}>
          <Ionicons name={poseConfig.icon as keyof typeof Ionicons.glyphMap} size={26} color={colors.accent} />
        </View>
        <View style={styles.instrBody}>
          <Text style={styles.instrTitle}>{poseConfig.label}</Text>
          <Text style={styles.instrDesc}>{poseConfig.instruction}</Text>
        </View>
      </Animated.View>

      {/* Quick-tips row */}
      <View style={styles.tipsRow}>
        {(["Good lighting", "Face centred", "Hold still"] as const).map((tip) => (
          <View key={tip} style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={13} color={colors.success} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      {/* Error */}
      {errorMsg ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive + "20", borderColor: colors.destructive + "40" }]}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.destructive} />
          <Text style={[styles.errorTxt, { color: colors.destructive }]}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Camera CTA */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          style={[styles.cameraBtn, { backgroundColor: busy ? colors.primaryDark : colors.primary }]}
          onPress={handleOpenCamera}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="camera" size={22} color="#fff" />
              <Text style={styles.cameraBtnTxt}>Open Camera</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─────────────────── styles ─────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Top bar */
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  topTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  stepBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
  stepBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  /* Progress dots */
  dotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 16 },
  dot: { height: 10, borderRadius: 5, alignItems: "center", justifyContent: "center" },

  /* Heading */
  headingArea: { alignItems: "center", gap: 4, paddingVertical: 6 },
  stepLabel: { color: "rgba(255,255,255,0.38)", fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  poseName: { color: "#fff", fontSize: 24, fontWeight: "800" },

  /* Oval area */
  ovalArea: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 230 },
  ovalFrame: { width: 240, height: 300, alignItems: "center", justifyContent: "center", position: "relative" },
  bracket: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  bTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  bTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  ovalOuter: { width: 188, height: 248, borderRadius: 94, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  ovalInner: { width: 156, height: 208, borderRadius: 78, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },

  /* Instruction card */
  instrCard: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  instrIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  instrBody: { flex: 1, gap: 3 },
  instrTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  instrDesc: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 18 },

  /* Tips */
  tipsRow: { flexDirection: "row", justifyContent: "center", gap: 18, paddingHorizontal: 20, marginBottom: 10 },
  tipItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  tipText: { color: "rgba(255,255,255,0.5)", fontSize: 12 },

  /* Error */
  errorBox: { marginHorizontal: 20, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorTxt: { flex: 1, fontSize: 13 },

  /* Camera button */
  bottomBar: { paddingHorizontal: 20, paddingTop: 4 },
  cameraBtn: { height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  cameraBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },

  /* Preview phase */
  previewTopBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  poseBadge: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99 },
  poseBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  previewCentreWrap: { position: "absolute", left: 0, right: 0, bottom: 130, alignItems: "center" },
  previewQualityPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99 },
  previewQualityText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  previewBottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 16,
  },
  retakeBtn: { flex: 1, height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1.5 },
  retakeBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  continueBtn: { flex: 2, height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14 },
  continueBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
