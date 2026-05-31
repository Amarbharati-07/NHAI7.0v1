import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import UnauthorizedDeviceScreen from "@/components/UnauthorizedDeviceScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/contexts/AdminDataContext";
import {
  type FacePose,
  POSE_CONFIGS,
  clearSession,
  getSessionCaptures,
  saveFaceImagesToDb,
} from "@/services/FaceCaptureService";
import { insertWorker } from "@/services/database";
import { useColors } from "@/hooks/useColors";

const TOTAL_POSES = POSE_CONFIGS.length;
const DEPARTMENTS = ["Civil", "Electrical", "Plumbing", "Security", "Admin", "Mechanical", "IT"];
const EMP_TYPES = ["Contract", "Permanent", "Temporary", "Daily Wage"];

/* ─── Module-level Field (never defined inside render) ─── */
interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  colors: ReturnType<typeof useColors>;
  returnKeyType?: "next" | "done" | "default";
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
}
function Field({
  label, placeholder, value, onChangeText, error,
  keyboardType = "default", maxLength, colors,
  returnKeyType, onSubmitEditing, inputRef,
}: FieldProps) {
  return (
    <View style={fst.group}>
      <Text style={[fst.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[fst.wrap, { backgroundColor: colors.surface, borderColor: error ? colors.destructive : colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[fst.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          maxLength={maxLength}
          returnKeyType={returnKeyType ?? "default"}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={!onSubmitEditing}
        />
      </View>
      {error ? <Text style={[fst.err, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}
const fst = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  wrap: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48, justifyContent: "center" },
  input: { fontSize: 14 },
  err: { fontSize: 11 },
});

/* ─── Module-level SelectField ─── */
interface SelectFieldProps {
  label: string; options: string[]; value: string;
  onChange: (v: string) => void; error?: string;
  colors: ReturnType<typeof useColors>;
}
function SelectField({ label, options, value, onChange, error, colors }: SelectFieldProps) {
  return (
    <View style={sst.group}>
      <Text style={[sst.label, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sst.scroll}>
        {options.map((opt) => {
          const sel = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[sst.chip, { backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(opt); }}
              activeOpacity={0.8}
            >
              <Text style={[sst.chipText, { color: sel ? "#fff" : colors.textSecondary }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {error ? <Text style={[sst.err, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}
const sst = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  scroll: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: "500" },
  err: { fontSize: 11 },
});

/* ─────────────────────────────────────────────────────────── */

interface FormState {
  workerId: string; fullName: string; mobile: string;
  department: string; contractorName: string;
  employeeType: string; siteLocation: string;
}

export default function RegisterWorkerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refresh: refreshAdminData } = useAdminData();
  const sessionId = useRef(`sess_${Date.now()}`).current;

  const fullNameRef   = useRef<TextInput>(null);
  const mobileRef     = useRef<TextInput>(null);
  const siteRef       = useRef<TextInput>(null);
  const contractorRef = useRef<TextInput>(null);

  /* Auto-inherit plaza name as siteLocation for operators */
  const inheritedSite = user?.plazaName ?? "";
  const [form, setForm] = useState<FormState>({
    workerId: "", fullName: "", mobile: "",
    department: "", contractorName: "", employeeType: "",
    siteLocation: inheritedSite,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);

  /* Captures refreshed on focus after returning from guided-face-capture */
  const [captures, setCaptures] = useState<Partial<Record<FacePose, string>>>({});
  const captureCount = Object.keys(captures).length;
  const allCaptured = captureCount === TOTAL_POSES;

  useFocusEffect(
    useCallback(() => {
      const session = getSessionCaptures(sessionId);
      const uris: Partial<Record<FacePose, string>> = {};
      for (const [pose, result] of Object.entries(session)) {
        uris[pose as FacePose] = result.uri;
      }
      setCaptures(uris);
    }, [sessionId])
  );

  const setField = useCallback((field: keyof FormState, val: string) => {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }, []);

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.workerId.trim()) e.workerId = "Worker ID is required";
    if (!form.fullName.trim()) e.fullName = "Full name is required";
    if (!form.department) e.department = "Department is required";
    if (!form.employeeType) e.employeeType = "Employee type is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleStartCapture = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/guided-face-capture", params: { sessionId } } as never);
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    try {
      const workerId = await insertWorker({
        ...form,
        plazaId:     user?.plazaId ?? "",
        operatorId:  user?.userId  ?? "",
        deviceToken: user?.deviceToken ?? "",
      });
      await saveFaceImagesToDb(workerId, sessionId);
      await clearSession(sessionId);
      await refreshAdminData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", `Worker ${form.fullName} registered successfully!`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Error", msg.includes("UNIQUE") ? "Worker ID already exists." : "Failed to register worker.");
    } finally {
      setLoading(false);
    }
  };

  /* Stable onChange handlers */
  const onChangeWorkerId    = useCallback((v: string) => setField("workerId", v), [setField]);
  const onChangeFullName    = useCallback((v: string) => setField("fullName", v), [setField]);
  const onChangeMobile      = useCallback((v: string) => setField("mobile", v), [setField]);
  const onChangeSite        = useCallback((v: string) => setField("siteLocation", v), [setField]);
  const onChangeContractor  = useCallback((v: string) => setField("contractorName", v), [setField]);
  const onChangeDept        = useCallback((v: string) => setField("department", v), [setField]);
  const onChangeEmpType     = useCallback((v: string) => setField("employeeType", v), [setField]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;
  const isOperator      = user?.role === "operator";
  const deviceBlocked   = isOperator && !user?.isDeviceAuthorized;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Register Worker" showBack onBack={() => router.back()} />

        {deviceBlocked && (
          <UnauthorizedDeviceScreen reason={user?.deviceVerifyReason} />
        )}

        {!deviceBlocked && <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Worker Information ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.secRow}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
              <Text style={[styles.secTitle, { color: colors.foreground }]}>Worker Information</Text>
            </View>
            <Field label="Worker ID *" placeholder="e.g. WRK007" value={form.workerId} onChangeText={onChangeWorkerId}
              error={errors.workerId} maxLength={20} colors={colors} returnKeyType="next"
              onSubmitEditing={() => fullNameRef.current?.focus()} />
            <Field label="Full Name *" placeholder="Enter full name" value={form.fullName} onChangeText={onChangeFullName}
              error={errors.fullName} colors={colors} inputRef={fullNameRef} returnKeyType="next"
              onSubmitEditing={() => mobileRef.current?.focus()} />
            <Field label="Mobile Number" placeholder="10-digit mobile number" value={form.mobile} onChangeText={onChangeMobile}
              keyboardType="phone-pad" maxLength={10} colors={colors} inputRef={mobileRef} returnKeyType="next"
              onSubmitEditing={() => contractorRef.current?.focus()} />
            {isOperator && inheritedSite ? (
              <View style={styles.siteRow}>
                <Text style={[styles.siteLabel, { color: colors.textSecondary }]}>Site Location</Text>
                <View style={[styles.siteBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
                  <Ionicons name="business-outline" size={13} color={colors.primary} />
                  <Text style={[styles.siteValue, { color: colors.primary }]}>{inheritedSite}</Text>
                  <View style={[styles.autoTag, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.autoTagText, { color: colors.primary }]}>auto</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Field label="Site Location" placeholder="e.g. Site-A Delhi" value={form.siteLocation} onChangeText={onChangeSite}
                colors={colors} inputRef={siteRef} returnKeyType="next"
                onSubmitEditing={() => contractorRef.current?.focus()} />
            )}
          </View>

          {/* ── Employment Details ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.secRow}>
              <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
              <Text style={[styles.secTitle, { color: colors.foreground }]}>Employment Details</Text>
            </View>
            <Field label="Contractor Name" placeholder="Contractor or company name" value={form.contractorName}
              onChangeText={onChangeContractor} colors={colors} inputRef={contractorRef} returnKeyType="done" />
            <SelectField label="Department *" options={DEPARTMENTS} value={form.department}
              onChange={onChangeDept} error={errors.department} colors={colors} />
            <SelectField label="Employee Type *" options={EMP_TYPES} value={form.employeeType}
              onChange={onChangeEmpType} error={errors.employeeType} colors={colors} />
          </View>

          {/* ── Face Capture ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.secRow}>
              <Ionicons name="scan-outline" size={18} color={colors.accent} />
              <Text style={[styles.secTitle, { color: colors.foreground }]}>Face Capture</Text>
              {/* Progress badge */}
              <View style={[styles.progBadge, { backgroundColor: allCaptured ? colors.successBg : colors.primary + "22" }]}>
                {allCaptured && <Ionicons name="checkmark" size={11} color={colors.success} />}
                <Text style={[styles.progText, { color: allCaptured ? colors.success : colors.accent }]}>
                  {captureCount}/{TOTAL_POSES}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={[styles.progBarBg, { backgroundColor: colors.surface }]}>
              <View style={[styles.progBarFill, {
                width: `${(captureCount / TOTAL_POSES) * 100}%` as never,
                backgroundColor: allCaptured ? colors.success : colors.primary,
              }]} />
            </View>

            {/* Pose indicator grid — read-only, shows status */}
            <View style={styles.poseGrid}>
              {POSE_CONFIGS.map((pose) => {
                const uri = captures[pose.key];
                const done = !!uri;
                return (
                  <View
                    key={pose.key}
                    style={[styles.poseCard, {
                      borderColor: done ? colors.success : colors.border,
                      backgroundColor: done ? colors.successBg + "55" : colors.surface,
                      borderRadius: 10,
                    }]}
                  >
                    {done && uri ? (
                      <>
                        <Image source={{ uri }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
                        <View style={[styles.checkBadge, { backgroundColor: colors.success }]}>
                          <Ionicons name="checkmark" size={11} color="#fff" />
                        </View>
                      </>
                    ) : (
                      <View style={[styles.poseIcon, { backgroundColor: colors.primary + "22" }]}>
                        <Ionicons name={pose.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.textMuted} />
                      </View>
                    )}
                    <Text style={[styles.poseLabel, { color: done ? colors.success : colors.textMuted }]}>
                      {pose.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* All done banner */}
            {allCaptured ? (
              <View style={[styles.doneBanner, { backgroundColor: colors.successBg, borderColor: colors.success + "44" }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[styles.doneBannerText, { color: colors.success }]}>
                  All 8 poses captured — worker is ready to register!
                </Text>
              </View>
            ) : (
              /* Start face capture CTA */
              <TouchableOpacity
                style={[styles.startCaptureBtn, { backgroundColor: colors.primary, borderRadius: 14 }]}
                onPress={handleStartCapture}
                activeOpacity={0.85}
              >
                <View style={[styles.startCaptureIcon, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                  <Ionicons name="scan-outline" size={22} color="#fff" />
                </View>
                <View style={styles.startCaptureText}>
                  <Text style={styles.startCapturePrimary}>
                    {captureCount > 0 ? "Continue Face Capture" : "Start Face Capture"}
                  </Text>
                  <Text style={styles.startCaptureSub}>
                    {captureCount > 0
                      ? `${captureCount} of ${TOTAL_POSES} poses done — tap to resume`
                      : `Guide through all ${TOTAL_POSES} poses automatically`}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Register button ── */}
          <TouchableOpacity
            style={[styles.registerBtn, {
              backgroundColor: allCaptured && !loading ? colors.primary : colors.muted,
              borderRadius: colors.radius,
              opacity: allCaptured ? 1 : 0.5,
            }]}
            onPress={handleSubmit}
            disabled={loading || !allCaptured}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={allCaptured ? "save-outline" : "lock-closed-outline"} size={20} color="#fff" />
                <Text style={styles.registerBtnText}>
                  {allCaptured ? "Register Worker" : "Complete face capture to enable"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>}
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16 },
  section: { padding: 16, borderWidth: 1, gap: 14 },
  secRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  secTitle: { flex: 1, fontSize: 15, fontWeight: "700" },

  /* Site Location read-only badge (operators) */
  siteRow: { gap: 5 },
  siteLabel: { fontSize: 12, fontWeight: "600" },
  siteBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  siteValue: { flex: 1, fontSize: 14, fontWeight: "600" },
  autoTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  autoTagText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },

  progBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  progText: { fontSize: 13, fontWeight: "800" },
  progBarBg: { height: 5, borderRadius: 3, overflow: "hidden" },
  progBarFill: { height: "100%", borderRadius: 3 },

  /* Pose indicator grid */
  poseGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  poseCard: {
    width: "22%",
    aspectRatio: 0.85,
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 6,
    borderWidth: 1.5,
    gap: 3,
    overflow: "hidden",
    position: "relative",
  },
  poseIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  thumb: { position: "absolute", top: 0, left: 0, right: 0, bottom: 16, borderRadius: 7 },
  checkBadge: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  poseLabel: { fontSize: 8, textAlign: "center", fontWeight: "600" },

  /* Done banner */
  doneBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  doneBannerText: { flex: 1, fontSize: 13, fontWeight: "600" },

  /* Start capture button */
  startCaptureBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  startCaptureIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  startCaptureText: { flex: 1, gap: 2 },
  startCapturePrimary: { color: "#fff", fontSize: 15, fontWeight: "700" },
  startCaptureSub: { color: "rgba(255,255,255,0.65)", fontSize: 12 },

  /* Register button */
  registerBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  registerBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
