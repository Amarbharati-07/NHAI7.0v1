/**
 * LivenessCameraScreen
 *
 * Full-screen live camera view for attendance liveness verification.
 * Cycles through all 4 liveness steps without closing the camera.
 *
 * State machine per step:
 *   ready      – camera live, instruction shown, "Start Detection" CTA
 *   detecting  – pulsing ring, "Analysing…" banner, "Confirm" button visible
 *                (AI extension point: replace manual confirm with model callback)
 *   confirmed  – green flash, brief pause, auto-advances to next step
 *
 * After step 4 confirmed → navigates to attendance-success with worker params.
 */

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useColors } from "@/hooks/useColors";

const STEPS = [
  {
    key: "blink",
    label: "Blink Detection",
    action: "Blink your eyes twice naturally",
    instruction: "Keep your face centred in the oval and blink both eyes twice.",
    icon: "eye-outline" as const,
    color: "#A78BFA",
  },
  {
    key: "headLeft",
    label: "Head Movement Left",
    action: "Slowly turn your head to the left",
    instruction: "Face the camera, then turn your head slowly to the left until your ear is visible.",
    icon: "arrow-back-outline" as const,
    color: "#60A5FA",
  },
  {
    key: "headRight",
    label: "Head Movement Right",
    action: "Slowly turn your head to the right",
    instruction: "Return to centre, then turn your head slowly to the right until your ear is visible.",
    icon: "arrow-forward-outline" as const,
    color: "#34D399",
  },
  {
    key: "tracking",
    label: "Eye Tracking",
    action: "Follow the dot with your eyes",
    instruction: "Keep your head still and follow the moving dot with your eyes only.",
    icon: "scan-circle-outline" as const,
    color: "#F59E0B",
  },
];

type StepPhase = "ready" | "detecting" | "confirmed";

