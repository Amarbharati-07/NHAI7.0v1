import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { useColors } from "@/hooks/useColors";

const STEPS = [
  { key: "blink", label: "Blink Detection", desc: "Blink your eyes twice", icon: "eye-outline" as const },
  { key: "headLeft", label: "Head Movement", desc: "Turn head left slowly", icon: "arrow-back-outline" as const },
  { key: "headRight", label: "Head Movement", desc: "Turn head right slowly", icon: "arrow-forward-outline" as const },
  { key: "tracking", label: "Eye Tracking", desc: "Follow the dot with your eyes", icon: "scan-circle-outline" as const },
];

export default function LivenessDetectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>([false, false, false, false]);
  const [running, setRunning] = useState(false);
  const pulseScale = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  useEffect(() => {
    if (running) {
      pulseScale.value = withRepeat(withTiming(1.15, { duration: 600 }), -1, true);
    } else {
      pulseScale.value = withTiming(1);
    }
  }, [running]);

  const runStep = () => {
    setRunning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      setRunning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const next = [...completed];
      next[currentStep] = true;
      setCompleted(next);
      if (currentStep < STEPS.length - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        setTimeout(() => router.replace("/attendance-success"), 600);
      }
    }, 2000);
  };

  const allDone = completed.every(Boolean);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Liveness Detection" showBack onBack={() => router.back()} />
        <View style={[styles.content, { paddingBottom: bottomPad }]}>

          {/* Progress bar */}
          <View style={[styles.progressRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {STEPS.map((step, i) => {
              const done = completed[i];
              const active = i === currentStep;
              return (
                <View key={step.key} style={styles.progressItem}>
                  <View style={[styles.progressCircle, {
                    backgroundColor: done ? colors.success : active ? colors.primary : colors.surface,
                    borderColor: done ? colors.success : active ? colors.primary : colors.border,
                  }]}>
                    {done
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : <Text style={[styles.progressNum, { color: active ? "#fff" : colors.textMuted }]}>{i + 1}</Text>
                    }
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.progressLine, { backgroundColor: done ? colors.success : colors.border }]} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Current step visual */}
          <View style={[styles.stepCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.stepNum, { color: colors.textMuted }]}>STEP {currentStep + 1} OF {STEPS.length}</Text>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{STEPS[currentStep].label}</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{STEPS[currentStep].desc}</Text>

            {/* Animation area */}
            <Animated.View style={[styles.animationArea, pulseStyle]}>
              <View style={[styles.outerRing, { borderColor: running ? colors.primary : colors.border }]}>
                <View style={[styles.innerRing, { borderColor: running ? colors.primaryLight : colors.border + "88" }]}>
                  <View style={[styles.iconCircle, { backgroundColor: running ? colors.primary : colors.surface }]}>
                    <Ionicons name={STEPS[currentStep].icon} size={36} color={running ? "#fff" : colors.textSecondary} />
                  </View>
                </View>
              </View>
            </Animated.View>

            {running && (
              <View style={[styles.runningBanner, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                <View style={[styles.runDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.runText, { color: colors.accent }]}>Analyzing… Liveness AI will process this step</Text>
              </View>
            )}

            {/* Placeholder */}
            <View style={[styles.placeholderBox, { backgroundColor: colors.infoBg, borderColor: colors.info + "44" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.info} />
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                Liveness AI model placeholder — {STEPS[currentStep].key === "blink" ? "Blink detection" : STEPS[currentStep].key === "tracking" ? "Eye tracking" : "Head movement"} will be integrated here
              </Text>
            </View>
          </View>

          {/* Step list */}
          <View style={[styles.stepList, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {STEPS.map((step, i) => {
              const done = completed[i];
              const active = i === currentStep;
              return (
                <View key={step.key} style={[styles.stepRow, i < STEPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={[styles.stepIcon, { backgroundColor: done ? colors.successBg : active ? colors.primary + "22" : colors.surface }]}>
                    <Ionicons name={step.icon} size={18} color={done ? colors.success : active ? colors.accent : colors.textMuted} />
                  </View>
                  <Text style={[styles.stepRowLabel, { color: done ? colors.success : active ? colors.foreground : colors.textMuted, fontWeight: active ? "600" : "400" }]}>{step.label}</Text>
                  {done && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                  {active && !done && <View style={[styles.activePill, { backgroundColor: colors.primary }]}><Text style={styles.activePillText}>Active</Text></View>}
                </View>
              );
            })}
          </View>

          {/* Action button */}
          {!allDone && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: running ? colors.primaryDark : colors.primary, borderRadius: colors.radius }]}
              onPress={runStep}
              disabled={running}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="eye-check-outline" size={22} color="#fff" />
              <Text style={styles.actionBtnText}>{running ? "Detecting…" : `Start: ${STEPS[currentStep].label}`}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, padding: 16, gap: 16 },
  progressRow: { flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1 },
  progressItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  progressCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  progressNum: { fontSize: 12, fontWeight: "700" },
  progressLine: { flex: 1, height: 2, marginHorizontal: 4 },
  stepCard: { padding: 20, borderWidth: 1, gap: 10, alignItems: "center" },
  stepNum: { fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  stepTitle: { fontSize: 20, fontWeight: "700" },
  stepDesc: { fontSize: 14 },
  animationArea: { marginVertical: 8 },
  outerRing: { width: 130, height: 130, borderRadius: 65, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  innerRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  iconCircle: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center" },
  runningBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, alignSelf: "stretch" },
  runDot: { width: 8, height: 8, borderRadius: 4 },
  runText: { flex: 1, fontSize: 12 },
  placeholderBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, alignSelf: "stretch" },
  placeholderText: { flex: 1, fontSize: 11 },
  stepList: { borderWidth: 1, overflow: "hidden" },
  stepRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  stepIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  stepRowLabel: { flex: 1, fontSize: 13 },
  activePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  activePillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  actionBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
