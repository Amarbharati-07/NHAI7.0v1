import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [scanning, setScanning] = useState(false);

  const startScan = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      router.push("/liveness-detection");
    }, 2500);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Mark Attendance" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>

          {/* Camera Placeholder */}
          <View style={[styles.cameraWrap, { borderColor: colors.primary, backgroundColor: colors.card }]}>
            <View style={[styles.cameraView, { backgroundColor: colors.header }]}>
              {/* Corner brackets */}
              {[styles.tl, styles.tr, styles.bl, styles.br].map((pos, i) => (
                <View key={i} style={[styles.corner, pos, { borderColor: colors.primary }]} />
              ))}

              <View style={styles.cameraCenter}>
                {scanning ? (
                  <>
                    <View style={[styles.scanLine, { backgroundColor: colors.primary }]} />
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.scanningText, { color: colors.accent }]}>Scanning face…</Text>
                  </>
                ) : (
                  <>
                    <MaterialCommunityIcons name="face-recognition" size={64} color={colors.primary + "88"} />
                    <Text style={[styles.scanPrompt, { color: colors.textSecondary }]}>Position face in frame</Text>
                  </>
                )}
              </View>
            </View>

            {/* Placeholder banner */}
            <View style={[styles.placeholderBanner, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}>
              <Ionicons name="information-circle" size={18} color={colors.accent} />
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                Face Recognition Model Will Be Integrated Here
              </Text>
            </View>
          </View>

          {/* Instructions */}
          <View style={[styles.instrCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.instrTitle, { color: colors.foreground }]}>Instructions</Text>
            {[
              "Ensure face is well-lit and visible",
              "Remove glasses or face coverings",
              "Look directly at camera",
              "Keep device stable during scan",
            ].map((inst, i) => (
              <View key={i} style={styles.instrRow}>
                <View style={[styles.instrDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.instrText, { color: colors.textSecondary }]}>{inst}</Text>
              </View>
            ))}
          </View>

          {/* Status Cards */}
          <View style={styles.statusRow}>
            {[
              { icon: "wifi-outline" as const, label: "Offline Mode", value: "Active", color: colors.success },
              { icon: "phone-portrait-outline" as const, label: "Camera", value: "Ready", color: colors.accent },
              { icon: "lock-closed-outline" as const, label: "Liveness", value: "Enabled", color: colors.warning },
            ].map((s, i) => (
              <View key={i} style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Ionicons name={s.icon} size={20} color={s.color} />
                <Text style={[styles.statusVal, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.statusLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Scan Button */}
          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: scanning ? colors.primaryDark : colors.primary, borderRadius: colors.radius }]}
            onPress={startScan}
            disabled={scanning}
            activeOpacity={0.85}
          >
            {scanning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="face-recognition" size={24} color="#fff" />
                <Text style={styles.scanBtnText}>Start Face Scan</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16 },
  cameraWrap: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  cameraView: { height: 280, alignItems: "center", justifyContent: "center", position: "relative" },
  corner: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  tl: { top: 16, left: 16, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 16, right: 16, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 16, left: 16, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 16, right: 16, borderLeftWidth: 0, borderTopWidth: 0 },
  cameraCenter: { alignItems: "center", gap: 12 },
  scanLine: { position: "absolute", width: 120, height: 2, top: 0, borderRadius: 2 },
  scanningText: { fontSize: 14, fontWeight: "600" },
  scanPrompt: { fontSize: 14 },
  placeholderBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1 },
  placeholderText: { flex: 1, fontSize: 12 },
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
});
