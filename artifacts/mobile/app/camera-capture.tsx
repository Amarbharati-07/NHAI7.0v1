import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FacePose,
  POSE_CONFIGS,
  captureImage,
} from "@/services/FaceCaptureService";
import { useColors } from "@/hooks/useColors";

export default function CameraCaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { pose, sessionId } = useLocalSearchParams<{ pose: FacePose; sessionId: string }>();

  const poseConfig = POSE_CONFIGS.find((p) => p.key === pose) ?? POSE_CONFIGS[0];

  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");

  const pulse = useSharedValue(1);
  const ovalBorder = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1,
      true
    );
    ovalBorder.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200 }), withTiming(0.4, { duration: 1200 })),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const handleCapture = async () => {
    if (capturing) return;
    setCapturing(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const result = await captureImage(sessionId, pose as FacePose);
      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else {
        setError("Camera was cancelled or permission denied.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Camera error");
    }
    setCapturing(false);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>
      {/* Dark camera BG */}
      <View style={styles.cameraBg}>
        {/* Vignette corners */}
        <View style={[styles.vignetteTL, { borderColor: colors.primary }]} />
        <View style={[styles.vignetteTR, { borderColor: colors.primary }]} />
        <View style={[styles.vignetteBL, { borderColor: colors.primary }]} />
        <View style={[styles.vignetteBR, { borderColor: colors.primary }]} />

        {/* Animated face oval */}
        <Animated.View style={[styles.ovalWrap, pulseStyle]}>
          <View style={[styles.oval, { borderColor: colors.primary + "99" }]}>
            <Ionicons name="person-outline" size={80} color={colors.primary + "55"} />
          </View>
        </Animated.View>

        {/* Scan line */}
        <Animated.View
          style={[styles.scanLine, { backgroundColor: colors.primary + "66" }]}
        />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topPad + 10 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: "rgba(0,0,0,0.5)" }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.poseBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.poseBadgeText}>{poseConfig.label}</Text>
        </View>
        <View style={styles.topRight} />
      </View>

      {/* Instruction card */}
      <View style={[styles.instrCard, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
        <View style={[styles.instrIcon, { backgroundColor: colors.primary + "33" }]}>
          <Ionicons name={poseConfig.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.accent} />
        </View>
        <View style={styles.instrText}>
          <Text style={styles.instrTitle}>{poseConfig.label}</Text>
          <Text style={styles.instrDesc}>{poseConfig.instruction}</Text>
        </View>
      </View>

      {/* Tips */}
      <View style={[styles.tipsRow, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
        {["Good lighting", "Face centred", "Hold still"].map((tip) => (
          <View key={tip} style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={13} color={colors.success} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      {/* Error */}
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive + "dd" }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#fff" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
        {/* Spacer */}
        <View style={styles.sideBtn} />

        {/* Shutter */}
        <TouchableOpacity
          style={styles.shutterOuter}
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.85}
        >
          <View style={[styles.shutterInner, { backgroundColor: capturing ? colors.primaryDark : "#fff" }]}>
            {capturing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : null}
          </View>
        </TouchableOpacity>

        {/* Flip icon placeholder */}
        <TouchableOpacity style={[styles.sideBtn, { backgroundColor: "rgba(255,255,255,0.15)" }]} activeOpacity={0.8}>
          <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  cameraBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0A0A14",
    alignItems: "center",
    justifyContent: "center",
  },
  vignetteTL: { position: "absolute", top: 80, left: 24, width: 36, height: 36, borderTopWidth: 3, borderLeftWidth: 3 },
  vignetteTR: { position: "absolute", top: 80, right: 24, width: 36, height: 36, borderTopWidth: 3, borderRightWidth: 3 },
  vignetteBL: { position: "absolute", bottom: 160, left: 24, width: 36, height: 36, borderBottomWidth: 3, borderLeftWidth: 3 },
  vignetteBR: { position: "absolute", bottom: 160, right: 24, width: 36, height: 36, borderBottomWidth: 3, borderRightWidth: 3 },

  ovalWrap: { alignItems: "center", justifyContent: "center" },
  oval: {
    width: 220,
    height: 290,
    borderRadius: 110,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  scanLine: {
    position: "absolute",
    width: 180,
    height: 2,
    borderRadius: 2,
    top: "45%",
  },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  poseBadge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 99,
  },
  poseBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  topRight: { width: 40 },

  instrCard: {
    position: "absolute",
    top: "58%",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
  },
  instrIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  instrText: { flex: 1, gap: 2 },
  instrTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  instrDesc: { color: "rgba(255,255,255,0.7)", fontSize: 12 },

  tipsRow: {
    position: "absolute",
    top: "72%",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 10,
    borderRadius: 10,
    gap: 6,
  },
  tipItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  tipText: { color: "rgba(255,255,255,0.8)", fontSize: 11 },

  errorBox: {
    position: "absolute",
    top: "80%",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  errorText: { color: "#fff", fontSize: 13, flex: 1 },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
});
