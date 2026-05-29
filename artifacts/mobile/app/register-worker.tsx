import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { insertWorker } from "@/services/database";
import { useColors } from "@/hooks/useColors";

const DEPARTMENTS = ["Civil", "Electrical", "Plumbing", "Security", "Admin", "Mechanical", "IT"];
const EMP_TYPES = ["Contract", "Permanent", "Temporary", "Daily Wage"];

const FACE_POSES = [
  { key: "front", label: "Front Face", icon: "person" as const },
  { key: "left", label: "Left Profile", icon: "arrow-back" as const },
  { key: "right", label: "Right Profile", icon: "arrow-forward" as const },
  { key: "up", label: "Face Up", icon: "arrow-up" as const },
  { key: "down", label: "Face Down", icon: "arrow-down" as const },
  { key: "smile", label: "Smile", icon: "happy-outline" as const },
  { key: "blink", label: "Blink", icon: "eye-off-outline" as const },
  { key: "neutral", label: "Neutral", icon: "remove-outline" as const },
];

export default function RegisterWorkerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    workerId: "",
    fullName: "",
    mobile: "",
    department: "",
    contractorName: "",
    employeeType: "",
    siteLocation: "",
  });
  const [captured, setCaptured] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: string, val: string) => {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((e) => ({ ...e, [field]: "" }));
  };

  const simulateCapture = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCaptured((c) => ({ ...c, [key]: true }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.workerId.trim()) e.workerId = "Worker ID is required";
    if (!form.fullName.trim()) e.fullName = "Full name is required";
    if (!form.department) e.department = "Department is required";
    if (!form.employeeType) e.employeeType = "Employee type is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    try {
      await insertWorker(form);
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

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  const Field = ({ field, label, placeholder, keyboardType = "default", maxLength }: { field: string; label: string; placeholder: string; keyboardType?: string; maxLength?: number }) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: errors[field] ? colors.destructive : colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={(form as Record<string, string>)[field]}
          onChangeText={(t) => set(field, t)}
          keyboardType={keyboardType as never}
          maxLength={maxLength}
        />
      </View>
      {errors[field] ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors[field]}</Text> : null}
    </View>
  );

  const SelectField = ({ field, label, options }: { field: string; label: string; options: string[] }) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        {options.map((opt) => {
          const selected = (form as Record<string, string>)[field] === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); set(field, opt); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: selected ? "#fff" : colors.textSecondary }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {errors[field] ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors[field]}</Text> : null}
    </View>
  );

  const capturedCount = Object.values(captured).filter(Boolean).length;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Register Worker" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>

          {/* Worker Info */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Worker Information</Text>
            </View>
            <Field field="workerId" label="Worker ID *" placeholder="e.g. WRK007" maxLength={20} />
            <Field field="fullName" label="Full Name *" placeholder="Enter full name" />
            <Field field="mobile" label="Mobile Number" placeholder="10-digit mobile number" keyboardType="phone-pad" maxLength={10} />
            <Field field="siteLocation" label="Site Location" placeholder="e.g. Site-A Delhi" />
          </View>

          {/* Employment Info */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Employment Details</Text>
            </View>
            <Field field="contractorName" label="Contractor Name" placeholder="Contractor or company name" />
            <SelectField field="department" label="Department *" options={DEPARTMENTS} />
            <SelectField field="employeeType" label="Employee Type *" options={EMP_TYPES} />
          </View>

          {/* Face Capture */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="scan-outline" size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Face Capture</Text>
              <View style={[styles.progressPill, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.progressText, { color: colors.accent }]}>{capturedCount}/{FACE_POSES.length}</Text>
              </View>
            </View>
            <Text style={[styles.faceSub, { color: colors.textSecondary }]}>
              Face recognition model will be integrated here. Tap each pose to mark as captured.
            </Text>
            <View style={styles.faceGrid}>
              {FACE_POSES.map((pose) => {
                const done = !!captured[pose.key];
                return (
                  <TouchableOpacity
                    key={pose.key}
                    style={[styles.faceCard, { backgroundColor: done ? colors.primary + "22" : colors.surface, borderColor: done ? colors.primary : colors.border, borderRadius: colors.radius }]}
                    onPress={() => simulateCapture(pose.key)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.faceIconWrap, { backgroundColor: done ? colors.primary : colors.muted }]}>
                      {done
                        ? <Ionicons name="checkmark" size={20} color="#fff" />
                        : <Ionicons name={pose.icon} size={20} color={colors.textSecondary} />
                      }
                    </View>
                    <Text style={[styles.faceLabel, { color: done ? colors.accent : colors.textSecondary }]}>{pose.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.placeholderBanner, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                Face Recognition API will be integrated here for live capture
              </Text>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: loading ? colors.primaryDark : colors.primary, borderRadius: colors.radius }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="save-outline" size={20} color="#fff" />
                  <Text style={styles.submitText}>Register Worker</Text>
                </>
            }
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
  progressPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  progressText: { fontSize: 12, fontWeight: "700" },
  fieldGroup: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  inputWrap: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, fontSize: 14, height: "100%" },
  fieldError: { fontSize: 11 },
  chipsScroll: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: "500" },
  faceSub: { fontSize: 12, lineHeight: 18, marginTop: -6 },
  faceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  faceCard: { width: "22%", alignItems: "center", padding: 10, borderWidth: 1, gap: 6 },
  faceIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  faceLabel: { fontSize: 10, textAlign: "center", fontWeight: "500" },
  placeholderBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  placeholderText: { flex: 1, fontSize: 12 },
  submitBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
