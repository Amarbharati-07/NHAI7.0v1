import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import GeofenceGate from "@/components/GeofenceGate";
import UnauthorizedDeviceScreen from "@/components/UnauthorizedDeviceScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminData } from "@/contexts/AdminDataContext";
import { apiPostJson } from "@/services/apiConfig";
import * as FaceRecognitionService from "@/services/FaceRecognitionService";
import { syncService } from "@/services/SyncService";
import {
  type FacePose,
  POSE_CONFIGS,
  clearSession,
  getSessionCaptures,
  saveFaceImagesToDb,
} from "@/services/FaceCaptureService";
import { insertWorker, updateWorkerProcessingState } from "@/services/database";
import { getAllocations, getOrCreateDeviceToken, getRegisteredDevices } from "@/services/deviceService";
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

const EMBEDDING_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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
  const { user, refreshDeviceAuth } = useAuth();
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
  const [submitError, setSubmitError] = useState<string>("");

  /* Captures refreshed on focus after returning from guided-face-capture */
  const [captures, setCaptures] = useState<Partial<Record<FacePose, string>>>({});
  const captureCount = Object.keys(captures).length;
  const allCaptured = captureCount === TOTAL_POSES;
  const geofenceBlocked = user?.role === "operator" && user?.geofenceAllowed === false;

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const currentDeviceToken = await getOrCreateDeviceToken();
          const devices = await getRegisteredDevices();
          const allocations = await getAllocations();
          const currentDevice = devices.find((device) => device.deviceToken === currentDeviceToken);
          const matchedAllocation =
            allocations.find((allocation) => allocation.operatorId === user?.userId && allocation.deviceToken.trim() === currentDeviceToken) ??
            allocations.find((allocation) => allocation.operatorId === user?.userId && allocation.deviceId === currentDevice?.id) ??
            allocations.find((allocation) => allocation.operatorId === user?.userId && allocation.status === "active") ??
            null;
          console.info("DEVICE_VERIFICATION", {
            screen: "register-worker",
            operatorId: user?.userId ?? "",
            allocatedDeviceId: matchedAllocation?.deviceId ?? user?.allocatedDeviceId ?? "",
            allocatedDeviceToken: matchedAllocation?.deviceToken ?? user?.deviceToken ?? "",
            currentDeviceId: currentDevice?.id ?? "",
            currentDeviceToken,
            reason: user?.deviceVerifyReason ?? "",
            authorized: user?.isDeviceAuthorized ?? null,
          });
        } catch (err) {
          console.warn("[register-worker] verification snapshot failed:", err);
        }
      })();
      if (user?.role === "operator") {
        void refreshDeviceAuth();
      }
      const session = getSessionCaptures(sessionId);
      const uris: Partial<Record<FacePose, string>> = {};
      for (const [pose, result] of Object.entries(session)) {
        uris[pose as FacePose] = result.uri;
      }
      setCaptures(uris);
    }, [sessionId, refreshDeviceAuth, user?.allocatedDeviceId, user?.deviceToken, user?.deviceVerifyReason, user?.isDeviceAuthorized, user?.role, user?.userId])
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

    const refreshed = await refreshDeviceAuth();
    const current = refreshed ?? user;
    if (current?.role === "operator" && current.geofenceAllowed === false) {
      Alert.alert(
        "Outside Authorized Toll Plaza",
        "You are outside the authorized toll plaza location. Attendance operations are not allowed.",
      );
      return;
    }

    const payload = {
      workerId: form.workerId.trim(),
      fullName: form.fullName.trim(),
      mobile: form.mobile.trim(),
      department: form.department.trim(),
      contractorName: form.contractorName.trim(),
      employeeType: form.employeeType.trim(),
      siteLocation: form.siteLocation.trim(),
      plazaId: user?.plazaId ?? "",
      operatorId: user?.userId ?? "",
      deviceToken: user?.deviceToken ?? "",
      status: "active" as const,
    };

    console.info("[REGISTER] Button clicked", payload);
    console.info("[REGISTER] Validation Passed");
    console.info("[REGISTER] Face Images Count", captureCount);
    console.info("[REGISTER] Sending worker data", payload);
    console.info("[REGISTER] Promise timeout for embedding generation = 10 seconds");
    setSubmitError("");
    setLoading(true);
    try {
      console.info("[REGISTER] SQLite Save Start");
      const workerId = await insertWorker({
        ...payload,
        syncStatus: "pending",
        embeddingStatus: "pending",
        registrationAt: new Date().toISOString(),
      });
      console.info("[REGISTER] Sync Queue Added", { workerId });

      console.info("[REGISTER] Saving Worker To SQLite");
      await saveFaceImagesToDb(workerId, sessionId);
      console.info("[REGISTER] SQLite Save Success", { workerId, captures: captureCount });

      const capturedFaces = Object.values(getSessionCaptures(sessionId));
      void (async () => {
        console.info("[REGISTER] Starting Embedding Generation", { workerId, faces: capturedFaces.length });
        try {
          await withTimeout((async () => {
            await FaceRecognitionService.initModels();
            for (const capture of capturedFaces) {
              await FaceRecognitionService.registerWorkerFace(
                workerId,
                payload.workerId,
                payload.fullName,
                capture.uri,
                capture.pose,
              );
            }
          })(), EMBEDDING_TIMEOUT_MS, "Embedding generation");
          await updateWorkerProcessingState(workerId, { embeddingStatus: "ready" });
          console.info("[REGISTER] Embedding Complete", { workerId, faces: capturedFaces.length });
        } catch (embeddingErr) {
          console.error("[REGISTER] Error", embeddingErr);
          await updateWorkerProcessingState(workerId, { embeddingStatus: "pending" });
        }
      })().catch((backgroundErr) => {
        console.error("[REGISTER] Error", backgroundErr);
      });

      void (async () => {
        console.info("[REGISTER] API Sync Start", { workerId });
        try {
          const apiResponse = await apiPostJson<{ worker: { id?: number; workerId?: string } }>(
            "workers",
            payload,
            30000,
          );
          console.info("[REGISTER] API Sync Complete", apiResponse);
          await updateWorkerProcessingState(workerId, { syncStatus: "synced" });
        } catch (syncErr) {
          console.error("[REGISTER] Error", syncErr);
          await updateWorkerProcessingState(workerId, { syncStatus: "pending" });
        }
      })();

      console.info("[REGISTER] Registration Complete", {
        workerId,
        workerCode: payload.workerId,
      });

      await clearSession(sessionId);

      void refreshAdminData().catch((refreshErr) => {
        console.warn("[REGISTER] Admin refresh failed:", refreshErr);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: unknown) {
      console.error("[REGISTER] Error", err);
      const message = err instanceof Error ? err.message : String(err ?? "Failed to register worker.");
      setSubmitError(message || "Failed to register worker.");
      Alert.alert("Register Worker Failed", message || "Failed to register worker.");
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
  const deviceBlocked   = isOperator && user?.isDeviceAuthorized === false;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Register Worker" showBack onBack={() => router.back()} />

        {deviceBlocked && (
          <UnauthorizedDeviceScreen reason={user?.deviceVerifyReason} />
        )}

        {!deviceBlocked && geofenceBlocked && (
          <GeofenceGate
            plazaName={user?.plazaName}
            distanceMeters={user?.geofenceDistanceMeters ?? null}
            radiusMeters={user?.plazaRadiusMeters ?? null}
            message={user?.geofenceMessage}
            onRetry={() => { void refreshDeviceAuth(); }}
            onBack={() => router.back()}
          />
        )}

        {!deviceBlocked && !geofenceBlocked && <ScrollView
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

            {/* Compact progress guide */}
            <View style={[styles.captureGuide, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.captureGuideRow}>
                <Ionicons name="scan-outline" size={18} color={colors.accent} />
                <Text style={[styles.captureGuideTitle, { color: colors.foreground }]}>
                  Guided 8-step face profile
                </Text>
              </View>
              <Text style={[styles.captureGuideText, { color: colors.textSecondary }]}>
                The camera will guide you through Front Face, Left Profile, Right Profile, Face Up, Face Down, Smile, Blink, and Neutral one by one.
              </Text>
              <View style={[styles.captureProgressLine, { backgroundColor: colors.primary + "18" }]}>
                <View
                  style={[
                    styles.captureProgressFill,
                    {
                      width: `${(captureCount / TOTAL_POSES) * 100}%` as never,
                      backgroundColor: allCaptured ? colors.success : colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.captureGuideFoot, { color: allCaptured ? colors.success : colors.textMuted }]}>
                {allCaptured ? "All poses captured. Ready to register." : `${captureCount} of ${TOTAL_POSES} poses captured.`}
              </Text>
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
          {submitError ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "44" }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
              <Text style={[styles.errorBannerText, { color: colors.destructive }]}>{submitError}</Text>
            </View>
          ) : null}
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
  captureGuide: { borderWidth: 1, padding: 14, borderRadius: 12, gap: 10 },
  captureGuideRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  captureGuideTitle: { fontSize: 14, fontWeight: "700" },
  captureGuideText: { fontSize: 12, lineHeight: 18 },
  captureProgressLine: { height: 5, borderRadius: 3, overflow: "hidden" },
  captureProgressFill: { height: "100%", borderRadius: 3 },
  captureGuideFoot: { fontSize: 12, fontWeight: "600" },

  /* Done banner */
  doneBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  doneBannerText: { flex: 1, fontSize: 13, fontWeight: "600" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: "600" },

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
