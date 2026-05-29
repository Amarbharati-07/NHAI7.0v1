import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { useColors } from "@/hooks/useColors";

const STEPS = [
  {
    key: "blink",
    label: "Blink Detection",
    desc: "Blink your eyes twice naturally",
    icon: "eye-outline" as const,
    hint: "Blink detection",
  },
  {
    key: "headLeft",
    label: "Head Movement Left",
    desc: "Slowly turn your head to the left",
    icon: "arrow-back-outline" as const,
    hint: "Head movement",
  },
  {
    key: "headRight",
    label: "Head Movement Right",
    desc: "Slowly turn your head to the right",
    icon: "arrow-forward-outline" as const,
    hint: "Head movement",
  },
  {
    key: "tracking",
    label: "Eye Tracking",
    desc: "Follow the moving dot with your eyes",
    icon: "scan-circle-outline" as const,
    hint: "Eye tracking",
  },
];

export default function LivenessDetectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  /* Worker identity passed from attendance screen after face recognition */
  const { workerName, workerId, department, confidence } =
    useLocalSearchParams<{
      workerName?: string;
      workerId?: string;
      department?: string;
      confidence?: string;
    }>();

  const [currentStep, setCurrentStep] = useState(0);
  const [completed,   setCompleted]   = useState<boolean[]>([false, false, false, false]);
  const [running,     setRunning]     = useState(false);

  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  useEffect(() => {
    if (running) {
      pulseScale.value = withRepeat(withTiming(1.18, { duration: 600 }), -1, true);
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [running]);

  const runStep = () => {
    if (running) return;
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
        setTimeout(() => {
          router.replace({
            pathname: "/attendance-success",
            params: { workerName, workerId, department, confidence },
          } as never);
        }, 500);
      }
    }, 2200);
  };

  const allDone = completed.every(Boolean);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  /* Derive a short display name (fallback to "Worker") */
  const displayName  = workerName  ?? "Worker";
  const displayId    = workerId    ?? "—";
  const displayDept  = department  ?? "—";
  const displayConf  = confidence  ? `${confidence}%` : "—";

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Liveness Detection" showBack onBack={() => router.back()} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Identified worker banner ── */}
          <View style={[styles.workerBanner, { backgroundColor: colors.successBg, borderColor: colors.success + "55" }]}>
            <View style={[styles.workerAvatar, { backgroundColor: colors.success + "22" }]}>
              <Ionicons name="person-circle" size={36} color={colors.success} />
            </View>
            <View style={styles.workerInfo}>
              <Text style={[styles.workerName, { color: colors.foreground }]}>{displayName}</Text>
              <Text style={[styles.workerMeta, { color: colors.textSecondary }]}>
                {displayId} · {displayDept}
              </Text>
            </View>
            <View style={styles.workerRight}>
              <View style={[styles.confBadge, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                <Text style={[styles.confText, { color: colors.success }]}>{displayConf}</Text>
              </View>
              <Text style={[styles.identLabel, { color: colors.textMuted }]}>Face matched</Text>
            </View>
          </View>

          {/* ── Purpose label ── */}
          <View style={[styles.purposeRow, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "30" }]}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
            <Text style={[styles.purposeText, { color: colors.textSecondary }]}>
              Verifying liveness to confirm this is a real, present person — not a photo or video
            </Text>
          </View>

          {/* ── Progress stepper ── */}
          <View style={[styles.progressRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {STEPS.map((step, i) => {
              const done   = completed[i];
              const active = i === currentStep;
              return (
                <View key={step.key} style={styles.progressItem}>
                  <View style={[styles.progressCircle, {
                    backgroundColor: done ? colors.success : active ? colors.primary : colors.surface,
                    borderColor:     done ? colors.success : active ? colors.primary : colors.border,
                  }]}>
                    {done
                      ? <Ionicons name="checkmark" size={13} color="#fff" />
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

          {/* ── Current step card ── */}
          <View style={[styles.stepCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.stepNum, { color: colors.textMuted }]}>
              STEP {currentStep + 1} OF {STEPS.length}
            </Text>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{STEPS[currentStep].label}</Text>
            <Text style={[styles.stepDesc,  { color: colors.textSecondary }]}>{STEPS[currentStep].desc}</Text>

            {/* Animated ring */}
            <Animated.View style={[styles.animArea, pulseStyle]}>
              <View style={[styles.outerRing, { borderColor: running ? colors.primary : colors.border }]}>
                <View style={[styles.innerRing, { borderColor: running ? colors.primaryLight ?? colors.accent : colors.border + "88" }]}>
                  <View style={[styles.iconCircle, { backgroundColor: running ? colors.primary : colors.surface }]}>
                    <Ionicons
                      name={STEPS[currentStep].icon}
                      size={36}
                      color={running ? "#fff" : colors.textSecondary}
                    />
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Running status */}
            {running && (
              <View style={[styles.runBanner, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
                <View style={[styles.runDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.runText, { color: colors.accent }]}>
                  Analysing… {STEPS[currentStep].hint} will be processed here
                </Text>
              </View>
            )}

            {/* Placeholder note */}
            <View style={[styles.placeholderBox, { backgroundColor: colors.infoBg, borderColor: colors.info + "44" }]}>
              <Ionicons name="information-circle-outline" size={15} color={colors.info} />
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                Liveness AI model placeholder — {STEPS[currentStep].hint} will be integrated here
              </Text>
            </View>
          </View>

          {/* ── Steps checklist ── */}
          <View style={[styles.checklist, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {STEPS.map((step, i) => {
              const done   = completed[i];
              const active = i === currentStep;
              return (
                <View
                  key={step.key}
                  style={[
                    styles.checkRow,
                    i < STEPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.checkIcon, {
                    backgroundColor: done ? colors.successBg : active ? colors.primary + "22" : colors.surface,
                  }]}>
                    <Ionicons
                      name={step.icon}
                      size={17}
                      color={done ? colors.success : active ? colors.accent : colors.textMuted}
                    />
                  </View>
                  <Text style={[styles.checkLabel, {
                    color: done ? colors.success : active ? colors.foreground : colors.textMuted,
                    fontWeight: active ? "600" : "400",
                  }]}>
                    {step.label}
                  </Text>
                  {done && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                  {active && !done && (
                    <View style={[styles.activePill, { backgroundColor: colors.primary }]}>
                      <Text style={styles.activePillText}>Active</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Action button ── */}
          {!allDone && (
            <TouchableOpacity
              style={[styles.actionBtn, {
                backgroundColor: running ? colors.primaryDark : colors.primary,
                borderRadius: colors.radius,
              }]}
              onPress={runStep}
              disabled={running}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="eye-check-outline" size={22} color="#fff" />
              <Text style={styles.actionBtnText}>
                {running ? "Detecting…" : `Start: ${STEPS[currentStep].label}`}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },

  /* Worker banner */
  workerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  workerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  workerInfo: { flex: 1, gap: 2 },
  workerName: { fontSize: 15, fontWeight: "700" },
  workerMeta: { fontSize: 12 },
  workerRight: { alignItems: "flex-end", gap: 4 },
  confBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  confText: { fontSize: 12, fontWeight: "700" },
  identLabel: { fontSize: 10 },

  /* Purpose */
  purposeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  purposeText: { flex: 1, fontSize: 12, lineHeight: 17 },

  /* Progress stepper */
  progressRow: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1 },
  progressItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  progressCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  progressNum: { fontSize: 12, fontWeight: "700" },
  progressLine: { flex: 1, height: 2, marginHorizontal: 4 },

  /* Current step card */
  stepCard: { padding: 20, borderWidth: 1, gap: 10, alignItems: "center" },
  stepNum: { fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  stepTitle: { fontSize: 20, fontWeight: "700" },
  stepDesc: { fontSize: 14, textAlign: "center" },
  animArea: { marginVertical: 6 },
  outerRing: { width: 130, height: 130, borderRadius: 65, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  innerRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  iconCircle: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center" },
  runBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, alignSelf: "stretch" },
  runDot: { width: 8, height: 8, borderRadius: 4 },
  runText: { flex: 1, fontSize: 12 },
  placeholderBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, alignSelf: "stretch" },
  placeholderText: { flex: 1, fontSize: 11 },

  /* Checklist */
  checklist: { borderWidth: 1, overflow: "hidden" },
  checkRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  checkIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  checkLabel: { flex: 1, fontSize: 13 },
  activePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  activePillText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  /* Action */
  actionBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
