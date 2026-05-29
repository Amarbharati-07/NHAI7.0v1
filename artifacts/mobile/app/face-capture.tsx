import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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

const POSES = [
  { key: "front", label: "Front Face", instruction: "Look straight at camera" },
  { key: "left", label: "Left Profile", instruction: "Turn head to the left" },
  { key: "right", label: "Right Profile", instruction: "Turn head to the right" },
  { key: "up", label: "Face Up", instruction: "Tilt face upward slightly" },
  { key: "down", label: "Face Down", instruction: "Tilt face downward slightly" },
  { key: "smile", label: "Smile", instruction: "Give a natural smile" },
  { key: "blink", label: "Blink", instruction: "Blink both eyes naturally" },
  { key: "neutral", label: "Neutral", instruction: "Relax your face completely" },
];

export default function FaceCaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentPose, setCurrentPose] = useState(0);
  const [captured, setCaptured] = useState<string[]>([]);

  const capture = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const key = POSES[currentPose].key;
    setCaptured((prev) => [...prev.filter((k) => k !== key), key]);
    if (currentPose < POSES.length - 1) {
      setTimeout(() => setCurrentPose((p) => p + 1), 400);
    }
  };

  const retake = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCaptured((prev) => prev.filter((k) => k !== POSES[currentPose].key));
  };

  const isDone = captured.includes(POSES[currentPose].key);
  const allCaptured = captured.length === POSES.length;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Face Capture" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>

          {/* Progress */}
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressTitle, { color: colors.foreground }]}>Capture Progress</Text>
              <Text style={[styles.progressCount, { color: colors.accent }]}>{captured.length}/{POSES.length}</Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.surface }]}>
              <View style={[styles.progressFill, { width: `${(captured.length / POSES.length) * 100}%` as never, backgroundColor: colors.primary }]} />
            </View>
            <View style={styles.poseDotsRow}>
              {POSES.map((p, i) => (
                <View
                  key={p.key}
                  style={[styles.poseDot, {
                    backgroundColor: captured.includes(p.key) ? colors.success : i === currentPose ? colors.primary : colors.surface,
                    borderColor: i === currentPose ? colors.primary : "transparent",
                  }]}
                />
              ))}
            </View>
          </View>

          {/* Camera area */}
          <View style={[styles.cameraCard, { backgroundColor: colors.card, borderColor: isDone ? colors.success : colors.primary, borderRadius: colors.radius }]}>
            <View style={[styles.cameraView, { backgroundColor: colors.header }]}>
              {/* Corner brackets */}
              {[styles.tl, styles.tr, styles.bl, styles.br].map((pos, i) => (
                <View key={i} style={[styles.corner, pos, { borderColor: isDone ? colors.success : colors.primary }]} />
              ))}
              {/* Face oval guide */}
              <View style={[styles.faceOval, { borderColor: isDone ? colors.success + "88" : colors.primary + "66" }]}>
                {isDone ? (
                  <View style={[styles.capturedOverlay, { backgroundColor: colors.success + "22" }]}>
                    <Ionicons name="checkmark-circle" size={60} color={colors.success} />
                    <Text style={[styles.capturedText, { color: colors.success }]}>Captured!</Text>
                  </View>
                ) : (
                  <Ionicons name="person-outline" size={64} color={colors.primary + "66"} />
                )}
              </View>
              {/* Current pose label */}
              <View style={[styles.poseBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.poseBadgeText}>{POSES[currentPose].label}</Text>
              </View>
            </View>

            {/* Instruction */}
            <View style={styles.instrRow}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.instrText, { color: colors.textSecondary }]}>{POSES[currentPose].instruction}</Text>
            </View>

            {/* Placeholder banner */}
            <View style={[styles.placeholder, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}>
              <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                Face Recognition Camera API — Integration Pending
              </Text>
            </View>
          </View>

          {/* Capture buttons */}
          <View style={styles.btnsRow}>
            {isDone && (
              <TouchableOpacity
                style={[styles.retakeBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                onPress={retake}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.retakeBtnText, { color: colors.textSecondary }]}>Retake</Text>
              </TouchableOpacity>
            )}
            {!isDone && (
              <TouchableOpacity
                style={[styles.captureBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={capture}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={22} color="#fff" />
                <Text style={styles.captureBtnText}>Capture</Text>
              </TouchableOpacity>
            )}
            {isDone && currentPose < POSES.length - 1 && (
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
                onPress={() => setCurrentPose((p) => p + 1)}
                activeOpacity={0.85}
              >
                <Text style={styles.nextBtnText}>Next Pose</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Pose list */}
          <View style={[styles.poseList, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {POSES.map((pose, i) => {
              const done = captured.includes(pose.key);
              const active = i === currentPose;
              return (
                <TouchableOpacity
                  key={pose.key}
                  style={[styles.poseRow, i < POSES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  onPress={() => setCurrentPose(i)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.poseDotLg, {
                    backgroundColor: done ? colors.successBg : active ? colors.primary + "22" : colors.surface,
                  }]}>
                    {done
                      ? <Ionicons name="checkmark" size={14} color={colors.success} />
                      : <Text style={[styles.poseNum, { color: active ? colors.accent : colors.textMuted }]}>{i + 1}</Text>
                    }
                  </View>
                  <View style={styles.poseMeta}>
                    <Text style={[styles.poseName, { color: done ? colors.success : active ? colors.foreground : colors.textSecondary, fontWeight: active ? "600" : "400" }]}>{pose.label}</Text>
                    <Text style={[styles.poseInstr, { color: colors.textMuted }]}>{pose.instruction}</Text>
                  </View>
                  {done && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {allCaptured && (
            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.doneBtnText}>All Poses Captured — Done</Text>
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
  progressCard: { padding: 14, borderWidth: 1, gap: 10 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTitle: { fontSize: 14, fontWeight: "600" },
  progressCount: { fontSize: 14, fontWeight: "700" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  poseDotsRow: { flexDirection: "row", gap: 6 },
  poseDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  cameraCard: { borderWidth: 1.5, overflow: "hidden" },
  cameraView: { height: 260, alignItems: "center", justifyContent: "center", position: "relative" },
  corner: { position: "absolute", width: 26, height: 26, borderWidth: 3 },
  tl: { top: 14, left: 14, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 14, right: 14, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 14, left: 14, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 14, right: 14, borderLeftWidth: 0, borderTopWidth: 0 },
  faceOval: { width: 140, height: 180, borderRadius: 70, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  capturedOverlay: { width: "100%", height: "100%", borderRadius: 70, alignItems: "center", justifyContent: "center", gap: 8 },
  capturedText: { fontSize: 14, fontWeight: "700" },
  poseBadge: { position: "absolute", bottom: 14, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99 },
  poseBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  instrRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 0 },
  instrText: { flex: 1, fontSize: 13 },
  placeholder: { flexDirection: "row", padding: 10, borderTopWidth: 1, justifyContent: "center" },
  placeholderText: { fontSize: 11 },
  btnsRow: { flexDirection: "row", gap: 12 },
  retakeBtn: { flex: 1, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  retakeBtnText: { fontSize: 14, fontWeight: "600" },
  captureBtn: { flex: 1, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  captureBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  nextBtn: { flex: 1, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  nextBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  poseList: { borderWidth: 1, overflow: "hidden" },
  poseRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  poseDotLg: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  poseNum: { fontSize: 13, fontWeight: "700" },
  poseMeta: { flex: 1, gap: 2 },
  poseName: { fontSize: 13 },
  poseInstr: { fontSize: 11 },
  doneBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  doneBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
