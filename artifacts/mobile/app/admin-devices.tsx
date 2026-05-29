import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { MOCK_OPERATORS, MOCK_TOLL_PLAZAS } from "@/services/adminData";
import {
  type DevicePlatform,
  type DeviceStatus,
  type AllocStatus,
  type RegisteredDevice,
  type OperatorAllocation,
  getRegisteredDevices,
  getAllocations,
  registerDevice,
  createAllocation,
  updateAllocationStatus,
  updateDeviceStatus,
  getOrCreateDeviceToken,
  getDevicePlatform,
} from "@/services/deviceService";
import { useColors } from "@/hooks/useColors";

/* ── Status metadata ── */
const DEV_STATUS_META: Record<DeviceStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  available: { label: "Available", color: "#16A34A", icon: "checkmark-circle-outline" },
  allocated: { label: "Allocated", color: "#0B7ED4", icon: "phone-portrait-outline" },
  blocked:   { label: "Blocked",   color: "#DC2626", icon: "ban-outline" },
  inactive:  { label: "Inactive",  color: "#607A9B", icon: "ellipse-outline" },
};

const ALLOC_STATUS_META: Record<AllocStatus, { label: string; color: string }> = {
  active:   { label: "Active",   color: "#16A34A" },
  blocked:  { label: "Blocked",  color: "#DC2626" },
  replaced: { label: "Replaced", color: "#D97706" },
  inactive: { label: "Inactive", color: "#607A9B" },
};

