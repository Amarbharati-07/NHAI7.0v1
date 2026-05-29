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

/* ─────────────────────────────────────────────────────────────
   Module-level Field — NEVER defined inside a render function.
   Defining components inside render causes React to treat them
   as brand-new types on every parent re-render, unmounting the
   TextInput and losing keyboard focus after each keystroke.
───────────────────────────────────────────────────────────── */
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
    <View style={fieldStyles.group}>
      <Text style={[fieldStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[fieldStyles.wrap, { backgroundColor: colors.surface, borderColor: error ? colors.destructive : colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[fieldStyles.input, { color: colors.foreground }]}
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
      {error ? <Text style={[fieldStyles.err, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  wrap: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48, justifyContent: "center" },
  input: { fontSize: 14 },
  err: { fontSize: 11 },
});

/* ──────────────────────────────────────────────────────────── */
interface SelectFieldProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  colors: ReturnType<typeof useColors>;
}

function SelectField({ label, options, value, onChange, error, colors }: SelectFieldProps) {
  return (
    <View style={selStyles.group}>
      <Text style={[selStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={selStyles.scroll}>
        {options.map((opt) => {
          const sel = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[selStyles.chip, { backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(opt); }}
              activeOpacity={0.8}
            >
              <Text style={[selStyles.chipText, { color: sel ? "#fff" : colors.textSecondary }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {error ? <Text style={[selStyles.err, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const selStyles = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  scroll: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: "500" },
  err: { fontSize: 11 },
});

/* ──────────────────────────────────────────────────────────── */

interface FormState {
  workerId: string;
  fullName: string;
  mobile: string;
  department: string;
  contractorName: string;
  employeeType: string;
  siteLocation: string;
}

export default function RegisterWorkerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  /* Stable session ID for this registration attempt */
  const sessionId = useRef(`sess_${Date.now()}`).current;

  /* Refs for keyboard navigation */
  const fullNameRef = useRef<TextInput>(null);
  const mobileRef = useRef<TextInput>(null);
  const siteRef = useRef<TextInput>(null);
  const contractorRef = useRef<TextInput>(null);

  const [form, setForm] = useState<FormState>({
    workerId: "",
    fullName: "",
    mobile: "",
    department: "",
    contractorName: "",
    employeeType: "",
    siteLocation: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);

  /* Captured images refreshed on focus (after returning from camera) */
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

  /* Field setters — stable references via useCallback */
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

  const openCamera = (pose: FacePose) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/camera-capture", params: { pose, sessionId } } as never);
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!allCaptured) {
      Alert.alert("Face Capture Required", "Please capture all 8 face poses before registering.");
      return;
    }
    setLoading(true);
    try {
      const workerId = await insertWorker(form);
      await saveFaceImagesToDb(workerId, sessionId);
      await clearSession(sessionId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", `Worker ${form.fullName} registered successfully!`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Error", msg.includes("UNIQUE") ? "Worker ID already exists." : "Failed to register worker.");
    }
    setLoading(false);
  };

  /* Memoised onChange handlers — one per field, stable across renders */
  const onChangeWorkerId    = useCallback((v: string) => setField("workerId", v), [setField]);
  const onChangeFullName    = useCallback((v: string) => setField("fullName", v), [setField]);
  const onChangeMobile      = useCallback((v: string) => setField("mobile", v), [setField]);
  const onChangeSiteLocation = useCallback((v: string) => setField("siteLocation", v), [setField]);
  const onChangeContractor  = useCallback((v: string) => setField("contractorName", v), [setField]);
  const onChangeDepartment  = useCallback((v: string) => setField("department", v), [setField]);
  const onChangeEmpType     = useCallback((v: string) => setField("employeeType", v), [setField]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Register Worker" showBack onBack={() => router.back()} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Worker Information ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Worker Information</Text>
            </View>
            <Field
              label="Worker ID *"
              placeholder="e.g. WRK007"
              value={form.workerId}
              onChangeText={onChangeWorkerId}
              error={errors.workerId}
              maxLength={20}
              colors={colors}
              returnKeyType="next"
              onSubmitEditing={() => fullNameRef.current?.focus()}
            />
            <Field
              label="Full Name *"
              placeholder="Enter full name"
              value={form.fullName}
              onChangeText={onChangeFullName}
              error={errors.fullName}
              colors={colors}
              inputRef={fullNameRef}
              returnKeyType="next"
              onSubmitEditing={() => mobileRef.current?.focus()}
            />
            <Field
              label="Mobile Number"
              placeholder="10-digit mobile number"
              value={form.mobile}
              onChangeText={onChangeMobile}
              keyboardType="phone-pad"
              maxLength={10}
              colors={colors}
              inputRef={mobileRef}
              returnKeyType="next"
              onSubmitEditing={() => siteRef.current?.focus()}
            />
            <Field
              label="Site Location"
              placeholder="e.g. Site-A Delhi"
              value={form.siteLocation}
              onChangeText={onChangeSiteLocation}
              colors={colors}
              inputRef={siteRef}
              returnKeyType="next"
              onSubmitEditing={() => contractorRef.current?.focus()}
            />
          </View>

          {/* ── Employment Details ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Employment Details</Text>
            </View>
            <Field
              label="Contractor Name"
              placeholder="Contractor or company name"
              value={form.contractorName}
              onChangeText={onChangeContractor}
              colors={colors}
              inputRef={contractorRef}
              returnKeyType="done"
            />
            <SelectField
              label="Department *"
              options={DEPARTMENTS}
              value={form.department}
              onChange={onChangeDepartment}
              error={errors.department}
              colors={colors}
            />
            <SelectField
              label="Employee Type *"
              options={EMP_TYPES}
              value={form.employeeType}
              onChange={onChangeEmpType}
              error={errors.employeeType}
              colors={colors}
            />
          </View>

          {/* ── Face Capture ── */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="scan-outline" size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Face Capture</Text>
              <View style={[styles.progressBadge, { backgroundColor: allCaptured ? colors.successBg : colors.primary + "22" }]}>
                {allCaptured && <Ionicons name="checkmark" size={12} color={colors.success} />}
                <Text style={[styles.progressText, { color: allCaptured ? colors.success : colors.accent }]}>
                  {captureCount}/{TOTAL_POSES}
                </Text>
              </View>
            </View>

            <View style={[styles.progressBarBg, { backgroundColor: colors.surface }]}>
              <View
                style={[styles.progressBarFill, {
                  width: `${(captureCount / TOTAL_POSES) * 100}%` as never,
                  backgroundColor: allCaptured ? colors.success : colors.primary,
                }]}
              />
            </View>

            <Text style={[styles.faceSub, { color: colors.textSecondary }]}>
              Tap each pose card to open the camera. All 8 poses are required to register.
            </Text>

            <View style={styles.faceGrid}>
              {POSE_CONFIGS.map((pose) => {
                const capturedUri = captures[pose.key];
                const done = !!capturedUri;
                return (
                  <TouchableOpacity
                    key={pose.key}
                    style={[styles.faceCard, {
                      borderColor: done ? colors.success : colors.border,
                      backgroundColor: done ? colors.successBg + "44" : colors.surface,
                      borderRadius: colors.radius,
                    }]}
                    onPress={() => openCamera(pose.key)}
                    activeOpacity={0.75}
                  >
                    {done && capturedUri ? (
                      <>
                        <Image
                          source={{ uri: capturedUri }}
                          style={styles.thumbnail}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                        <View style={[styles.checkOverlay, { backgroundColor: colors.success }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                        <View style={[styles.retakeHint, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                          <Ionicons name="camera-outline" size={10} color="#fff" />
                        </View>
                      </>
                    ) : (
                      <View style={[styles.faceIconWrap, { backgroundColor: colors.primary + "22" }]}>
                        <Ionicons name={pose.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.accent} />
                      </View>
                    )}
                    <Text style={[styles.faceLabel, { color: done ? colors.success : colors.textSecondary }]}>
                      {pose.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {allCaptured && (
              <View style={[styles.allDoneBanner, { backgroundColor: colors.successBg, borderColor: colors.success + "44" }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[styles.allDoneText, { color: colors.success }]}>
                  All 8 face poses captured successfully!
                </Text>
              </View>
            )}
          </View>

          {/* ── Submit ── */}
          <TouchableOpacity
            style={[styles.submitBtn, {
              backgroundColor: !allCaptured || loading ? colors.muted : colors.primary,
              borderRadius: colors.radius,
              opacity: !allCaptured ? 0.55 : 1,
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
                <Text style={styles.submitText}>
                  {allCaptured
                    ? "Register Worker"
                    : `Capture ${TOTAL_POSES - captureCount} more pose${TOTAL_POSES - captureCount !== 1 ? "s" : ""} to enable`}
                </Text>
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
  section: { padding: 16, borderWidth: 1, gap: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  progressBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  progressText: { fontSize: 13, fontWeight: "800" },
  progressBarBg: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 3 },
  faceSub: { fontSize: 12, lineHeight: 18, marginTop: -6 },
  faceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  faceCard: {
    width: "22%", aspectRatio: 0.85,
    alignItems: "center", justifyContent: "flex-end",
    padding: 6, borderWidth: 1.5, gap: 4,
    overflow: "hidden", position: "relative",
  },
  faceIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  thumbnail: { position: "absolute", top: 0, left: 0, right: 0, bottom: 18, borderRadius: 8 },
  checkOverlay: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  retakeHint: { position: "absolute", bottom: 18, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  faceLabel: { fontSize: 9, textAlign: "center", fontWeight: "600" },
  allDoneBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  allDoneText: { flex: 1, fontSize: 13, fontWeight: "600" },
  submitBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