export default function LivenessCameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { workerName, workerId, department, confidence } =
    useLocalSearchParams<{
      workerName?: string;
      workerId?: string;
      department?: string;
      confidence?: string;
    }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<StepPhase>("ready");
  const [completed, setCompleted] = useState<boolean[]>([false, false, false, false]);

  /* Animations */
  const pulseScale  = useSharedValue(1);
  const ringOpac    = useSharedValue(0.4);
  const cardSlide   = useSharedValue(60);
  const cardOpac    = useSharedValue(0);
  const checkScale  = useSharedValue(0);
  const checkOpac   = useSharedValue(0);

  const step = STEPS[stepIndex];
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 28 : insets.bottom + 16;

  /* ── Pulse ring while detecting ── */
  useEffect(() => {
    if (phase === "detecting") {
      pulseScale.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1, true
      );
      ringOpac.value = withRepeat(
        withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })),
        -1, true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      ringOpac.value   = withTiming(0.4, { duration: 300 });
    }
  }, [phase]);

  /* ── Slide-in instruction card on step change ── */
  const animateCardIn = useCallback(() => {
    cardSlide.value = 60;
    cardOpac.value  = 0;
    cardSlide.value = withSpring(0, { damping: 18 });
    cardOpac.value  = withTiming(1, { duration: 300 });
  }, []);

  useEffect(() => { animateCardIn(); }, [stepIndex]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: ringOpac.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardSlide.value }],
    opacity: cardOpac.value,
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkOpac.value,
  }));

  /* ── Request permission on mount ── */
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, []);

  /* ── Start detecting ── */
  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPhase("detecting");
  };

  /* ── Manual confirm (AI extension point) ── */
  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase("confirmed");

    /* Check flash animation */
    checkScale.value = withSpring(1, { damping: 10 });
    checkOpac.value  = withTiming(1, { duration: 200 });

    const newCompleted = [...completed];
    newCompleted[stepIndex] = true;
    setCompleted(newCompleted);

    setTimeout(() => {
      checkScale.value = withTiming(0, { duration: 250 });
      checkOpac.value  = withTiming(0, { duration: 250 });

      setTimeout(() => {
        if (stepIndex < STEPS.length - 1) {
          setStepIndex((i) => i + 1);
          setPhase("ready");
        } else {
          /* All done — navigate to success */
          router.replace({
            pathname: "/attendance-success",
            params: { workerName, workerId, department, confidence },
          } as never);
        }
      }, 300);
    }, 900);
  };

  /* ── Close / cancel ── */
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  /* ── Permission not yet known ── */
  if (!permission) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: "#050B1F" }]}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.permText}>Requesting camera access…</Text>
      </View>
    );
  }

  /* ── Permission denied ── */
  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.centre, { backgroundColor: "#050B1F", paddingHorizontal: 32 }]}>
        <View style={[styles.permIconWrap, { backgroundColor: "#7C3AED22" }]}>
          <Ionicons name="camera-outline" size={48} color="#A78BFA" />
        </View>
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>
          Liveness detection needs the front camera to verify you are a real, present person.
        </Text>
        <TouchableOpacity
          style={[styles.permBtn, { backgroundColor: "#7C3AED" }]}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.permBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permCancel} onPress={handleClose}>
          <Text style={styles.permCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ══════════════ MAIN CAMERA VIEW ══════════════ */
  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>

      {/* ── Live camera feed ── */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="front"
        active
      />

      {/* Semi-transparent dark overlay */}
      <View style={[StyleSheet.absoluteFill, styles.overlay]} />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>Liveness Check</Text>
          {(workerName) ? (
            <Text style={styles.topSub}>{workerName}</Text>
          ) : null}
        </View>

        <View style={[styles.stepBadge, { backgroundColor: "rgba(124,58,237,0.55)" }]}>
          <Text style={styles.stepBadgeText}>{stepIndex + 1}/{STEPS.length}</Text>
        </View>
      </View>

      {/* ── Progress dots ── */}
      <View style={styles.dotsRow}>
        {STEPS.map((s, i) => {
          const done   = completed[i];
          const active = i === stepIndex;
          return (
            <View
              key={s.key}
              style={[
                styles.dot,
                {
                  width: active ? 28 : 10,
                  backgroundColor: done
                    ? "#10B981"
                    : active
                    ? "#7C3AED"
                    : "rgba(255,255,255,0.2)",
                },
              ]}
            >
              {done && <Ionicons name="checkmark" size={7} color="#fff" />}
            </View>
          );
        })}
      </View>

      {/* ── Face oval with pulse ring ── */}
      <View style={styles.ovalArea} pointerEvents="none">
        {/* Pulse ring (only while detecting) */}
        <Animated.View style={[styles.pulseRing, { borderColor: step.color }, pulseStyle]} />

        {/* Static oval */}
        <View style={[styles.oval, {
          borderColor: phase === "confirmed"
            ? "#10B981"
            : phase === "detecting"
            ? step.color
            : "rgba(255,255,255,0.4)",
          borderWidth: phase === "detecting" ? 2.5 : 1.5,
        }]} />

        {/* Confirmed check flash */}
        <Animated.View style={[styles.checkFlash, { backgroundColor: "#10B98133" }, checkStyle]}>
          <Ionicons name="checkmark-circle" size={72} color="#10B981" />
        </Animated.View>

        {/* Corner brackets */}
        {[styles.bTL, styles.bTR, styles.bBL, styles.bBR].map((pos, i) => (
          <View
            key={i}
            style={[
              styles.bracket, pos,
              { borderColor: phase === "confirmed" ? "#10B981" : step.color },
            ]}
          />
        ))}
      </View>

      {/* ── Bottom section ── */}
      <View style={[styles.bottomSection, { paddingBottom: botPad }]}>

        {/* Step name */}
        <View style={styles.stepHeading}>
          <Text style={styles.stepStepLabel}>STEP {stepIndex + 1} OF {STEPS.length}</Text>
          <Text style={styles.stepLabel}>{step.label}</Text>
          <Text style={styles.stepAction}>{step.action}</Text>
        </View>

        {/* Instruction card */}
        <Animated.View style={[styles.instrCard, cardStyle]}>
          <View style={[styles.instrIcon, { backgroundColor: step.color + "33" }]}>
            <Ionicons name={step.icon} size={22} color={step.color} />
          </View>
          <Text style={styles.instrText}>{step.instruction}</Text>
        </Animated.View>

        {/* AI placeholder notice */}
        <View style={styles.aiPlaceholder}>
          <Ionicons name="information-circle-outline" size={13} color="rgba(255,255,255,0.4)" />
          <Text style={styles.aiPlaceholderText}>
            Liveness AI placeholder — {step.label} detection will be integrated here
          </Text>
        </View>

        {/* Detecting banner */}
        {phase === "detecting" && (
          <View style={[styles.detectingBanner, { backgroundColor: step.color + "22", borderColor: step.color + "55" }]}>
            <ActivityIndicator size="small" color={step.color} />
            <Text style={[styles.detectingText, { color: step.color }]}>
              Analysing… watching for {step.label.toLowerCase()}
            </Text>
          </View>
        )}

        {/* Confirmed banner */}
        {phase === "confirmed" && (
          <View style={[styles.detectingBanner, { backgroundColor: "#10B98122", borderColor: "#10B98155" }]}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={[styles.detectingText, { color: "#10B981" }]}>
              {stepIndex < STEPS.length - 1
                ? `${step.label} verified — loading next step…`
                : "All steps verified — processing attendance…"}
            </Text>
          </View>
        )}

        {/* CTA buttons */}
        <View style={styles.ctaRow}>
          {phase === "ready" && (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: "#7C3AED" }]}
              onPress={handleStart}
              activeOpacity={0.85}
            >
              <Ionicons name={step.icon} size={20} color="#fff" />
              <Text style={styles.ctaBtnText}>Start {step.label}</Text>
            </TouchableOpacity>
          )}

          {phase === "detecting" && (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: step.color }]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.ctaBtnText}>Confirm: Action Completed</Text>
            </TouchableOpacity>
          )}

          {phase === "confirmed" && (
            <View style={[styles.ctaBtn, { backgroundColor: "#10B98133" }]}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={[styles.ctaBtnText, { color: "#10B981" }]}>
                {stepIndex < STEPS.length - 1 ? "Loading next step…" : "Completing attendance…"}
              </Text>
            </View>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tipsRow}>
          {["Good lighting", "Face centred", "Hold device steady"].map((tip) => (
            <View key={tip} style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={11} color="#10B981" />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center", gap: 16 },
  overlay: { backgroundColor: "rgba(0,0,0,0.35)" },

  /* Permission */
  permIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  permTitle: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center" },
  permSub: { color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", lineHeight: 20 },
  permText: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 12 },
  permBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  permBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  permCancel: { padding: 12 },
  permCancelText: { color: "rgba(255,255,255,0.45)", fontSize: 14 },

  /* Top bar */
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  topCenter: { flex: 1, alignItems: "center", gap: 1 },
  topTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  topSub: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  stepBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
  stepBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  /* Progress dots */
  dotsRow: {
    position: "absolute",
    top: 90,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { height: 10, borderRadius: 5, alignItems: "center", justifyContent: "center" },

  /* Face oval */
  ovalArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 230,
    height: 300,
    borderRadius: 115,
    borderWidth: 3,
  },
  oval: {
    width: 190,
    height: 255,
    borderRadius: 95,
  },
  checkFlash: {
    position: "absolute",
    width: 190,
    height: 255,
    borderRadius: 95,
    alignItems: "center",
    justifyContent: "center",
  },
  bracket: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  bTL: { top: "26%", left: "20%", borderRightWidth: 0, borderBottomWidth: 0 },
  bTR: { top: "26%", right: "20%", borderLeftWidth: 0, borderBottomWidth: 0 },
  bBL: { bottom: "26%", left: "20%", borderRightWidth: 0, borderTopWidth: 0 },
  bBR: { bottom: "26%", right: "20%", borderLeftWidth: 0, borderTopWidth: 0 },

  /* Bottom section */
  bottomSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "rgba(5,11,31,0.88)",
  },
  stepHeading: { alignItems: "center", gap: 2 },
  stepStepLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  stepLabel: { color: "#fff", fontSize: 20, fontWeight: "800" },
  stepAction: { color: "rgba(255,255,255,0.6)", fontSize: 13 },

  /* Instruction card */
  instrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  instrIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  instrText: { flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 18 },

  /* AI placeholder */
  aiPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  aiPlaceholderText: { flex: 1, color: "rgba(255,255,255,0.3)", fontSize: 10 },

  /* Detecting / confirmed banner */
  detectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  detectingText: { flex: 1, fontSize: 12, fontWeight: "600" },

  /* CTA */
  ctaRow: {},
  ctaBtn: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
  },
  ctaBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  /* Tips */
  tipsRow: { flexDirection: "row", justifyContent: "center", gap: 16, paddingBottom: 4 },
  tipItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  tipText: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
});
