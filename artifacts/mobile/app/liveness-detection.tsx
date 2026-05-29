/**
 * LivenessDetectionScreen
 *
 * Briefing screen shown after face recognition identifies a worker.
 * Explains the 4 liveness steps and launches the live camera workflow.
 *
 * Flow: attendance → liveness-detection (this) → liveness-camera → attendance-success
 */

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
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
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { useColors } from "@/hooks/useColors";

const STEPS = [
  { key: "blink",     label: "Blink Detection",       desc: "Blink your eyes twice naturally",          icon: "eye-outline" as const,           color: "#3B9EE8" },
  { key: "headLeft",  label: "Head Movement Left",     desc: "Slowly turn your head to the left",        icon: "arrow-back-outline" as const,    color: "#60A5FA" },
  { key: "headRight", label: "Head Movement Right",    desc: "Slowly turn your head to the right",       icon: "arrow-forward-outline" as const, color: "#34D399" },
  { key: "tracking",  label: "Eye Tracking",           desc: "Follow the moving dot with your eyes",     icon: "scan-circle-outline" as const,   color: "#F59E0B" },
];

export default function LivenessDetectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

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

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({
      pathname: "/liveness-camera",
      params: { workerName, workerId, department, confidence },
    } as never);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

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
              <Text style={[styles.faceLabel, { color: colors.textMuted }]}>Face matched</Text>
            </View>
          </View>

          {/* ── What is liveness? ── */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.infoHeader}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.infoTextBlock}>
                <Text style={[styles.infoTitle, { color: colors.foreground }]}>Why Liveness Detection?</Text>
                <Text style={[styles.infoDesc, { color: colors.textSecondary }]}>
                  Confirms you are a live, present person — not a photo, video, or mask. Required for every attendance mark.
                </Text>
              </View>
            </View>
          </View>

          {/* ── Steps to complete ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>4 Steps — Camera Required</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              The front camera will open and stay active through all steps.
              Complete each action when prompted.
            </Text>

            {STEPS.map((step, i) => (
              <View
                key={step.key}
                style={[
                  styles.stepRow,
                  i < STEPS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[styles.stepNum, { backgroundColor: step.color + "22", borderColor: step.color + "44" }]}>
                  <Text style={[styles.stepNumText, { color: step.color }]}>{i + 1}</Text>
                </View>
                <View style={[styles.stepIcon, { backgroundColor: step.color + "18" }]}>
                  <Ionicons name={step.icon} size={18} color={step.color} />
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepLabel, { color: colors.foreground }]}>{step.label}</Text>
                  <Text style={[styles.stepDesc,  { color: colors.textSecondary }]}>{step.desc}</Text>
                </View>
                <Ionicons name="camera-outline" size={14} color={colors.textMuted} />
              </View>
            ))}
          </View>

          {/* ── Instructions ── */}
          <View style={[styles.tipsCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.tipsTitle, { color: colors.foreground }]}>Tips for best results</Text>
            {[
              { icon: "sunny-outline" as const,          tip: "Find a well-lit area — avoid backlighting" },
              { icon: "glasses-outline" as const,        tip: "Remove glasses or sunglasses if possible" },
              { icon: "phone-portrait-outline" as const, tip: "Hold the device at eye level, stable" },
              { icon: "walk-outline" as const,           tip: "Perform each action slowly and clearly" },
            ].map(({ icon, tip }) => (
              <View key={tip} style={styles.tipRow}>
                <Ionicons name={icon} size={15} color={colors.accent} />
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>{tip}</Text>
              </View>
            ))}
          </View>

          {/* ── Start button ── */}
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <View style={[styles.startIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <Ionicons name="camera" size={22} color="#fff" />
            </View>
            <View style={styles.startText}>
              <Text style={styles.startPrimary}>Start Liveness Check</Text>
              <Text style={styles.startSub}>Opens front camera · 4 steps · ~30 seconds</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },

  /* Worker banner */
  workerBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  workerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  workerInfo: { flex: 1, gap: 2 },
  workerName: { fontSize: 15, fontWeight: "700" },
  workerMeta: { fontSize: 12 },
  workerRight: { alignItems: "flex-end", gap: 4 },
  confBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  confText: { fontSize: 12, fontWeight: "700" },
  faceLabel: { fontSize: 10 },

  /* Info card */
  infoCard: { padding: 14, borderWidth: 1 },
  infoHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoTextBlock: { flex: 1, gap: 4 },
  infoTitle: { fontSize: 14, fontWeight: "700" },
  infoDesc: { fontSize: 12, lineHeight: 18 },

  /* Steps section */
  section: { borderWidth: 1, overflow: "hidden", padding: 14, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  sectionSub: { fontSize: 12, lineHeight: 17, marginTop: -4 },
  stepRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 11, fontWeight: "800" },
  stepIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1, gap: 2 },
  stepLabel: { fontSize: 13, fontWeight: "600" },
  stepDesc: { fontSize: 11 },

  /* Tips */
  tipsCard: { padding: 14, borderWidth: 1, gap: 10 },
  tipsTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 17 },

  /* Start button */
  startBtn: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  startIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  startText: { flex: 1, gap: 2 },
  startPrimary: { color: "#fff", fontSize: 16, fontWeight: "700" },
  startSub: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});