/* ── Device Registry Card ── */
function DeviceRegistryCard({
  device, onAction,
}: {
  device: RegisteredDevice;
  onAction: (action: "allocate" | "block" | "unblock" | "deactivate", d: RegisteredDevice) => void;
}) {
  const colors = useColors();
  const meta   = DEV_STATUS_META[device.status];
  return (
    <View style={[rc.card, { backgroundColor: colors.card, borderColor: device.status === "blocked" ? colors.destructive + "44" : colors.border, borderRadius: colors.radius }]}>
      <View style={rc.row}>
        <View style={[rc.platformIcon, { backgroundColor: meta.color + "18" }]}>
          <Ionicons
            name={device.platform === "ios" ? "logo-apple" : device.platform === "android" ? "logo-android" : "globe-outline"}
            size={22} color={meta.color}
          />
        </View>
        <View style={rc.info}>
          <Text style={[rc.name, { color: colors.foreground }]} numberOfLines={1}>{device.deviceName}</Text>
          <Text style={[rc.model, { color: colors.textSecondary }]}>{device.deviceModel}</Text>
          <Text style={[rc.token, { color: colors.textMuted }]} numberOfLines={1}>
            Token: {device.deviceToken.slice(0, 18)}…
          </Text>
        </View>
        <View style={rc.statusCol}>
          <View style={[rc.statusPill, { backgroundColor: meta.color + "18" }]}>
            <Ionicons name={meta.icon} size={11} color={meta.color} />
            <Text style={[rc.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[rc.date, { color: colors.textMuted }]}>{device.registrationDate}</Text>
        </View>
      </View>

      <View style={[rc.actions, { borderTopColor: colors.border }]}>
        {device.status === "available" && (
          <TouchableOpacity style={[rc.btn, { backgroundColor: colors.accent + "18" }]} onPress={() => onAction("allocate", device)}>
            <Ionicons name="person-add-outline" size={13} color={colors.accent} />
            <Text style={[rc.btnText, { color: colors.accent }]}>Allocate</Text>
          </TouchableOpacity>
        )}
        {device.status === "blocked" ? (
          <TouchableOpacity style={[rc.btn, { backgroundColor: colors.success + "18" }]} onPress={() => onAction("unblock", device)}>
            <Ionicons name="checkmark-circle-outline" size={13} color={colors.success} />
            <Text style={[rc.btnText, { color: colors.success }]}>Unblock</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[rc.btn, { backgroundColor: colors.destructive + "18" }]} onPress={() => onAction("block", device)}>
            <Ionicons name="ban-outline" size={13} color={colors.destructive} />
            <Text style={[rc.btnText, { color: colors.destructive }]}>Block</Text>
          </TouchableOpacity>
        )}
        {device.status !== "inactive" && (
          <TouchableOpacity style={[rc.btn, { backgroundColor: colors.muted }]} onPress={() => onAction("deactivate", device)}>
            <Ionicons name="power-outline" size={13} color={colors.textMuted} />
            <Text style={[rc.btnText, { color: colors.textMuted }]}>Deactivate</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ── Allocation Card ── */
function AllocationCard({
  alloc, onAction,
}: {
  alloc: OperatorAllocation;
  onAction: (action: "block" | "replace" | "reassign", a: OperatorAllocation) => void;
}) {
  const colors = useColors();
  const meta   = ALLOC_STATUS_META[alloc.status];
  return (
    <View style={[ac.card, { backgroundColor: colors.card, borderColor: alloc.status === "blocked" ? colors.destructive + "44" : colors.border, borderRadius: colors.radius }]}>
      <View style={ac.header}>
        <View style={[ac.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
        </View>
        <View style={ac.main}>
          <Text style={[ac.operatorName, { color: colors.foreground }]}>{alloc.operatorName}</Text>
          <Text style={[ac.operatorId, { color: colors.textMuted }]}>{alloc.operatorId}</Text>
        </View>
        <View style={[ac.statusPill, { backgroundColor: meta.color + "18" }]}>
          <View style={[ac.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[ac.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={[ac.detailGrid, { borderTopColor: colors.border }]}>
        {[
          { icon: "business-outline" as const,        label: "Plaza",      value: alloc.plazaName },
          { icon: "phone-portrait-outline" as const,  label: "Device",     value: alloc.deviceName },
          { icon: "hardware-chip-outline" as const,   label: "Model",      value: alloc.deviceModel },
          { icon: "calendar-outline" as const,        label: "Allocated",  value: alloc.allocatedAt },
        ].map(({ icon, label, value }) => (
          <View key={label} style={ac.detailItem}>
            <Ionicons name={icon} size={13} color={colors.textMuted} />
            <View>
              <Text style={[ac.detailLabel, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[ac.detailValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
            </View>
          </View>
        ))}
      </View>

      {alloc.status === "active" && (
        <View style={[ac.actions, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={[ac.btn, { backgroundColor: colors.warning + "18" }]} onPress={() => onAction("replace", alloc)}>
            <Ionicons name="swap-horizontal-outline" size={13} color={colors.warning} />
            <Text style={[ac.btnText, { color: colors.warning }]}>Replace</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ac.btn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("reassign", alloc)}>
            <Ionicons name="person-circle-outline" size={13} color={colors.primary} />
            <Text style={[ac.btnText, { color: colors.primary }]}>Reassign</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ac.btn, { backgroundColor: colors.destructive + "18" }]} onPress={() => onAction("block", alloc)}>
            <Ionicons name="ban-outline" size={13} color={colors.destructive} />
            <Text style={[ac.btnText, { color: colors.destructive }]}>Block</Text>
          </TouchableOpacity>
        </View>
      )}
      {alloc.status === "blocked" && alloc.blockReason && (
        <View style={[ac.blockBanner, { backgroundColor: colors.destructive + "12", borderTopColor: colors.destructive + "33" }]}>
          <Ionicons name="warning-outline" size={13} color={colors.destructive} />
          <Text style={[ac.blockText, { color: colors.destructive }]}>Blocked: {alloc.blockReason}</Text>
        </View>
      )}
    </View>
  );
}

/* ══════════════ MAIN SCREEN ══════════════ */

type MainTab   = "registry" | "allocations";
type RegFilter = "all" | "available" | "allocated" | "blocked";
type AlFilter  = "all" | "active" | "replaced" | "blocked";

export default function AdminDevicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 20;

  const [mainTab,    setMainTab]    = useState<MainTab>("registry");
  const [regFilter,  setRegFilter]  = useState<RegFilter>("all");
  const [alFilter,   setAlFilter]   = useState<AlFilter>("all");
  const [devices,    setDevices]    = useState<RegisteredDevice[]>([]);
  const [allocs,     setAllocs]     = useState<OperatorAllocation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  /* Register Device Modal */
  const [showRegModal,  setShowRegModal]  = useState(false);
  const [regName,       setRegName]       = useState("");
  const [regModel,      setRegModel]      = useState("");
  const [regPlatform,   setRegPlatform]   = useState<DevicePlatform>("android");
  const [useCurrentDev, setUseCurrentDev] = useState(true);
  const [manualToken,   setManualToken]   = useState("");

  /* Allocate Device Modal */
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [allocDeviceId,  setAllocDeviceId]  = useState("");
  const [allocOpId,      setAllocOpId]      = useState("");

  /* Action Modal */
  const [actionModal,   setActionModal]   = useState<{ type: "block_device" | "block_alloc" | "replace" | "reassign"; id: string; extra?: string } | null>(null);
  const [actionReason,  setActionReason]  = useState("");
  const [replaceDevId,  setReplaceDevId]  = useState("");
  const [reassignOpId,  setReassignOpId]  = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [d, a] = await Promise.all([getRegisteredDevices(), getAllocations()]);
    setDevices(d);
    setAllocs(a);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Register Device ── */
  const handleRegisterDevice = async () => {
    if (!regName.trim() || !regModel.trim()) {
      Alert.alert("Validation", "Device Name and Model are required.");
      return;
    }
    setSaving(true);
    try {
      let token = manualToken.trim();
      if (useCurrentDev) token = await getOrCreateDeviceToken();
      await registerDevice({
        deviceName: regName.trim(),
        deviceModel: regModel.trim(),
        platform: regPlatform,
        deviceToken: token || `SPT-MANUAL-${Date.now()}`,
        registeredBy: "ADMIN001",
        status: "available",
      });
      setShowRegModal(false);
      setRegName(""); setRegModel(""); setManualToken("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadData();
      Alert.alert("Success", "Device registered successfully.");
    } catch {
      Alert.alert("Error", "Failed to register device.");
    }
    setSaving(false);
  };

  /* ── Allocate Device ── */
  const handleAllocate = async () => {
    if (!allocDeviceId || !allocOpId) {
      Alert.alert("Validation", "Select a device and an operator.");
      return;
    }
    setSaving(true);
    try {
      const device   = devices.find((d) => d.id === allocDeviceId);
      const operator = MOCK_OPERATORS.find((o) => o.id === allocOpId);
      const plaza    = MOCK_TOLL_PLAZAS.find((p) => p.id === operator?.plazaId);
      if (!device || !operator) throw new Error("Invalid selection");
      await createAllocation({
        operatorId:   operator.id,
        operatorName: operator.name,
        plazaId:      plaza?.id ?? "",
        plazaName:    plaza?.name ?? operator.plazaName,
        deviceId:     device.id,
        deviceName:   device.deviceName,
        deviceModel:  device.deviceModel,
        platform:     device.platform,
        deviceToken:  device.deviceToken,
        status:       "active",
        allocatedAt:  new Date().toISOString().split("T")[0],
        allocatedBy:  "ADMIN001",
      });
      setShowAllocModal(false);
      setAllocDeviceId(""); setAllocOpId("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadData();
      Alert.alert("Success", `Device allocated to ${operator.name}.`);
    } catch (e) {
      Alert.alert("Error", "Failed to allocate device.");
    }
    setSaving(false);
  };

  /* ── Device Actions ── */
  const handleDeviceAction = async (action: "allocate" | "block" | "unblock" | "deactivate", device: RegisteredDevice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "allocate") {
      setAllocDeviceId(device.id);
      setShowAllocModal(true);
    } else if (action === "block") {
      setActionModal({ type: "block_device", id: device.id });
    } else if (action === "unblock") {
      await updateDeviceStatus(device.id, "available");
      await loadData();
      Alert.alert("Unblocked", "Device is now available.");
    } else if (action === "deactivate") {
      Alert.alert("Deactivate", "Mark this device as inactive?", [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: async () => { await updateDeviceStatus(device.id, "inactive"); await loadData(); } },
      ]);
    }
  };

  /* ── Allocation Actions ── */
  const handleAllocAction = async (action: "block" | "replace" | "reassign", alloc: OperatorAllocation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "block") {
      setActionModal({ type: "block_alloc", id: alloc.id });
    } else if (action === "replace") {
      setReplaceDevId("");
      setActionModal({ type: "replace", id: alloc.id, extra: alloc.operatorName });
    } else if (action === "reassign") {
      setReassignOpId("");
      setActionModal({ type: "reassign", id: alloc.id, extra: alloc.deviceName });
    }
  };

  /* ── Action Modal Submit ── */
  const handleActionSubmit = async () => {
    if (!actionModal) return;
    setSaving(true);
    try {
      if (actionModal.type === "block_device") {
        await updateDeviceStatus(actionModal.id, "blocked");
        Alert.alert("Blocked", "Device has been blocked.");
      } else if (actionModal.type === "block_alloc") {
        await updateAllocationStatus(actionModal.id, "blocked", actionReason || "Blocked by Admin");
        Alert.alert("Blocked", "Allocation blocked. Operator will be denied attendance access.");
      } else if (actionModal.type === "replace") {
        if (!replaceDevId) { Alert.alert("Select a replacement device."); setSaving(false); return; }
        const oldAlloc = allocs.find((a) => a.id === actionModal.id);
        const newDev   = devices.find((d) => d.id === replaceDevId);
        if (!oldAlloc || !newDev) { setSaving(false); return; }
        await createAllocation({
          operatorId:   oldAlloc.operatorId,
          operatorName: oldAlloc.operatorName,
          plazaId:      oldAlloc.plazaId,
          plazaName:    oldAlloc.plazaName,
          deviceId:     newDev.id,
          deviceName:   newDev.deviceName,
          deviceModel:  newDev.deviceModel,
          platform:     newDev.platform,
          deviceToken:  newDev.deviceToken,
          status:       "active",
          allocatedAt:  new Date().toISOString().split("T")[0],
          allocatedBy:  "ADMIN001",
        });
        Alert.alert("Replaced", "Device replaced and new allocation created.");
      } else if (actionModal.type === "reassign") {
        if (!reassignOpId) { Alert.alert("Select a target operator."); setSaving(false); return; }
        const oldAlloc  = allocs.find((a) => a.id === actionModal.id);
        const newOp     = MOCK_OPERATORS.find((o) => o.id === reassignOpId);
        const newPlaza  = MOCK_TOLL_PLAZAS.find((p) => p.id === newOp?.plazaId);
        if (!oldAlloc || !newOp) { setSaving(false); return; }
        await updateAllocationStatus(actionModal.id, "replaced", "Reassigned to new operator");
        await createAllocation({
          operatorId:   newOp.id,
          operatorName: newOp.name,
          plazaId:      newPlaza?.id ?? "",
          plazaName:    newPlaza?.name ?? newOp.plazaName,
          deviceId:     oldAlloc.deviceId,
          deviceName:   oldAlloc.deviceName,
          deviceModel:  oldAlloc.deviceModel,
          platform:     oldAlloc.platform,
          deviceToken:  oldAlloc.deviceToken,
          status:       "active",
          allocatedAt:  new Date().toISOString().split("T")[0],
          allocatedBy:  "ADMIN001",
        });
        Alert.alert("Reassigned", `Device reassigned to ${newOp.name}.`);
      }
      setActionModal(null);
      setActionReason(""); setReplaceDevId(""); setReassignOpId("");
      await loadData();
    } catch {
      Alert.alert("Error", "Action failed.");
    }
    setSaving(false);
  };

  /* ── Filtered data ── */
  const filteredDevices = devices.filter((d) => regFilter === "all" ? true : d.status === regFilter);
  const filteredAllocs  = allocs.filter((a) => alFilter === "all" ? true : a.status === alFilter);
  const availableDevs   = devices.filter((d) => d.status === "available");
  const activeOperators = MOCK_OPERATORS.filter((o) => o.status === "active");

  /* ── KPI row ── */
  const kpis = [
    { label: "Registered", value: devices.length,                        color: colors.primary },
    { label: "Available",  value: devices.filter((d) => d.status === "available").length,  color: colors.success },
    { label: "Allocated",  value: devices.filter((d) => d.status === "allocated").length,  color: colors.accent },
    { label: "Blocked",    value: devices.filter((d) => d.status === "blocked").length,    color: colors.destructive },
  ];

  return (
    <DrawerOverlay>
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Device Management" showBack />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[st.scroll, { paddingBottom: botPad }]}>

          {/* KPI Row */}
          <View style={st.kpiRow}>
            {kpis.map((k) => (
              <View key={k.label} style={[st.kpiCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[st.kpiValue, { color: k.color }]}>{k.value}</Text>
                <Text style={[st.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Main Tabs */}
          <View style={[st.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {([["registry", "Device Registry"], ["allocations", "Allocations"]] as [MainTab, string][]).map(([tab, label]) => (
              <TouchableOpacity
                key={tab}
                style={[st.tab, mainTab === tab && { borderBottomColor: colors.accent, borderBottomWidth: 2.5 }]}
                onPress={() => { setMainTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[st.tabText, { color: mainTab === tab ? colors.accent : colors.textMuted, fontWeight: mainTab === tab ? "700" : "500" }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : mainTab === "registry" ? (
            <>
              {/* Registry Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll} contentContainerStyle={st.filterRow}>
                {(["all", "available", "allocated", "blocked"] as RegFilter[]).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[st.filterPill, { backgroundColor: regFilter === f ? colors.primary : colors.card, borderColor: regFilter === f ? colors.primary : colors.border }]}
                    onPress={() => { setRegFilter(f); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[st.filterText, { color: regFilter === f ? "#fff" : colors.textSecondary }]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {f !== "all" ? ` (${devices.filter((d) => d.status === f).length})` : ` (${devices.length})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Register Button */}
              <TouchableOpacity
                style={[st.addBtn, { backgroundColor: colors.accent, borderRadius: colors.radius }]}
                onPress={() => { setShowRegModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={st.addBtnText}>Register New Device</Text>
              </TouchableOpacity>

              {filteredDevices.length === 0 ? (
                <View style={st.empty}>
                  <Ionicons name="phone-portrait-outline" size={40} color={colors.textMuted} />
                  <Text style={[st.emptyText, { color: colors.textMuted }]}>No devices found</Text>
                </View>
              ) : (
                filteredDevices.map((d) => (
                  <DeviceRegistryCard key={d.id} device={d} onAction={handleDeviceAction} />
                ))
              )}
            </>
          ) : (
            <>
              {/* Allocation Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll} contentContainerStyle={st.filterRow}>
                {(["all", "active", "replaced", "blocked"] as AlFilter[]).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[st.filterPill, { backgroundColor: alFilter === f ? colors.primary : colors.card, borderColor: alFilter === f ? colors.primary : colors.border }]}
                    onPress={() => { setAlFilter(f); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[st.filterText, { color: alFilter === f ? "#fff" : colors.textSecondary }]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {f !== "all" ? ` (${allocs.filter((a) => a.status === f).length})` : ` (${allocs.length})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Allocate Button */}
              <TouchableOpacity
                style={[st.addBtn, { backgroundColor: colors.accent, borderRadius: colors.radius }]}
                onPress={() => { setAllocDeviceId(""); setAllocOpId(""); setShowAllocModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              >
                <Ionicons name="link-outline" size={18} color="#fff" />
                <Text style={st.addBtnText}>Allocate Device to Operator</Text>
              </TouchableOpacity>

              {filteredAllocs.length === 0 ? (
                <View style={st.empty}>
                  <Ionicons name="link-outline" size={40} color={colors.textMuted} />
                  <Text style={[st.emptyText, { color: colors.textMuted }]}>No allocations found</Text>
                </View>
              ) : (
                filteredAllocs.map((a) => (
                  <AllocationCard key={a.id} alloc={a} onAction={handleAllocAction} />
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>

      {/* ── Register Device Modal ── */}
      <Modal visible={showRegModal} animationType="slide" transparent onRequestClose={() => setShowRegModal(false)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.modalTitle, { color: colors.foreground }]}>Register New Device</Text>
              <TouchableOpacity onPress={() => setShowRegModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.modalBody} keyboardShouldPersistTaps="handled">
              <View style={[st.field, { gap: 6 }]}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Device Name *</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Field Device 2"
                  placeholderTextColor={colors.mutedForeground}
                  value={regName}
                  onChangeText={setRegName}
                />
              </View>
              <View style={[st.field, { gap: 6 }]}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Device Model *</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Samsung Galaxy A54"
                  placeholderTextColor={colors.mutedForeground}
                  value={regModel}
                  onChangeText={setRegModel}
                />
              </View>
              <View style={[st.field, { gap: 6 }]}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Platform</Text>
                <View style={st.platformRow}>
                  {(["android", "ios", "web"] as DevicePlatform[]).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[st.platformPill, { backgroundColor: regPlatform === p ? colors.primary : colors.surface, borderColor: regPlatform === p ? colors.primary : colors.border }]}
                      onPress={() => setRegPlatform(p)}
                    >
                      <Ionicons name={p === "ios" ? "logo-apple" : p === "android" ? "logo-android" : "globe-outline"} size={14} color={regPlatform === p ? "#fff" : colors.textSecondary} />
                      <Text style={[st.platformText, { color: regPlatform === p ? "#fff" : colors.textSecondary }]}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={[st.field, { gap: 6 }]}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Device Token</Text>
                <TouchableOpacity
                  style={[st.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setUseCurrentDev(!useCurrentDev)}
                >
                  <Ionicons name={useCurrentDev ? "checkbox-outline" : "square-outline"} size={20} color={colors.primary} />
                  <Text style={[st.toggleText, { color: colors.foreground }]}>Use this device's token (recommended)</Text>
                </TouchableOpacity>
                {!useCurrentDev && (
                  <TextInput
                    style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="SPT-PLATFORM-XXXXXXXX"
                    placeholderTextColor={colors.mutedForeground}
                    value={manualToken}
                    onChangeText={setManualToken}
                    autoCapitalize="characters"
                  />
                )}
              </View>
            </ScrollView>
            <View style={[st.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowRegModal(false)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, { backgroundColor: colors.accent }]} onPress={handleRegisterDevice} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.confirmText}>Register Device</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Allocate Device Modal ── */}
      <Modal visible={showAllocModal} animationType="slide" transparent onRequestClose={() => setShowAllocModal(false)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.modalTitle, { color: colors.foreground }]}>Allocate Device</Text>
              <TouchableOpacity onPress={() => setShowAllocModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.modalBody}>
              <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Select Available Device</Text>
              {availableDevs.length === 0 ? (
                <View style={[st.noDevices, { backgroundColor: colors.surface, borderRadius: colors.radius }]}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
                  <Text style={[st.noDevicesText, { color: colors.textMuted }]}>No available devices. Register a device first.</Text>
                </View>
              ) : (
                availableDevs.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[st.selectRow, { backgroundColor: allocDeviceId === d.id ? colors.primary + "18" : colors.surface, borderColor: allocDeviceId === d.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                    onPress={() => setAllocDeviceId(d.id)}
                  >
                    <Ionicons name={d.platform === "ios" ? "logo-apple" : "logo-android"} size={18} color={allocDeviceId === d.id ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.selectMain, { color: colors.foreground }]}>{d.deviceName}</Text>
                      <Text style={[st.selectSub, { color: colors.textMuted }]}>{d.deviceModel}</Text>
                    </View>
                    {allocDeviceId === d.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}

              <Text style={[st.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>Select Operator</Text>
              {activeOperators.map((op) => {
                const plaza = MOCK_TOLL_PLAZAS.find((p) => p.id === op.plazaId);
                return (
                  <TouchableOpacity
                    key={op.id}
                    style={[st.selectRow, { backgroundColor: allocOpId === op.id ? colors.primary + "18" : colors.surface, borderColor: allocOpId === op.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                    onPress={() => setAllocOpId(op.id)}
                  >
                    <Ionicons name="person-circle-outline" size={18} color={allocOpId === op.id ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.selectMain, { color: colors.foreground }]}>{op.name}</Text>
                      <Text style={[st.selectSub, { color: colors.textMuted }]}>{op.id} · {plaza?.name ?? op.plazaName}</Text>
                    </View>
                    {allocOpId === op.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}

              {allocOpId && allocDeviceId && (
                <View style={[st.allocSummary, { backgroundColor: colors.success + "12", borderColor: colors.success + "44", borderRadius: colors.radius }]}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                  <Text style={[st.allocSummaryText, { color: colors.success }]}>
                    "{devices.find((d) => d.id === allocDeviceId)?.deviceName}" → {MOCK_OPERATORS.find((o) => o.id === allocOpId)?.name}
                  </Text>
                </View>
              )}
            </ScrollView>
            <View style={[st.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowAllocModal(false)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, { backgroundColor: colors.accent }]} onPress={handleAllocate} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.confirmText}>Allocate</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Action Modal (Block/Replace/Reassign) ── */}
      <Modal visible={!!actionModal} animationType="fade" transparent onRequestClose={() => setActionModal(null)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.modalTitle, { color: colors.foreground }]}>
                {actionModal?.type === "block_device" ? "Block Device"
                  : actionModal?.type === "block_alloc" ? "Block Allocation"
                  : actionModal?.type === "replace"     ? "Replace Device"
                  : "Reassign Device"}
              </Text>
              <TouchableOpacity onPress={() => setActionModal(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.modalBody}>
              {(actionModal?.type === "block_device" || actionModal?.type === "block_alloc") && (
                <View style={{ gap: 8 }}>
                  <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Block Reason (optional)</Text>
                  <TextInput
                    style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, height: 80, textAlignVertical: "top", paddingTop: 10 }]}
                    placeholder="Enter reason for blocking…"
                    placeholderTextColor={colors.mutedForeground}
                    value={actionReason}
                    onChangeText={setActionReason}
                    multiline
                  />
                  <View style={[st.warnBanner, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "33", borderRadius: colors.radius }]}>
                    <Ionicons name="warning-outline" size={14} color={colors.destructive} />
                    <Text style={[st.warnText, { color: colors.destructive }]}>
                      This will block all attendance operations for the assigned operator.
                    </Text>
                  </View>
                </View>
              )}
              {actionModal?.type === "replace" && (
                <View style={{ gap: 10 }}>
                  <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Select Replacement Device</Text>
                  {availableDevs.length === 0 ? (
                    <Text style={[{ color: colors.textMuted, textAlign: "center" }]}>No available devices to replace with.</Text>
                  ) : (
                    availableDevs.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={[st.selectRow, { backgroundColor: replaceDevId === d.id ? colors.warning + "18" : colors.surface, borderColor: replaceDevId === d.id ? colors.warning : colors.border, borderRadius: colors.radius }]}
                        onPress={() => setReplaceDevId(d.id)}
                      >
                        <Ionicons name="phone-portrait-outline" size={18} color={replaceDevId === d.id ? colors.warning : colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[st.selectMain, { color: colors.foreground }]}>{d.deviceName}</Text>
                          <Text style={[st.selectSub, { color: colors.textMuted }]}>{d.deviceModel}</Text>
                        </View>
                        {replaceDevId === d.id && <Ionicons name="checkmark-circle" size={18} color={colors.warning} />}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
              {actionModal?.type === "reassign" && (
                <View style={{ gap: 10 }}>
                  <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Select New Operator</Text>
                  {activeOperators.map((op) => (
                    <TouchableOpacity
                      key={op.id}
                      style={[st.selectRow, { backgroundColor: reassignOpId === op.id ? colors.primary + "18" : colors.surface, borderColor: reassignOpId === op.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                      onPress={() => setReassignOpId(op.id)}
                    >
                      <Ionicons name="person-circle-outline" size={18} color={reassignOpId === op.id ? colors.primary : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.selectMain, { color: colors.foreground }]}>{op.name}</Text>
                        <Text style={[st.selectSub, { color: colors.textMuted }]}>{op.plazaName}</Text>
                      </View>
                      {reassignOpId === op.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <View style={[st.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setActionModal(null)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: actionModal?.type?.startsWith("block") ? colors.destructive : colors.accent }]}
                onPress={handleActionSubmit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.confirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </DrawerOverlay>
  );
}

/* ── Styles ── */
const st = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 12 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  kpiCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center", gap: 2 },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 10, fontWeight: "600" },
  tabBar: { flexDirection: "row", borderWidth: 1, borderRadius: 10, overflow: "hidden", marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 13 },
  filterScroll: { marginBottom: 8 },
  filterRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: "600" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, marginBottom: 8 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14 },
  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%", overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalBody: { paddingHorizontal: 20, paddingVertical: 16, flexGrow: 0 },
  modalFooter: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 14 },
  platformRow: { flexDirection: "row", gap: 8 },
  platformPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  platformText: { fontSize: 13, fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  toggleText: { flex: 1, fontSize: 13 },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  selectRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, marginBottom: 8 },
  selectMain: { fontSize: 14, fontWeight: "600" },
  selectSub: { fontSize: 12 },
  allocSummary: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, marginTop: 8 },
  allocSummaryText: { flex: 1, fontSize: 13, fontWeight: "600" },
  noDevices: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  noDevicesText: { flex: 1, fontSize: 13 },
  warnBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderWidth: 1 },
  warnText: { flex: 1, fontSize: 12, lineHeight: 18 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14, fontWeight: "600" },
  confirmBtn: { flex: 1, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

const rc = StyleSheet.create({
  card: { borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  platformIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: "700" },
  model: { fontSize: 12 },
  token: { fontSize: 10 },
  statusCol: { alignItems: "flex-end", gap: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "600" },
  date: { fontSize: 10 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8 },
  btnText: { fontSize: 12, fontWeight: "600" },
});

const ac = StyleSheet.create({
  card: { borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  main: { flex: 1 },
  operatorName: { fontSize: 14, fontWeight: "700" },
  operatorId: { fontSize: 12 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, gap: 10 },
  detailItem: { width: "46%", flexDirection: "row", alignItems: "flex-start", gap: 6 },
  detailLabel: { fontSize: 10, fontWeight: "600" },
  detailValue: { fontSize: 12, fontWeight: "500" },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8 },
  btnText: { fontSize: 12, fontWeight: "600" },
  blockBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1 },
  blockText: { flex: 1, fontSize: 12 },
});
