import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import GeofenceGate from "@/components/GeofenceGate";
import UnauthorizedDeviceScreen from "@/components/UnauthorizedDeviceScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, refreshDeviceAuth } = useAuth();

  const isOperator = user?.role === "operator";
  const deviceBlocked = isOperator && user?.isDeviceAuthorized === false;
  const geofenceBlocked = isOperator && user?.geofenceAllowed === false;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  useFocusEffect(
    useCallback(() => {
      if (user?.role === "operator") {
        void refreshDeviceAuth();
      }
    }, [refreshDeviceAuth, user?.role])
  );

  const handleMarkAttendance = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const refreshed = await refreshDeviceAuth();
    const current = refreshed ?? user;
    if (current?.role === "operator" && current.geofenceAllowed === false) {
      const configuredMessage = current.geofenceMessage?.startsWith("Plaza GPS coordinates not configured")
        ? "Plaza GPS coordinates not configured"
        : current.geofenceMessage ?? "You are outside the authorized toll plaza location. Attendance operations are not allowed.";
      Alert.alert(
        configuredMessage === "Plaza GPS coordinates not configured"
          ? "Plaza GPS coordinates not configured"
          : "Outside Authorized Toll Plaza",
        configuredMessage,
      );
      return;
    }
    router.push({
      pathname: "/guided-face-capture",
      params: { mode: "attendance", workerName: user?.name ?? "", workerId: user?.userId ?? "" },
    } as never);
  };

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Mark Attendance" showBack onBack={() => router.back()} />

        {deviceBlocked ? (
          <UnauthorizedDeviceScreen reason={user?.deviceVerifyReason} />
        ) : geofenceBlocked ? (
          <GeofenceGate
            plazaName={user?.plazaName}
            distanceMeters={user?.geofenceDistanceMeters ?? null}
            radiusMeters={user?.plazaRadiusMeters ?? null}
            message={user?.geofenceMessage}
            onRetry={() => { void refreshDeviceAuth(); }}
            onBack={() => router.back()}
          />
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
            {isOperator && user?.plazaName ? (
              <View style={[styles.contextBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "22" }]}>
                <Ionicons name="business-outline" size={14} color={colors.primary} />
                <Text style={[styles.contextText, { color: colors.primary }]}>
                  {user.plazaName} · {user.userId}
                </Text>
                <View style={[styles.authBadge, { backgroundColor: colors.success + "22" }]}>
                  <Ionicons name="shield-checkmark-outline" size={11} color={colors.success} />
                  <Text style={[styles.authBadgeText, { color: colors.success }]}>Authorized</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.heroIcon, { backgroundColor: colors.primary + "15" }]}>
                <MaterialCommunityIcons name="face-recognition" size={36} color={colors.primary} />
              </View>
              <Text style={[styles.heroTitle, { color: colors.foreground }]}>One-tap attendance</Text>
              <Text style={[styles.heroText, { color: colors.textSecondary }]}>
                Tap Mark Attendance to open the same guided front-camera flow used for worker registration. Face scan, recognition, and liveness all run automatically in one place.
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              {[
                "Front camera opens automatically",
                "Face recognition starts immediately",
                "Liveness verification follows without extra buttons",
                "Success routes directly to the attendance confirmation screen",
              ].map((item, index) => (
                <View key={index} style={styles.infoRow}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={handleMarkAttendance}
              activeOpacity={0.85}
            >
              <View style={[styles.ctaIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                <Ionicons name="camera" size={22} color="#fff" />
              </View>
              <View style={styles.ctaTextWrap}>
                <Text style={styles.ctaTitle}>Mark Attendance</Text>
                <Text style={styles.ctaSub}>Open camera and verify face automatically</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.8)" />
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
  contextBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderRadius: 14 },
  contextText: { flex: 1, fontSize: 12, fontWeight: "700" },
  authBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  authBadgeText: { fontSize: 11, fontWeight: "700" },
  heroCard: { borderWidth: 1, padding: 18, gap: 10, alignItems: "center" },
  heroIcon: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  infoCard: { borderWidth: 1, padding: 16, gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 99 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
  cta: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  ctaIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaTextWrap: { flex: 1, gap: 2 },
  ctaTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  ctaSub: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
});
