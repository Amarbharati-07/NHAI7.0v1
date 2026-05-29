import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { useAdminData } from "@/contexts/AdminDataContext";
import type { AdminOperator } from "@/services/adminData";
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

interface CreateForm {
  name: string; userId: string; password: string;
  mobile: string; email: string; plazaId: string;
}
const emptyForm: CreateForm = { name: "", userId: "", password: "", mobile: "", email: "", plazaId: "" };

function generateTempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

export default function AdminOperatorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 20;

  const { operators, plazas, allocations, devices, addOperator, updateOperatorData } = useAdminData();

  const [filter, setFilter]           = useState<OpFilter>("all");
  const [saving, setSaving]           = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setFormState]          = useState<CreateForm>(emptyForm);
  const [formErrors, setFormErrors]   = useState<Partial<CreateForm>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [suspendTarget, setSuspendTarget] = useState<AdminOperator | null>(null);
  const [resetTarget, setResetTarget]     = useState<AdminOperator | null>(null);
  const [generatedPwd, setGeneratedPwd]   = useState("");
  const [pwdCopied, setPwdCopied]         = useState(false);
  const [deviceTarget, setDeviceTarget]   = useState<AdminOperator | null>(null);
  const [successMsg, setSuccessMsg]       = useState("");

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const filtered = operators.filter((op) => filter === "all" ? true : op.status === filter);

  const kpis = [
    { label: "Total",     value: operators.length,                                          color: colors.primary },
    { label: "Active",    value: operators.filter((o) => o.status === "active").length,     color: colors.success },
    { label: "Suspended", value: operators.filter((o) => o.status === "suspended").length,  color: colors.destructive },
    { label: "Pending",   value: operators.filter((o) => o.status === "pending").length,    color: colors.warning },
  ];

  const handleAction = async (action: string, op: AdminOperator) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "suspend") {
      setSuspendTarget(op);
    } else if (action === "activate") {
      setSaving(true);
      try {
        await updateOperatorData(op.id, { status: "active" });
        showSuccess(`${op.name} account activated successfully.`);
        console.log("[admin-operators] activate success:", op.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        console.error("[admin-operators] activate error:", e);
      }
      setSaving(false);
    } else if (action === "resetPwd") {
      const pwd = generateTempPassword();
      setGeneratedPwd(pwd);
      setPwdCopied(false);
      setResetTarget(op);
    } else if (action === "viewDevice") {
      setDeviceTarget(op);
    }
  };

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    setSaving(true);
    try {
      await updateOperatorData(suspendTarget.id, { status: "suspended" });
      showSuccess(`${suspendTarget.name} has been suspended.`);
      console.log("[admin-operators] suspend success:", suspendTarget.id);
      setSuspendTarget(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      console.error("[admin-operators] suspend error:", e);
    }
    setSaving(false);
  };

  const validateCreate = () => {
    const e: Partial<CreateForm> = {};
    if (!form.name.trim()) e.name = "Name required";
    if (!form.userId.trim()) e.userId = "User ID required";
    if (!form.password.trim()) e.password = "Password required";
    if (!form.mobile.trim()) e.mobile = "Mobile required";
    if (!form.plazaId) e.plazaId = "Assign a plaza";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreate()) return;
    const plaza = plazas.find((p) => p.id === form.plazaId);
    setSaving(true);
    try {
      const op = await addOperator({
        userId:    form.userId,
        name:      form.name.trim(),
        mobile:    form.mobile.trim(),
        email:     form.email.trim(),
        plazaId:   form.plazaId,
        plazaName: plaza?.name ?? "Unassigned",
        status:    "pending",
      });
      console.log("[admin-operators] create success:", op.id, op.name);
      setShowCreate(false);
      setFormState(emptyForm);
      setFormErrors({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess(`Operator ${form.name} created. Assign a device next.`);
    } catch (e) {
      console.error("[admin-operators] create error:", e);
    }
    setSaving(false);
  };

  const setField = (k: keyof CreateForm, v: string) => {
    setFormState((f) => ({ ...f, [k]: v }));
    setFormErrors((e) => ({ ...e, [k]: undefined }));
    if (k === "name" && !form.userId) {
      const suggested = `OPR${String(operators.length + 1).padStart(3, "0")}`;
      setFormState((f) => ({ ...f, name: v, userId: suggested }));
    }
  };

  const deviceInfoAllocs = deviceTarget
    ? allocations.filter((a) => a.operatorId === deviceTarget.id && a.status === "active")
    : [];

  return (
    <DrawerOverlay>
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Operator Management" showBack />

        {successMsg !== "" && (
          <View style={[st.successBanner, { backgroundColor: colors.success + "22", borderColor: colors.success + "55" }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[st.successText, { color: colors.success }]}>{successMsg}</Text>
          </View>
        )}

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

          {/* Create Button */}
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

      {/* ── Suspend Confirm Modal ── */}
      <Modal visible={suspendTarget !== null} transparent animationType="fade" onRequestClose={() => setSuspendTarget(null)}>
        <View style={st.overlay}>
          <View style={[st.confirmSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[st.confirmIconWrap, { backgroundColor: colors.warning + "22" }]}>
              <Ionicons name="pause-circle-outline" size={32} color={colors.warning} />
            </View>
            <Text style={[st.confirmTitle, { color: colors.foreground }]}>Suspend Operator</Text>
            <Text style={[st.confirmBody, { color: colors.textSecondary }]}>
              Suspend <Text style={{ fontWeight: "700", color: colors.foreground }}>{suspendTarget?.name}</Text>?{"\n"}
              They will lose access until reactivated.
            </Text>
            <View style={st.confirmBtns}>
              <TouchableOpacity style={[st.confirmCancelBtn, { borderColor: colors.border }]} onPress={() => setSuspendTarget(null)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmActionBtn, { backgroundColor: saving ? colors.muted : colors.warning }]}
                onPress={confirmSuspend}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="pause-outline" size={16} color="#fff" /><Text style={st.confirmText}>Suspend</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Reset Password Modal ── */}
      <Modal visible={resetTarget !== null} transparent animationType="slide" onRequestClose={() => setResetTarget(null)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="key-outline" size={18} color={colors.accent} />
                <Text style={[st.sheetTitle, { color: colors.foreground }]}>Reset Password</Text>
              </View>
              <TouchableOpacity onPress={() => setResetTarget(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={[st.sheetBody, { gap: 16 }]}>
              <Text style={[st.resetSubtitle, { color: colors.textSecondary }]}>
                A temporary password has been generated for{" "}
                <Text style={{ fontWeight: "700", color: colors.foreground }}>{resetTarget?.name}</Text>.
                Share it securely — they must change it on next login.
              </Text>
              <View style={[st.pwdBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[st.pwdText, { color: colors.foreground }]} selectable>{generatedPwd}</Text>
                <TouchableOpacity
                  style={[st.copyBtn, { backgroundColor: pwdCopied ? colors.success + "22" : colors.primary + "18" }]}
                  onPress={() => { setPwdCopied(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
                >
                  <Ionicons name={pwdCopied ? "checkmark-outline" : "copy-outline"} size={16} color={pwdCopied ? colors.success : colors.accent} />
                  <Text style={[st.copyBtnText, { color: pwdCopied ? colors.success : colors.accent }]}>{pwdCopied ? "Copied" : "Copy"}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[st.regenBtn, { borderColor: colors.border }]} onPress={() => { setGeneratedPwd(generateTempPassword()); setPwdCopied(false); }}>
                <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} />
                <Text style={[st.regenText, { color: colors.textSecondary }]}>Generate New</Text>
              </TouchableOpacity>
              <View style={[st.resetInfo, { backgroundColor: colors.warning + "11", borderColor: colors.warning + "33", borderRadius: colors.radius }]}>
                <Ionicons name="warning-outline" size={14} color={colors.warning} />
                <Text style={[st.resetInfoText, { color: colors.warning }]}>Previous password will be invalidated immediately upon confirmation.</Text>
              </View>
            </View>
            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setResetTarget(null)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: colors.accent }]}
                onPress={() => { setResetTarget(null); showSuccess(`Password reset for ${resetTarget?.name}.`); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
              >
                <Ionicons name="checkmark-outline" size={16} color="#fff" />
                <Text style={st.confirmText}>Confirm Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Device Info Modal ── */}
      <Modal visible={deviceTarget !== null} transparent animationType="slide" onRequestClose={() => setDeviceTarget(null)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.accent} />
                <Text style={[st.sheetTitle, { color: colors.foreground }]}>Device Info</Text>
              </View>
              <TouchableOpacity onPress={() => setDeviceTarget(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={st.sheetBody}>
              <View style={[st.deviceOpRow, { backgroundColor: colors.primary + "11", borderRadius: colors.radius }]}>
                <View style={[st.avatar, { backgroundColor: colors.primary }]}>
                  <Ionicons name="person" size={18} color="#fff" />
                </View>
                <View>
                  <Text style={[st.opName, { color: colors.foreground }]}>{deviceTarget?.name}</Text>
                  <Text style={[st.opId, { color: colors.textMuted }]}>{deviceTarget?.userId} · {deviceTarget?.plazaName}</Text>
                </View>
              </View>

              {deviceInfoAllocs.length === 0 ? (
                <View style={[st.noDevice, { borderColor: colors.border }]}>
                  <Ionicons name="phone-portrait-outline" size={32} color={colors.textMuted} />
                  <Text style={[st.noDeviceText, { color: colors.textMuted }]}>No device allocated</Text>
                  <TouchableOpacity
                    style={[st.allocateBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                    onPress={() => { setDeviceTarget(null); router.push("/admin-devices" as never); }}
                  >
                    <Ionicons name="add-outline" size={16} color="#fff" />
                    <Text style={st.confirmText}>Allocate Device</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                deviceInfoAllocs.map((alloc) => {
                  const dev = devices.find((d) => d.id === alloc.deviceId);
                  const statusColor = alloc.status === "active" ? colors.success : alloc.status === "blocked" ? colors.destructive : colors.warning;
                  return (
                    <View key={alloc.id} style={[st.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
                      <View style={st.deviceCardHeader}>
                        <View style={[st.deviceIconWrap, { backgroundColor: statusColor + "22" }]}>
                          <Ionicons name={alloc.platform === "ios" ? "logo-apple" : alloc.platform === "web" ? "globe-outline" : "logo-android"} size={20} color={statusColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.deviceName, { color: colors.foreground }]}>{alloc.deviceModel}</Text>
                          <Text style={[st.deviceSub, { color: colors.textMuted }]}>ID: {alloc.deviceId}</Text>
                        </View>
                        <View style={[st.statusPill, { backgroundColor: statusColor + "22" }]}>
                          <View style={[st.statusDot, { backgroundColor: statusColor }]} />
                          <Text style={[st.statusText, { color: statusColor }]}>{alloc.status.charAt(0).toUpperCase() + alloc.status.slice(1)}</Text>
                        </View>
                      </View>
                      {[
                        { label: "Device ID",   value: alloc.deviceId },
                        { label: "Platform",    value: alloc.platform },
                        { label: "IMEI",        value: dev?.imeiNumber ?? "—" },
                        { label: "Allocated",   value: alloc.allocatedAt },
                      ].map(({ label, value }) => (
                        <View key={label} style={[st.deviceRow, { borderTopColor: colors.border }]}>
                          <Text style={[st.deviceRowLabel, { color: colors.textMuted }]}>{label}</Text>
                          <Text style={[st.deviceRowValue, { color: colors.foreground }]}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </View>
            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => { setDeviceTarget(null); router.push("/admin-devices" as never); }}
              >
                <Ionicons name="settings-outline" size={16} color="#fff" />
                <Text style={st.confirmText}>Manage in Device Center</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Create Operator Modal ── */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>Create Operator Account</Text>
              <TouchableOpacity onPress={() => { setShowCreate(false); setFormState(emptyForm); setFormErrors({}); }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={st.sheetBody} keyboardShouldPersistTaps="handled">
              <View style={[st.noteBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33", borderRadius: colors.radius }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                <Text style={[st.noteText, { color: colors.primary }]}>
                  After creating, register and allocate a device for this operator via Device Management.
                </Text>
              </View>

              {[
                { key: "name",     label: "Full Name *",        placeholder: "e.g. Amit Sharma",      secure: false },
                { key: "userId",   label: "User ID *",          placeholder: "e.g. OPR006",           secure: false },
                { key: "password", label: "Password *",         placeholder: "Min 6 characters",      secure: true },
                { key: "mobile",   label: "Mobile Number *",    placeholder: "10-digit mobile number", secure: false },
                { key: "email",    label: "Email (optional)",   placeholder: "operator@spectra.in",   secure: false },
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

              <View style={st.fieldGroup}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Assign Toll Plaza *</Text>
                {formErrors.plazaId && <Text style={[st.errText, { color: colors.destructive }]}>{formErrors.plazaId}</Text>}
                {plazas.filter((p) => p.status !== "inactive").map((plaza) => (
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
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowCreate(false); setFormState(emptyForm); setFormErrors({}); }}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: saving ? colors.muted : colors.accent }]}
                onPress={handleCreate}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="person-add-outline" size={16} color="#fff" /><Text style={st.confirmText}>Create Operator</Text></>
                }
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
  successBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  successText: { fontSize: 13, fontWeight: "600", flex: 1 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  kpiCard: { flex: 1, borderWidth: 1, padding: 10, alignItems: "center", gap: 2 },
  kpiVal: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 10, fontWeight: "600" },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, marginBottom: 4 },
  createBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, paddingVertical: 4, marginBottom: 4 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: "600" },
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
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  confirmSheet: { margin: 20, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", gap: 12, marginBottom: 40 },
  confirmIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  confirmTitle: { fontSize: 18, fontWeight: "700" },
  confirmBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  confirmBtns: { flexDirection: "row", gap: 12, width: "100%", marginTop: 4 },
  confirmCancelBtn: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  confirmActionBtn: { flex: 1, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%", overflow: "hidden" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  sheetBody: { paddingHorizontal: 20, paddingVertical: 16, flexGrow: 0 },
  sheetFooter: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  resetSubtitle: { fontSize: 13, lineHeight: 20 },
  pwdBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  pwdText: { flex: 1, fontSize: 18, fontWeight: "700", letterSpacing: 2, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  copyBtnText: { fontSize: 12, fontWeight: "700" },
  regenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  regenText: { fontSize: 13, fontWeight: "600" },
  resetInfo: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1 },
  resetInfoText: { flex: 1, fontSize: 12, lineHeight: 18 },
  deviceOpRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 12 },
  noDevice: { alignItems: "center", gap: 10, paddingVertical: 30, borderWidth: 1, borderRadius: 10, borderStyle: "dashed" },
  noDeviceText: { fontSize: 14 },
  allocateBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  deviceCard: { borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  deviceCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  deviceIconWrap: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  deviceName: { fontSize: 14, fontWeight: "700" },
  deviceSub: { fontSize: 11, marginTop: 1 },
  deviceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1 },
  deviceRowLabel: { fontSize: 12 },
  deviceRowValue: { fontSize: 12, fontWeight: "600" },
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
