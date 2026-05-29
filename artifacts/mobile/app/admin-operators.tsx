import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
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
import { MOCK_OPERATORS, MOCK_TOLL_PLAZAS, type AdminOperator } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";

type OpFilter = "all" | "active" | "suspended" | "pending";

function OperatorCard({ op, onAction }: { op: AdminOperator; onAction: (action: string, op: AdminOperator) => void }) {
  const colors = useColors();
  const statusColor = op.status === "active" ? colors.success : op.status === "suspended" ? colors.destructive : colors.warning;
  const statusLabel = op.status === "active" ? "Active" : op.status === "suspended" ? "Suspended" : "Pending";

  return (
    <View style={[st.opCard, { backgroundColor: colors.card, borderColor: op.status === "suspended" ? colors.destructive + "44" : colors.border, borderRadius: colors.radius }]}>
      <View style={st.cardHeader}>
        <View style={[st.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="person" size={20} color="#fff" />
        </View>
        <View style={st.nameCol}>
          <Text style={[st.opName, { color: colors.foreground }]}>{op.name}</Text>
          <Text style={[st.opId, { color: colors.textMuted }]}>{op.userId} · {op.mobile}</Text>
        </View>
        <View style={[st.statusPill, { backgroundColor: statusColor + "22" }]}>
          <View style={[st.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[st.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={[st.infoGrid, { borderTopColor: colors.border }]}>
        <View style={st.infoItem}>
          <Ionicons name="business-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoText, { color: colors.textSecondary }]} numberOfLines={1}>{op.plazaName}</Text>
        </View>
        <View style={st.infoItem}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoText, { color: colors.textSecondary }]}>Last: {op.lastLogin}</Text>
        </View>
        <View style={st.infoItem}>
          <Ionicons name="log-in-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoText, { color: colors.textSecondary }]}>{op.loginCount} logins</Text>
        </View>
        <View style={st.infoItem}>
          <Ionicons name="phone-portrait-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoText, { color: colors.textSecondary }]}>{op.deviceCount} device{op.deviceCount !== 1 ? "s" : ""}</Text>
        </View>
      </View>

      <View style={[st.actionsRow, { borderTopColor: colors.border }]}>
        {op.status === "active" ? (
          <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.warning + "18" }]} onPress={() => onAction("suspend", op)}>
            <Ionicons name="pause-outline" size={13} color={colors.warning} />
            <Text style={[st.actionBtnText, { color: colors.warning }]}>Suspend</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.success + "18" }]} onPress={() => onAction("activate", op)}>
            <Ionicons name="play-outline" size={13} color={colors.success} />
            <Text style={[st.actionBtnText, { color: colors.success }]}>Activate</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("resetPwd", op)}>
          <Ionicons name="key-outline" size={13} color={colors.accent} />
          <Text style={[st.actionBtnText, { color: colors.accent }]}>Reset Pwd</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("viewDevice", op)}>
          <Ionicons name="phone-portrait-outline" size={13} color={colors.primary} />
          <Text style={[st.actionBtnText, { color: colors.primary }]}>Device</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Create Operator Form defaults ── */
interface CreateForm {
  name: string; userId: string; password: string;
  mobile: string; email: string; plazaId: string;
}
const emptyForm: CreateForm = { name: "", userId: "", password: "", mobile: "", email: "", plazaId: "" };

