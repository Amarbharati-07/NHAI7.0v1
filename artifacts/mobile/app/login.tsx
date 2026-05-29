import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const { height: SCREEN_H } = Dimensions.get("window");

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef<TextInput>(null);
  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 60 })
    );
  };

  const handleLogin = async () => {
    if (!userId.trim() || !password.trim()) {
      setError("Please enter User ID and Password.");
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    setError("");
    const success = await login(userId.trim(), password);
    setLoading(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard");
    } else {
      setError("Invalid User ID or Password. Please try again.");
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 20, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={[styles.logoOuter, { borderColor: colors.primary + "44" }]}>
            <View style={[styles.logoInner, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "66" }]}>
              <View style={[styles.logoCore, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="face-recognition" size={36} color="#fff" />
              </View>
            </View>
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>SpectraID</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Offline Facial Recognition & Attendance System
          </Text>

          {/* Security badge */}
          <View style={[styles.securityBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark" size={14} color={colors.success} />
            <Text style={[styles.securityText, { color: colors.textSecondary }]}>
              Government-Grade Secure System
            </Text>
          </View>
        </View>

        {/* Login Card */}
        <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }, shakeStyle]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>System Login</Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Admin-created accounts only</Text>

          {/* User ID */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>User ID</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: error && !userId ? colors.destructive : colors.border }]}>
              <Ionicons name="person-outline" size={18} color={colors.accent} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Enter your User ID"
                placeholderTextColor={colors.mutedForeground}
                value={userId}
                onChangeText={(t) => { setUserId(t); setError(""); }}
                autoCapitalize="characters"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: error && !password ? colors.destructive : colors.border }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.accent} style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(""); }}
                secureTextEntry={!showPw}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={styles.eyeBtn}>
                <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44" }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: loading ? colors.primaryDark : colors.primary, borderRadius: colors.radius }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginBtnText}>Login to System</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Demo hint */}
          <View style={[styles.demoHint, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
            <Text style={[styles.demoText, { color: colors.textMuted }]}>Demo: ADMIN001 / admin123  •  OPR001 / opr123</Text>
          </View>
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            SpectraID © 2025  •  All rights reserved
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  logoArea: { alignItems: "center", marginBottom: 36, gap: 10 },
  logoOuter: { width: 110, height: 110, borderRadius: 55, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  logoInner: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  logoCore: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  appName: { fontSize: 32, fontWeight: "800", letterSpacing: 1 },
  tagline: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  securityBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, marginTop: 4 },
  securityText: { fontSize: 11, fontWeight: "600" },
  card: { padding: 24, borderWidth: 1, gap: 16, marginBottom: 24 },
  cardTitle: { fontSize: 22, fontWeight: "700" },
  cardSub: { fontSize: 13, marginTop: -8 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 52 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  eyeBtn: { padding: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 8, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 13 },
  loginBtn: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 4 },
  loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  demoHint: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  demoText: { fontSize: 11, flex: 1 },
  footer: { alignItems: "center", marginTop: 8 },
  footerText: { fontSize: 11 },
});
