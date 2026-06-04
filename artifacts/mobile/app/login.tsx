import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
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
import { friendlyConnectionMessage, friendlyErrorMessage } from "@/services/userMessages";

const TOLL_BG = require("../assets/images/toll-plaza.png");
const NHAI_LOGO = require("../assets/images/icon.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordRef = useRef<TextInput>(null);
  const shakeX = useSharedValue(0);

  const onChangeUserId = useCallback((t: string) => {
    setUserId(t);
    setError("");
  }, []);

  const onChangePassword = useCallback((t: string) => {
    setPassword(t);
    setError("");
  }, []);

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
    if (loading) return;
    if (!userId.trim() || !password.trim()) {
      setError("Please enter User ID and Password.");
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await login(userId.trim(), password);
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/dashboard");
      } else {
        setError(result.error ?? "Invalid User ID or Password. Please try again.");
        shake();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err) {
      setError(friendlyErrorMessage(err, friendlyConnectionMessage()));
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={TOLL_BG} style={styles.bg} resizeMode="cover">
      {/* Dark navy overlay */}
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            {/* NHAI Logo circle */}
            <View style={styles.logoRing}>
              <Image source={NHAI_LOGO} style={styles.logoImg} contentFit="contain" />
            </View>

            <Text style={styles.nhaiLabel}>NATIONAL HIGHWAYS AUTHORITY OF INDIA</Text>

            {/* App name: Spectra white + ID blue */}
            <Text style={styles.appName}>
              <Text style={styles.appNameWhite}>Spectral</Text>
              <Text style={styles.appNameBlue}>ID</Text>
            </Text>

            <Text style={styles.tagline}>Offline Facial Recognition & Attendance System</Text>

            {/* Security badge */}
            <View style={styles.secBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#4ADE80" />
              <Text style={styles.secText}>Government-Grade Secure System</Text>
            </View>
          </View>

          {/* ── Login Card ── */}
          <Animated.View style={[styles.card, shakeStyle]}>
            {/* Card lock icon */}
            <View style={styles.cardIconWrap}>
              <View style={styles.cardIconRing}>
                <MaterialCommunityIcons name="shield-lock-outline" size={26} color="#1A56DB" />
              </View>
            </View>

            <Text style={styles.cardTitle}>System Login</Text>
            <Text style={styles.cardSub}>Admin-created accounts only</Text>

            {/* User ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>User ID</Text>
              <View style={[styles.inputWrap, error && !password ? styles.inputError : null]}>
                <Ionicons name="person-outline" size={18} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your User ID"
                  placeholderTextColor="#9CA3AF"
                  value={userId}
                  onChangeText={onChangeUserId}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={onChangePassword}
                  secureTextEntry={!showPw}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Login button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnLoading]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="login" size={20} color="#fff" />
                  <Text style={styles.loginBtnText}>Login to System</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Demo hint */}
            <View style={styles.demoBox}>
              <Ionicons name="information-circle-outline" size={15} color="#1A56DB" />
              <Text style={styles.demoText}>
                <Text style={styles.demoLabel}>Demo Credentials: </Text>
                ADMIN001 / admin123{"  •  "}OPR001 / opr123
              </Text>
            </View>

            {typeof __DEV__ !== "undefined" && __DEV__ ? (
              <TouchableOpacity
                style={styles.diagnosticLink}
                onPress={() => router.push("/network-diagnostic")}
                activeOpacity={0.85}
              >
                <Text style={styles.diagnosticLinkText}>Open Network Diagnostic</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>

          {/* ── Feature Pills ── */}
          <View style={styles.features}>
            <FeatureItem icon="shield-checkmark-outline" label="Secure" />
            <FeatureItem icon="cloud-offline-outline" label="Offline First" />
            <FeatureItem icon="scan-outline" label="Face Recognition" />
            <FeatureItem icon="lock-closed-outline" label="Data Protected" />
          </View>

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <View style={styles.footerLogo}>
              <Image source={NHAI_LOGO} style={styles.footerLogoImg} contentFit="contain" />
              <View>
                <Text style={styles.footerTitle}>NHAI Workforce Operations</Text>
                <Text style={styles.footerCopy}>© 2026 National Highways Authority of India. All rights reserved.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function FeatureItem({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon} size={22} color="rgba(255,255,255,0.85)" />
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 15, 50, 0.82)",
  },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

  /* Header */
  header: { alignItems: "center", marginBottom: 28, gap: 8 },
  logoRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logoImg: { width: 60, height: 60, borderRadius: 30 },
  nhaiLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  appName: { fontSize: 36, fontWeight: "800", letterSpacing: 0.5 },
  appNameWhite: { color: "#FFFFFF" },
  appNameBlue: { color: "#4D94FF" },
  tagline: { fontSize: 13, color: "rgba(255,255,255,0.72)", textAlign: "center" },
  secBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    marginTop: 2,
  },
  secText: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.88)" },

  /* Card */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    paddingTop: 20,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  cardIconWrap: { alignItems: "center", marginBottom: 2 },
  cardIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EBF2FF",
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 22, fontWeight: "700", color: "#111827", textAlign: "center", marginTop: -4 },
  cardSub: { fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: -8 },

  /* Fields */
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    backgroundColor: "#F9FAFB",
  },
  inputError: { borderColor: "#FCA5A5" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: "#111827" },
  eyeBtn: { padding: 4 },

  /* Error */
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 10,
    borderRadius: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: "#EF4444" },

  /* Button */
  loginBtn: {
    height: 54,
    backgroundColor: "#1A56DB",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 2,
    shadowColor: "#1A56DB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  loginBtnLoading: { backgroundColor: "#3B82F6" },
  loginBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  /* Demo */
  demoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 10,
    borderRadius: 10,
  },
  demoText: { flex: 1, fontSize: 12, color: "#374151", lineHeight: 18 },
  demoLabel: { fontWeight: "700", color: "#1A56DB" },
  diagnosticLink: {
    alignSelf: "center",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(26, 86, 219, 0.10)",
  },
  diagnosticLinkText: { color: "#1A56DB", fontSize: 12, fontWeight: "700" },

  /* Features */
  features: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 24,
    paddingHorizontal: 8,
  },
  featureItem: { alignItems: "center", gap: 6 },
  featureLabel: { fontSize: 10.5, color: "rgba(255,255,255,0.75)", fontWeight: "600", textAlign: "center" },

  /* Footer */
  footer: { alignItems: "center", marginTop: 20 },
  footerLogo: { flexDirection: "row", alignItems: "center", gap: 10 },
  footerLogoImg: { width: 32, height: 32, borderRadius: 16 },
  footerTitle: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.8)" },
  footerCopy: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 },
});
