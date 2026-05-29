import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Worker, getWorkerById, updateWorker } from "@/services/database";

const DEPARTMENTS = ["Civil", "Electrical", "Plumbing", "Security", "Admin", "Mechanical", "IT"];
const EMP_TYPES = ["Contract", "Permanent", "Temporary", "Daily Wage"];

function Field({
  label, placeholder, value, onChangeText, error, keyboardType, maxLength, colors, inputRef, returnKeyType, onSubmitEditing,
}: {
  label: string; placeholder: string; value: string;
  onChangeText: (v: string) => void; error?: string;
  keyboardType?: KeyboardTypeOptions; maxLength?: number;
  colors: ReturnType<typeof useColors>;
  inputRef?: React.RefObject<TextInput | null>;
  returnKeyType?: "next" | "done" | "default";
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={f.group}>
      <Text style={[f.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[f.wrap, { backgroundColor: colors.surface, borderColor: error ? colors.destructive : colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[f.input, { color: colors.foreground }]}
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
      {error ? <Text style={[f.err, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}
const f = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  wrap: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48, justifyContent: "center" },
  input: { fontSize: 14 },
  err: { fontSize: 11 },
});

function SelectField({
  label, options, value, onChange, error, colors,
}: {
  label: string; options: string[]; value: string;
  onChange: (v: string) => void; error?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={ss.group}>
      <Text style={[ss.label, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.scroll}>
        {options.map((opt) => {
          const sel = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[ss.chip, { backgroundColor: sel ? colors.primary : colors.surface, borderColor: sel ? colors.primary : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(opt); }}
              activeOpacity={0.8}
            >
              <Text style={[ss.chipText, { color: sel ? "#fff" : colors.textSecondary }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {error ? <Text style={[ss.err, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}
const ss = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600" },
  scroll: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: "500" },
  err: { fontSize: 11 },
});

interface EditForm {
  fullName: string; mobile: string; department: string;
  contractorName: string; employeeType: string; siteLocation: string;
}

export default function EditWorkerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>({
    fullName: "", mobile: "", department: "",
    contractorName: "", employeeType: "", siteLocation: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({});

  const mobileRef = useRef<TextInput>(null);
  const contractorRef = useRef<TextInput>(null);
  const siteRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const w = await getWorkerById(Number(id));
      if (w) {
        setWorker(w);
        setForm({
          fullName: w.fullName,
          mobile: w.mobile ?? "",
          department: w.department,
          contractorName: w.contractorName ?? "",
          employeeType: w.employeeType,
          siteLocation: w.siteLocation ?? "",
        });
      }
      setLoading(false);
    })();
  }, [id]);

  const setField = useCallback((field: keyof EditForm, val: string) => {
    setForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const validate = (): boolean => {
    const e: Partial<Record<keyof EditForm, string>> = {};
    if (!form.fullName.trim()) e.fullName = "Full name is required";
    if (!form.department) e.department = "Department is required";
    if (!form.employeeType) e.employeeType = "Employee type is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!worker?.id) return;
    setSaving(true);
    try {
      await updateWorker(
        worker.id,
        {
          fullName: form.fullName.trim(),
          mobile: form.mobile.trim(),
          department: form.department,
          contractorName: form.contractorName.trim(),
          employeeType: form.employeeType,
          siteLocation: form.siteLocation.trim(),
        },
        user?.name ?? "Operator"
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Worker details updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert("Error", "Failed to save changes. Please try again.");
    }
    setSaving(false);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 20;

  if (loading) {
    return (
      <DrawerOverlay>
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Edit Worker" showBack onBack={() => router.back()} />
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        </View>
      </DrawerOverlay>
    );
  }

  if (!worker) {
    return (
      <DrawerOverlay>
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Edit Worker" showBack onBack={() => router.back()} />
          <View style={s.center}>
            <Text style={[s.notFound, { color: colors.textMuted }]}>Worker not found</Text>
          </View>
        </View>
      </DrawerOverlay>
    );
  }

  return (
    <DrawerOverlay>
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Edit Worker" showBack onBack={() => router.back()} />
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Worker identity (read-only) */}
          <View style={[s.idCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30", borderRadius: colors.radius }]}>
            <Ionicons name="person-circle-outline" size={32} color={colors.accent} />
            <View style={s.idInfo}>
              <Text style={[s.idName, { color: colors.foreground }]}>{worker.fullName}</Text>
              <Text style={[s.idCode, { color: colors.textSecondary }]}>{worker.workerId}</Text>
            </View>
            <View style={[s.idBadge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[s.idBadgeText, { color: colors.accent }]}>Read-only ID</Text>
            </View>
          </View>

          {/* Personal Info */}
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.secRow}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
              <Text style={[s.secTitle, { color: colors.foreground }]}>Personal Information</Text>
            </View>
            <Field
              label="Full Name *" placeholder="Enter full name"
              value={form.fullName} onChangeText={(v) => setField("fullName", v)}
              error={errors.fullName} colors={colors}
              returnKeyType="next" onSubmitEditing={() => mobileRef.current?.focus()}
            />
            <Field
              label="Mobile Number" placeholder="10-digit mobile number"
              value={form.mobile} onChangeText={(v) => setField("mobile", v)}
              keyboardType="phone-pad" maxLength={10} colors={colors}
              inputRef={mobileRef} returnKeyType="next"
              onSubmitEditing={() => contractorRef.current?.focus()}
            />
          </View>

          {/* Employment Details */}
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.secRow}>
              <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
              <Text style={[s.secTitle, { color: colors.foreground }]}>Employment Details</Text>
            </View>
            <Field
              label="Contractor Name" placeholder="Contractor or company name"
              value={form.contractorName} onChangeText={(v) => setField("contractorName", v)}
              colors={colors} inputRef={contractorRef} returnKeyType="next"
              onSubmitEditing={() => siteRef.current?.focus()}
            />
            <Field
              label="Site Location" placeholder="e.g. NH-48 Gurugram Plaza"
              value={form.siteLocation} onChangeText={(v) => setField("siteLocation", v)}
              colors={colors} inputRef={siteRef} returnKeyType="done"
            />
            <SelectField
              label="Department *" options={DEPARTMENTS} value={form.department}
              onChange={(v) => setField("department", v)} error={errors.department} colors={colors}
            />
            <SelectField
              label="Employee Type *" options={EMP_TYPES} value={form.employeeType}
              onChange={(v) => setField("employeeType", v)} error={errors.employeeType} colors={colors}
            />
          </View>

          {/* Audit note */}
          <View style={[s.auditNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
            <Text style={[s.auditNoteText, { color: colors.textSecondary }]}>
              All changes are logged with your name and timestamp for audit purposes.
            </Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary, borderRadius: colors.radius }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={s.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </DrawerOverlay>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 14 },
  content: { padding: 16, gap: 16 },

  idCard: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderWidth: 1 },
  idInfo: { flex: 1, gap: 2 },
  idName: { fontSize: 15, fontWeight: "700" },
  idCode: { fontSize: 12 },
  idBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  idBadgeText: { fontSize: 10, fontWeight: "700" },

  section: { padding: 16, borderWidth: 1, gap: 14 },
  secRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  secTitle: { flex: 1, fontSize: 15, fontWeight: "700" },

  auditNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  auditNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },

  saveBtn: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