/* ══════════════ MAIN SCREEN ══════════════ */
export default function AdminOperatorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 20;

  const [filter,        setFilter]        = useState<OpFilter>("all");
  const [operators,     setOperators]     = useState<AdminOperator[]>([...MOCK_OPERATORS]);
  const [showCreate,    setShowCreate]    = useState(false);
  const [form,          setForm]          = useState<CreateForm>(emptyForm);
  const [formErrors,    setFormErrors]    = useState<Partial<CreateForm>>({});
  const [showPassword,  setShowPassword]  = useState(false);

  const filtered = operators.filter((op) =>
    filter === "all" ? true : op.status === filter
  );

  const kpis = [
    { label: "Total",     value: operators.length,                                    color: colors.primary },
    { label: "Active",    value: operators.filter((o) => o.status === "active").length,    color: colors.success },
    { label: "Suspended", value: operators.filter((o) => o.status === "suspended").length, color: colors.destructive },
    { label: "Pending",   value: operators.filter((o) => o.status === "pending").length,   color: colors.warning },
  ];

  const handleAction = (action: string, op: AdminOperator) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "suspend") {
      Alert.alert("Suspend Operator", `Suspend ${op.name}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Suspend", style: "destructive", onPress: () =>
          setOperators((prev) => prev.map((o) => o.id === op.id ? { ...o, status: "suspended" } : o))
        },
      ]);
    } else if (action === "activate") {
      setOperators((prev) => prev.map((o) => o.id === op.id ? { ...o, status: "active" } : o));
      Alert.alert("Activated", `${op.name} account activated.`);
    } else if (action === "resetPwd") {
      Alert.alert("Password Reset", `A new password has been generated for ${op.name} (${op.userId}).`);
    } else if (action === "viewDevice") {
      router.push("/admin-devices" as never);
    }
  };

  const validateCreate = () => {
    const e: Partial<CreateForm> = {};
    if (!form.name.trim())     e.name     = "Name required";
    if (!form.userId.trim())   e.userId   = "User ID required";
    if (!form.password.trim()) e.password = "Password required";
    if (!form.mobile.trim())   e.mobile   = "Mobile required";
    if (!form.plazaId)         e.plazaId  = "Assign a plaza";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = () => {
    if (!validateCreate()) return;
    const plaza = MOCK_TOLL_PLAZAS.find((p) => p.id === form.plazaId);
    const newOp: AdminOperator = {
      id:          form.userId,
      userId:      form.userId.toUpperCase(),
      name:        form.name.trim(),
      mobile:      form.mobile.trim(),
      email:       form.email.trim(),
      plazaId:     form.plazaId,
      plazaName:   plaza?.name ?? "Unassigned",
      status:      "pending",
      lastLogin:   "Never",
      loginCount:  0,
      deviceCount: 0,
      createdAt:   new Date().toISOString().split("T")[0],
    };
    setOperators((prev) => [newOp, ...prev]);
    setShowCreate(false);
    setForm(emptyForm);
    setFormErrors({});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Operator Created", `${form.name} account created.\nUser ID: ${form.userId.toUpperCase()}\n\nNext step: Register and allocate a device for this operator.`);
  };

  const setField = (k: keyof CreateForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFormErrors((e) => ({ ...e, [k]: undefined }));
    if (k === "name" && !form.userId) {
      const suggested = `OPR${String(operators.length + 1).padStart(3, "0")}`;
      setForm((f) => ({ ...f, name: v, userId: suggested }));
    }
  };

  return (
    <DrawerOverlay>
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Operator Management" showBack />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[st.scroll, { paddingBottom: botPad }]}>

          {/* KPI Row */}
          <View style={st.kpiRow}>
            {kpis.map((k) => (
              <View key={k.label} style={[st.kpiCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[st.kpiVal, { color: k.color }]}>{k.value}</Text>
                <Text style={[st.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Create Operator Button */}
          <TouchableOpacity
            style={[st.createBtn, { backgroundColor: colors.accent, borderRadius: colors.radius }]}
            onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={st.createBtnText}>Create New Operator</Text>
          </TouchableOpacity>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
            {(["all", "active", "suspended", "pending"] as OpFilter[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[st.filterPill, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}
                onPress={() => { setFilter(f); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[st.filterText, { color: filter === f ? "#fff" : colors.textSecondary }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== "all" ? ` (${operators.filter((o) => o.status === f).length})` : ` (${operators.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Operator Cards */}
          {filtered.map((op) => (
            <OperatorCard key={op.id} op={op} onAction={handleAction} />
          ))}
        </ScrollView>
      </View>

      {/* ── Create Operator Modal ── */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>Create Operator Account</Text>
              <TouchableOpacity onPress={() => { setShowCreate(false); setForm(emptyForm); setFormErrors({}); }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={st.sheetBody} keyboardShouldPersistTaps="handled">

              {/* Workflow note */}
              <View style={[st.noteBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33", borderRadius: colors.radius }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                <Text style={[st.noteText, { color: colors.primary }]}>
                  After creating, register and allocate a device for this operator via Device Management.
                </Text>
              </View>

              {[
                { key: "name",     label: "Full Name *",            placeholder: "e.g. Amit Sharma",          secure: false },
                { key: "userId",   label: "User ID *",              placeholder: "e.g. OPR006",               secure: false },
                { key: "password", label: "Password *",             placeholder: "Min 6 characters",          secure: true  },
                { key: "mobile",   label: "Mobile Number *",        placeholder: "10-digit mobile number",    secure: false },
                { key: "email",    label: "Email (optional)",       placeholder: "operator@spectra.in",       secure: false },
              ].map(({ key, label, placeholder, secure }) => (
                <View key={key} style={st.fieldGroup}>
                  <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                  <View style={[st.inputWrap, { backgroundColor: colors.surface, borderColor: formErrors[key as keyof CreateForm] ? colors.destructive : colors.border }]}>
                    <TextInput
                      style={[st.textInput, { color: colors.foreground }]}
                      placeholder={placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      value={form[key as keyof CreateForm]}
                      onChangeText={(v) => setField(key as keyof CreateForm, v)}
                      secureTextEntry={secure && !showPassword}
                      autoCapitalize={key === "userId" ? "characters" : "words"}
                      keyboardType={key === "mobile" ? "phone-pad" : "default"}
                    />
                    {secure && (
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                        <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {formErrors[key as keyof CreateForm] && (
                    <Text style={[st.errText, { color: colors.destructive }]}>{formErrors[key as keyof CreateForm]}</Text>
                  )}
                </View>
              ))}

              {/* Plaza Assignment */}
              <View style={st.fieldGroup}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Assign Toll Plaza *</Text>
                {formErrors.plazaId && <Text style={[st.errText, { color: colors.destructive }]}>{formErrors.plazaId}</Text>}
                {MOCK_TOLL_PLAZAS.filter((p) => p.status !== "inactive").map((plaza) => (
                  <TouchableOpacity
                    key={plaza.id}
                    style={[st.plazaRow, { backgroundColor: form.plazaId === plaza.id ? colors.primary + "18" : colors.surface, borderColor: form.plazaId === plaza.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                    onPress={() => setField("plazaId", plaza.id)}
                  >
                    <Ionicons name="business-outline" size={16} color={form.plazaId === plaza.id ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.plazaName, { color: colors.foreground }]}>{plaza.name}</Text>
                      <Text style={[st.plazaRoute, { color: colors.textMuted }]}>{plaza.route} · {plaza.location}</Text>
                    </View>
                    {form.plazaId === plaza.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowCreate(false); setForm(emptyForm); setFormErrors({}); }}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, { backgroundColor: colors.accent }]} onPress={handleCreate}>
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={st.confirmText}>Create Operator</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </DrawerOverlay>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 10 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  kpiCard: { flex: 1, borderWidth: 1, padding: 10, alignItems: "center", gap: 2 },
  kpiVal: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 10, fontWeight: "600" },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, marginBottom: 4 },
  createBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 4 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: "600" },
  /* Operator Card */
  opCard: { borderWidth: 1, marginBottom: 8, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  nameCol: { flex: 1 },
  opName: { fontSize: 15, fontWeight: "700" },
  opId: { fontSize: 12, marginTop: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  infoItem: { width: "46%", flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { fontSize: 12, flex: 1 },
  actionsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  /* Create Modal */
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%", overflow: "hidden" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  sheetBody: { paddingHorizontal: 20, paddingVertical: 16, flexGrow: 0 },
  sheetFooter: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  noteBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1, marginBottom: 16 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  fieldGroup: { marginBottom: 14, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "600" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  textInput: { flex: 1, fontSize: 14 },
  errText: { fontSize: 11 },
  plazaRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, marginBottom: 8 },
  plazaName: { fontSize: 14, fontWeight: "600" },
  plazaRoute: { fontSize: 12 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14, fontWeight: "600" },
  confirmBtn: { flex: 1, height: 46, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
