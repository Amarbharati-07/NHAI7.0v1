import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { useAdminData } from "@/contexts/AdminDataContext";
import { apiPostJson, apiPutJson, isApiConfigured, withTimeout } from "@/services/apiConfig";
import { friendlyErrorMessage } from "@/services/userMessages";
import {
  type DevicePlatform,
  type DeviceStatus,
  type AllocStatus,
  type RegisteredDevice,
  type OperatorAllocation,
  type AllocationHistoryEntry,
  getRegisteredDevices,
  getAllocations,
  registerDevice,
  deleteRegisteredDevice,
  createAllocation,
  updateAllocationStatus,
  updateDeviceStatus,
  getOrCreateDeviceToken,
  getDevicePlatform,
  getDefaultOsVersion,
  generateDeviceToken,
  generateAppToken,
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

function dedupeAllocationsForUI(allocations: OperatorAllocation[]): OperatorAllocation[] {
  const seenIds = new Set<string>();
  const seenBusinessKeys = new Set<string>();
  return allocations.filter((allocation) => {
    const allocationId = String(allocation.id ?? "").trim().toUpperCase();
    const businessKey = `${allocation.deviceId}|${allocation.operatorId}|${allocation.plazaId}|${allocation.status}`.toUpperCase();
    if (seenIds.has(allocationId) || seenBusinessKeys.has(businessKey)) return false;
    seenIds.add(allocationId);
    seenBusinessKeys.add(businessKey);
    return true;
  });
}

/* ── Device Registry Card ── */
function DeviceRegistryCard({
  device, onAction, onViewHistory,
}: {
  device: RegisteredDevice;
  onAction: (action: "allocate" | "block" | "unblock" | "deactivate" | "delete", d: RegisteredDevice) => void;
  onViewHistory: (d: RegisteredDevice) => void;
}) {
  const colors = useColors();
  const meta = DEV_STATUS_META[device.status];
  const [expanded, setExpanded] = useState(false);

  const healthColor =
    device.status === "allocated" && device.lastActiveTime !== "Never"
      ? colors.success
      : device.status === "available"
      ? colors.warning
      : device.status === "blocked"
      ? colors.destructive
      : colors.textMuted;

  return (
    <View style={[rc.card, { backgroundColor: colors.card, borderColor: device.status === "blocked" ? colors.destructive + "44" : colors.border, borderRadius: colors.radius }]}>
      {/* Header Row */}
      <View style={rc.headerRow}>
        <View style={[rc.platformIcon, { backgroundColor: meta.color + "18" }]}>
          <Ionicons
            name={device.platform === "ios" ? "logo-apple" : device.platform === "android" ? "logo-android" : "globe-outline"}
            size={22} color={meta.color}
          />
        </View>
        <View style={rc.info}>
          <View style={rc.nameLine}>
            <Text style={[rc.devId, { color: colors.accent }]}>{device.id}</Text>
            <Text style={[rc.name, { color: colors.foreground }]} numberOfLines={1}>{device.deviceName}</Text>
          </View>
          <Text style={[rc.model, { color: colors.textSecondary }]}>{device.deviceModel} · {device.osVersion}</Text>
          {device.imeiNumber && device.imeiNumber !== "N/A" && (
            <Text style={[rc.imei, { color: colors.textMuted }]} numberOfLines={1} selectable>
              IMEI: {device.imeiNumber}
            </Text>
          )}
          <Text style={[rc.token, { color: colors.textMuted }]} numberOfLines={1} selectable>
            Token: {device.deviceToken}
          </Text>
        </View>
        <View style={rc.statusCol}>
          <View style={[rc.statusPill, { backgroundColor: meta.color + "18" }]}>
            <Ionicons name={meta.icon} size={11} color={meta.color} />
            <Text style={[rc.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={[rc.healthDot, { backgroundColor: healthColor }]} />
          <TouchableOpacity
            style={[rc.deleteIconBtn, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "33" }]}
            onPress={() => onAction("delete", device)}
            accessibilityLabel="Delete device"
          >
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Info Grid */}
      <View style={[rc.infoGrid, { borderTopColor: colors.border }]}>
        <View style={rc.infoCell}>
          <Text style={[rc.infoLabel, { color: colors.textMuted }]}>Registered</Text>
          <Text style={[rc.infoValue, { color: colors.foreground }]}>{device.registrationDate}</Text>
          <Text style={[rc.infoSub, { color: colors.textMuted }]}>{device.registrationTime}</Text>
        </View>
        <View style={[rc.infoCellDivider, { backgroundColor: colors.border }]} />
        <View style={rc.infoCell}>
          <Text style={[rc.infoLabel, { color: colors.textMuted }]}>Reg. By</Text>
          <Text style={[rc.infoValue, { color: colors.foreground }]}>{device.registeredBy}</Text>
        </View>
        <View style={[rc.infoCellDivider, { backgroundColor: colors.border }]} />
        <View style={rc.infoCell}>
          <Text style={[rc.infoLabel, { color: colors.textMuted }]}>Last Active</Text>
          <Text style={[rc.infoValue, { color: device.lastActiveTime === "Never" ? colors.textMuted : colors.foreground }]} numberOfLines={1}>
            {device.lastActiveTime}
          </Text>
        </View>
        <View style={[rc.infoCellDivider, { backgroundColor: colors.border }]} />
        <View style={rc.infoCell}>
          <Text style={[rc.infoLabel, { color: colors.textMuted }]}>Last Login</Text>
          <Text style={[rc.infoValue, { color: device.lastLoginTime === "Never" ? colors.textMuted : colors.foreground }]} numberOfLines={1}>
            {device.lastLoginTime}
          </Text>
        </View>
      </View>

      {/* Assignment Row */}
      <View style={[rc.assignRow, { borderTopColor: colors.border, backgroundColor: device.assignedOperatorId ? colors.primary + "08" : "transparent" }]}>
        <Ionicons
          name={device.assignedOperatorId ? "person-circle" : "person-circle-outline"}
          size={14} color={device.assignedOperatorId ? colors.accent : colors.textMuted}
        />
        <Text style={[rc.assignText, { color: device.assignedOperatorId ? colors.foreground : colors.textMuted }]} numberOfLines={1}>
          {device.assignedOperatorId ? `${device.assignedOperatorName}` : "Not Assigned"}
        </Text>
        {device.assignedPlazaId ? (
          <>
            <Text style={[rc.assignSep, { color: colors.textMuted }]}>·</Text>
            <Ionicons name="business-outline" size={12} color={colors.textMuted} />
            <Text style={[rc.assignSub, { color: colors.textMuted }]} numberOfLines={1}>{device.assignedPlazaName}</Text>
          </>
        ) : null}
        {device.allocationHistory.length > 0 && (
          <TouchableOpacity
            style={[rc.histBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "33" }]}
            onPress={() => onViewHistory(device)}
          >
            <Ionicons name="time-outline" size={11} color={colors.accent} />
            <Text style={[rc.histBtnText, { color: colors.accent }]}>{device.allocationHistory.length} hist.</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* App Token (expandable) */}
      <TouchableOpacity
        style={[rc.expandRow, { borderTopColor: colors.border }]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name="shield-checkmark-outline" size={13} color={colors.textMuted} />
        <Text style={[rc.expandLabel, { color: colors.textMuted }]}>App Token</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={13} color={colors.textMuted} />
      </TouchableOpacity>
      {expanded && (
        <View style={[rc.tokenExpanded, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[rc.tokenFull, { color: colors.textSecondary }]} selectable>{device.appToken}</Text>
        </View>
      )}

      {/* Actions */}
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
        <TouchableOpacity style={[rc.btn, { backgroundColor: colors.destructive + "18" }]} onPress={() => onAction("delete", device)}>
          <Ionicons name="trash-outline" size={13} color={colors.destructive} />
          <Text style={[rc.btnText, { color: colors.destructive }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Allocation Card ── */
function AllocationCard({
  alloc, devices, onAction,
}: {
  alloc: OperatorAllocation;
  devices: RegisteredDevice[];
  onAction: (action: "block" | "replace" | "reassign", a: OperatorAllocation) => void;
}) {
  const colors = useColors();
  const meta = ALLOC_STATUS_META[alloc.status];
  const device = devices.find((d) => d.id === alloc.deviceId);

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
          { icon: "business-outline" as const,       label: "Plaza",      value: alloc.plazaName },
          { icon: "phone-portrait-outline" as const,  label: "Device",     value: `${alloc.deviceId} · ${alloc.deviceName}` },
          { icon: "hardware-chip-outline" as const,   label: "Model",      value: alloc.deviceModel },
          { icon: "calendar-outline" as const,        label: "Allocated",  value: alloc.allocatedAt },
          { icon: "key-outline" as const,             label: "Token",      value: alloc.deviceToken ? alloc.deviceToken.slice(0, 20) + "…" : "N/A" },
          { icon: "person-outline" as const,          label: "By Admin",   value: alloc.allocatedBy },
        ].map(({ icon, label, value }) => (
          <View key={label} style={ac.detailItem}>
            <Ionicons name={icon} size={12} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[ac.detailLabel, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[ac.detailValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
            </View>
          </View>
        ))}
      </View>

      {device && (
        <View style={[ac.deviceBadge, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name={device.platform === "ios" ? "logo-apple" : device.platform === "android" ? "logo-android" : "globe-outline"} size={12} color={colors.textMuted} />
          <Text style={[ac.deviceBadgeText, { color: colors.textMuted }]}>{device.osVersion} · Last active: {device.lastActiveTime}</Text>
        </View>
      )}

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
  const { deleteDevice, plazas, operators, refresh: refreshAdminData, apiError } = useAdminData();
  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 20;

  const [mainTab,   setMainTab]   = useState<MainTab>("registry");
  const [regFilter, setRegFilter] = useState<RegFilter>("all");
  const [alFilter,  setAlFilter]  = useState<AlFilter>("all");
  const [devices,   setDevices]   = useState<RegisteredDevice[]>([]);
  const [allocs,    setAllocs]    = useState<OperatorAllocation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  /* Register Device Modal */
  const [showRegModal,   setShowRegModal]   = useState(false);
  const [regName,        setRegName]        = useState("");
  const [regModel,       setRegModel]       = useState("");
  const [regImei,        setRegImei]        = useState("");
  const [regOsVersion,   setRegOsVersion]   = useState("");
  const [regPlatform,    setRegPlatform]    = useState<DevicePlatform>("android");
  const [regToken,       setRegToken]       = useState("");
  const [regAppToken,    setRegAppToken]    = useState("");
  const [useCurrentDev,  setUseCurrentDev]  = useState(false);
  const [tokenGenMsg,    setTokenGenMsg]    = useState("");  // Inline confirmation for token gen
  const [previewDevId,   setPreviewDevId]   = useState(""); // Preview of auto-generated ID
  const [regPlazaId,     setRegPlazaId]     = useState("");

  /* Allocate Device Modal */
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [allocDeviceId,  setAllocDeviceId]  = useState("");
  const [allocOpId,      setAllocOpId]      = useState("");

  /* Action Modal */
  const [actionModal,   setActionModal]   = useState<{ type: "block_device" | "block_alloc" | "replace" | "reassign" | "deactivate"; id: string; extra?: string } | null>(null);
  const [actionReason,  setActionReason]  = useState("");
  const [replaceDevId,  setReplaceDevId]  = useState("");
  const [reassignOpId,  setReassignOpId]  = useState("");

  /* History Modal */
  const [historyDevice, setHistoryDevice] = useState<RegisteredDevice | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const syncDeviceToServer = useCallback(
    async (
      deviceId: string,
      payload: {
        deviceName?: string;
        deviceType?: DevicePlatform;
        deviceModel?: string;
        imei?: string;
        deviceToken?: string;
        operatorId?: string;
        operatorName?: string;
        plazaName?: string;
        status?: string;
        performedBy?: string;
      },
    ) => {
      if (!isApiConfigured()) return;
      await apiPutJson(`admin/devices/${encodeURIComponent(deviceId)}`, payload, 15000);
    },
    [],
  );

  const registerDeviceOnServer = useCallback(
    async (payload: {
      deviceId: string;
      deviceName: string;
      deviceType: DevicePlatform;
      deviceModel: string;
      imei: string;
      deviceToken?: string;
      operatorId?: string;
      operatorName?: string;
      plazaId?: string;
      plazaName?: string;
      status?: string;
    }) => {
      if (!isApiConfigured()) return;
      console.info("[admin-devices] register request", {
        url: "/api/admin/devices",
        payload: { ...payload, performedBy: "ADMIN001" },
      });
      await apiPostJson("admin/devices", { ...payload, performedBy: "ADMIN001" }, 15000);
    },
    [],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, a] = await withTimeout(
        Promise.all([getRegisteredDevices(), getAllocations()]),
        10000,
        "Device data load",
      );
      setDevices(d);
      const nextAllocations = dedupeAllocationsForUI(a);
      setAllocs(nextAllocations);
      console.info("[admin-devices] allocated devices list:", nextAllocations.map((allocation) => ({
        id: allocation.id,
        deviceId: allocation.deviceId,
        operatorId: allocation.operatorId,
        plazaId: allocation.plazaId,
        status: allocation.status,
      })));
      setLoadError("");
    } catch (err) {
      console.error("[admin-devices] loadData error:", err);
      setLoadError(friendlyErrorMessage(err, "Unable to load device data. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      void refreshAdminData();
    }, [loadData, refreshAdminData]),
  );

  /* Open registration modal — tokens start empty until user explicitly opts in */
  const openRegModal = async () => {
    try {
      const existingDevices = await getRegisteredDevices();
      const nums = existingDevices
        .map((d) => parseInt(d.id.replace("DEV", ""), 10))
        .filter((n) => !isNaN(n));
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      setPreviewDevId(`DEV${String(next).padStart(3, "0")}`);

      const platform = getDevicePlatform();
      setRegPlatform(platform);
      setRegOsVersion(getDefaultOsVersion(platform));

      /* Reset everything — tokens remain empty until checkbox is checked */
      setUseCurrentDev(false);
      setRegToken("");
      setRegAppToken("");
      setTokenGenMsg("");
      setRegName("");
      setRegModel("");
      setRegImei("");
      setRegPlazaId("");
      setShowRegModal(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error("[admin-devices] openRegModal error:", err);
      Alert.alert(
        "Unable to open registration",
        friendlyErrorMessage(err, "Could not prepare the device form. Please try again."),
      );
    }
  };

  /* Regenerate tokens — only callable when checkbox is already checked */
  const refreshTokens = async () => {
    if (!useCurrentDev) return;
    const tok = await getOrCreateDeviceToken();
    setRegToken(tok);
    setRegAppToken(generateAppToken());
    setTokenGenMsg("Tokens regenerated successfully.");
    setTimeout(() => setTokenGenMsg(""), 3000);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  /* ── Register Device ── */
  const handleRegisterDevice = async () => {
    if (!regName.trim() || !regModel.trim()) return;
    setSaving(true);
    let createdLocalDevice: RegisteredDevice | null = null;
    try {
      const plaza = plazas.find((p) => p.id === regPlazaId);
      createdLocalDevice = await registerDevice({
        deviceName:        regName.trim(),
        deviceModel:       regModel.trim(),
        imeiNumber:        regPlatform === "web" ? "N/A" : regImei.trim() || "N/A",
        platform:          regPlatform,
        osVersion:         regOsVersion.trim() || getDefaultOsVersion(regPlatform),
        deviceToken:       regToken,
        registeredBy:      "ADMIN001",
        assignedPlazaId:   plaza?.id,
        assignedPlazaName: plaza?.name,
      });
      await registerDeviceOnServer({
        deviceId: createdLocalDevice.id,
        deviceName: createdLocalDevice.deviceName,
        deviceType: createdLocalDevice.platform,
        deviceModel: createdLocalDevice.deviceModel,
        imei: createdLocalDevice.imeiNumber,
        deviceToken: createdLocalDevice.deviceToken,
        operatorId: plaza?.operatorId ?? "",
        operatorName: plaza?.operatorName ?? "Unassigned",
        plazaId: plaza?.id ?? "",
        plazaName: createdLocalDevice.assignedPlazaName,
        status: "pending",
      });
      setShowRegModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadData();
      await refreshAdminData();
      showSuccess(`Device "${regName}" registered as ${previewDevId}.`);
    } catch (err) {
      console.error("[admin-devices] register error:", err);
      if (createdLocalDevice) {
        try {
          await deleteRegisteredDevice(createdLocalDevice.id);
        } catch (rollbackErr) {
          console.warn("[admin-devices] rollback local device failed:", rollbackErr);
        }
      }
      Alert.alert("Register failed", friendlyErrorMessage(err, "Unable to register this device. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  /* ── Allocate Device ── */
  const handleAllocate = async () => {
    if (!allocDeviceId || !allocOpId) return;
    setSaving(true);
    try {
      const device   = devices.find((d) => d.id === allocDeviceId);
      const operator = operators.find((o) => o.id === allocOpId);
      const plaza    = plazas.find((p) => p.id === operator?.plazaId);
      if (!device || !operator) throw new Error("Invalid selection");
      await syncDeviceToServer(device.id, {
        operatorId: operator.id,
        operatorName: operator.name,
        plazaName: plaza?.name ?? operator.plazaName,
        status: "active",
        deviceToken: device.deviceToken,
        performedBy: "ADMIN001",
      });
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
        appToken:     device.appToken,
        status:       "active",
        allocatedAt:  new Date().toISOString().split("T")[0],
        allocatedBy:  "ADMIN001",
      });
      setShowAllocModal(false);
      setAllocDeviceId(""); setAllocOpId("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadData();
      await refreshAdminData();
      showSuccess(`${device.id} allocated to ${operator.name}.`);
    } catch (err) {
      console.error("[admin-devices] allocate error:", err);
      Alert.alert("Allocate failed", friendlyErrorMessage(err, "Unable to allocate this device. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  /* ── Device Actions ── */
  const handleDeviceAction = (
    action: "allocate" | "block" | "unblock" | "deactivate" | "delete",
    device: RegisteredDevice,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "allocate") {
      setAllocDeviceId(device.id);
      setAllocOpId("");
      setShowAllocModal(true);
    } else if (action === "block") {
      setActionReason("");
      setActionModal({ type: "block_device", id: device.id });
    } else if (action === "unblock") {
      setActionModal({ type: "deactivate", id: device.id, extra: "unblock" });
    } else if (action === "deactivate") {
      setActionModal({ type: "deactivate", id: device.id, extra: "deactivate" });
    } else if (action === "delete") {
      Alert.alert(
        "Delete Device",
        `Permanently delete ${device.id} (${device.deviceName})? All allocations for this device will be removed.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setSaving(true);
              try {
                await deleteDevice(device.id);
                await loadData();
                showSuccess(`${device.id} deleted.`);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {
                console.error("[admin-devices] delete error:", e);
                Alert.alert("Delete failed", friendlyErrorMessage(e, "Unable to delete this device. Please try again."));
              } finally {
                setSaving(false);
              }
            },
          },
        ],
      );
    }
  };

  /* ── Allocation Actions ── */
  const handleAllocAction = (action: "block" | "replace" | "reassign", alloc: OperatorAllocation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (action === "block") {
      setActionReason("");
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
        await syncDeviceToServer(actionModal.id, {
          status: "blocked",
          performedBy: "ADMIN001",
        });
        showSuccess("Device blocked successfully.");
      } else if (actionModal.type === "deactivate") {
        if (actionModal.extra === "unblock") {
          await updateDeviceStatus(actionModal.id, "available");
          await syncDeviceToServer(actionModal.id, {
            status: "pending",
            performedBy: "ADMIN001",
          });
          showSuccess("Device unblocked — now available.");
        } else {
          await updateDeviceStatus(actionModal.id, "inactive");
          await syncDeviceToServer(actionModal.id, {
            status: "inactive",
            performedBy: "ADMIN001",
          });
          showSuccess("Device deactivated.");
        }
      } else if (actionModal.type === "block_alloc") {
        await updateAllocationStatus(actionModal.id, "blocked", actionReason || "Blocked by Admin");
        showSuccess("Allocation blocked. Operator access revoked.");
      } else if (actionModal.type === "replace") {
        if (!replaceDevId) { setSaving(false); return; }
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
          appToken:     newDev.appToken,
          status:       "active",
          allocatedAt:  new Date().toISOString().split("T")[0],
          allocatedBy:  "ADMIN001",
        });
        await syncDeviceToServer(newDev.id, {
          operatorId: oldAlloc.operatorId,
          operatorName: oldAlloc.operatorName,
          plazaName: oldAlloc.plazaName,
          status: "active",
          deviceToken: newDev.deviceToken,
          performedBy: "ADMIN001",
        });
        showSuccess(`Device replaced with ${newDev.id}.`);
      } else if (actionModal.type === "reassign") {
        if (!reassignOpId) { setSaving(false); return; }
        const oldAlloc  = allocs.find((a) => a.id === actionModal.id);
        const newOp     = operators.find((o) => o.id === reassignOpId);
        const newPlaza  = plazas.find((p) => p.id === newOp?.plazaId);
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
          appToken:     oldAlloc.appToken,
          status:       "active",
          allocatedAt:  new Date().toISOString().split("T")[0],
          allocatedBy:  "ADMIN001",
        });
        await syncDeviceToServer(oldAlloc.deviceId, {
          operatorId: newOp.id,
          operatorName: newOp.name,
          plazaName: newPlaza?.name ?? newOp.plazaName,
          status: "active",
          deviceToken: oldAlloc.deviceToken,
          performedBy: "ADMIN001",
        });
        showSuccess(`Device reassigned to ${newOp.name}.`);
      }
      setActionModal(null);
      setActionReason(""); setReplaceDevId(""); setReassignOpId("");
      await loadData();
      await refreshAdminData();
    } catch (err) {
      console.error("[admin-devices] action submit error:", err);
      Alert.alert("Update failed", friendlyErrorMessage(err, "Unable to complete this action. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived data ── */
  const filteredDevices = devices.filter((d) => regFilter === "all" ? true : d.status === regFilter);
  const filteredAllocs  = dedupeAllocationsForUI(allocs.filter((a) => alFilter === "all" ? true : a.status === alFilter));
  const availableDevs   = devices.filter((d) => d.status === "available");
  const activeOperators = operators.filter((o) => o.status === "active");

  const kpis = [
    { label: "Registered", value: devices.length,                                       color: colors.primary },
    { label: "Available",  value: devices.filter((d) => d.status === "available").length, color: colors.success },
    { label: "Allocated",  value: devices.filter((d) => d.status === "allocated").length, color: colors.accent },
    { label: "Blocked",    value: devices.filter((d) => d.status === "blocked").length,   color: colors.destructive },
  ];

  const actionTitle = actionModal?.type === "block_device"  ? "Block Device"
    : actionModal?.type === "block_alloc"  ? "Block Allocation"
    : actionModal?.type === "replace"      ? `Replace Device for ${actionModal.extra}`
    : actionModal?.type === "reassign"     ? `Reassign ${actionModal.extra}`
    : actionModal?.extra === "unblock"     ? "Unblock Device"
    : "Deactivate Device";

  return (
    <DrawerOverlay>
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Device Management" showBack />

        {successMsg !== "" && (
          <View style={[st.successBanner, { backgroundColor: colors.success + "22", borderColor: colors.success + "55" }]}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={[st.successText, { color: colors.success }]}>{successMsg}</Text>
          </View>
        )}

        {(loadError || apiError) && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              backgroundColor: colors.destructive + "14",
              borderWidth: 1,
              borderColor: colors.destructive + "44",
            }}
          >
            <Text style={{ color: colors.destructive, fontSize: 13, fontWeight: "600" }}>
              Unable to load or update device data
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              {loadError || apiError}
            </Text>
            <TouchableOpacity
              style={{ marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.destructive }}
              onPress={() => { void loadData(); void refreshAdminData(); }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

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

          {loading && devices.length === 0 && !loadError && !apiError ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : mainTab === "registry" ? (
            <>
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

              <TouchableOpacity
                style={[st.addBtn, { backgroundColor: colors.accent, borderRadius: colors.radius }]}
                onPress={openRegModal}
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
                  <DeviceRegistryCard key={d.id} device={d} onAction={handleDeviceAction} onViewHistory={setHistoryDevice} />
                ))
              )}
            </>
          ) : (
            <>
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
                filteredAllocs.map((a, index) => (
                  <AllocationCard key={`${a.deviceId}-${a.operatorId}-${a.plazaId}-${a.status}-${index}`} alloc={a} devices={devices} onAction={handleAllocAction} />
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>

      {/* ══════════════ Register Device Modal ══════════════ */}
      <Modal visible={showRegModal} animationType="slide" transparent onRequestClose={() => setShowRegModal(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.accent} />
                <Text style={[st.sheetTitle, { color: colors.foreground }]}>Register New Device</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRegModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={st.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Auto-generated identifiers banner */}
              <View style={[st.idBanner, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "33" }]}>
                <View style={st.idBannerRow}>
                  <View style={st.idBannerItem}>
                    <Text style={[st.idBannerLabel, { color: colors.textMuted }]}>Device ID</Text>
                    <Text style={[st.idBannerValue, { color: colors.accent }]}>{previewDevId}</Text>
                  </View>
                  <View style={[st.idBannerDivider, { backgroundColor: colors.accent + "33" }]} />
                  <View style={[st.idBannerItem, { flex: 2 }]}>
                    <Text style={[st.idBannerLabel, { color: colors.textMuted }]}>Registration Timestamp</Text>
                    <Text style={[st.idBannerValue, { color: colors.foreground }]} numberOfLines={1}>
                      {new Date().toLocaleDateString("en-IN")} · {new Date().toLocaleTimeString("en-IN")}
                    </Text>
                  </View>
                </View>
                <View style={[st.idBannerDivider, { backgroundColor: colors.accent + "22", height: 1, width: "100%", marginVertical: 8 }]} />
                <Text style={[st.idBannerLabel, { color: colors.textMuted }]}>Registered By</Text>
                <Text style={[st.idBannerValue, { color: colors.foreground }]}>ADMIN001</Text>
              </View>

              {/* Device Name */}
              <View style={st.field}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Device Name *</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.surface, borderColor: regName.trim() ? colors.border : regName === "" ? colors.border : colors.destructive, color: colors.foreground }]}
                  placeholder="e.g. Field Device 5"
                  placeholderTextColor={colors.mutedForeground}
                  value={regName}
                  onChangeText={setRegName}
                />
              </View>

              {/* Device Model */}
              <View style={st.field}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Device Model *</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Samsung Galaxy A54"
                  placeholderTextColor={colors.mutedForeground}
                  value={regModel}
                  onChangeText={setRegModel}
                />
              </View>

              {/* IMEI Number */}
              {regPlatform !== "web" && (
                <View style={st.field}>
                  <View style={st.fieldLabelRow}>
                    <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>IMEI Number</Text>
                    <Text style={[st.fieldHint, { color: colors.textMuted }]}>15 digits</Text>
                  </View>
                  <View style={[st.imeiInputRow, { backgroundColor: colors.surface, borderColor: regImei.trim() && !/^\d{15}$/.test(regImei.trim()) ? colors.destructive : colors.border }]}>
                    <Ionicons name="hardware-chip-outline" size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
                    <TextInput
                      style={[st.imeiInput, { color: colors.foreground }]}
                      placeholder="e.g. 356938035643809"
                      placeholderTextColor={colors.mutedForeground}
                      value={regImei}
                      onChangeText={(t) => setRegImei(t.replace(/\D/g, "").slice(0, 15))}
                      keyboardType="number-pad"
                      maxLength={15}
                    />
                    {regImei.trim().length === 15 && (
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    )}
                  </View>
                  {regImei.trim().length > 0 && regImei.trim().length < 15 && (
                    <Text style={[st.imeiHint, { color: colors.textMuted }]}>{regImei.trim().length}/15 digits</Text>
                  )}
                </View>
              )}

              {/* Platform */}
              <View style={st.field}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Platform</Text>
                <View style={st.platformRow}>
                  {(["android", "ios", "web"] as DevicePlatform[]).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[st.platformPill, { backgroundColor: regPlatform === p ? colors.primary : colors.surface, borderColor: regPlatform === p ? colors.primary : colors.border }]}
                      onPress={() => {
                        setRegPlatform(p);
                        setRegOsVersion(getDefaultOsVersion(p));
                        /* Only update token if checkbox is active — never auto-generate */
                        if (useCurrentDev && regToken) {
                          setRegToken(generateDeviceToken(p));
                        }
                      }}
                    >
                      <Ionicons name={p === "ios" ? "logo-apple" : p === "android" ? "logo-android" : "globe-outline"} size={14} color={regPlatform === p ? "#fff" : colors.textSecondary} />
                      <Text style={[st.platformText, { color: regPlatform === p ? "#fff" : colors.textSecondary }]}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* OS Version */}
              <View style={st.field}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>OS Version</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Android 13, iOS 17.2"
                  placeholderTextColor={colors.mutedForeground}
                  value={regOsVersion}
                  onChangeText={setRegOsVersion}
                />
              </View>

              {/* Device Token */}
              <View style={st.field}>
                <View style={st.fieldLabelRow}>
                  <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Device Token</Text>
                  <TouchableOpacity
                    onPress={refreshTokens}
                    disabled={!useCurrentDev}
                    style={{ opacity: useCurrentDev ? 1 : 0.3 }}
                  >
                    <Ionicons name="refresh-outline" size={15} color={useCurrentDev ? colors.accent : colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Checkbox — explicit opt-in required */}
                <TouchableOpacity
                  style={[st.toggleRow, {
                    backgroundColor: useCurrentDev ? colors.primary + "12" : colors.surface,
                    borderColor: useCurrentDev ? colors.primary + "55" : colors.border,
                  }]}
                  onPress={async () => {
                    const next = !useCurrentDev;
                    setUseCurrentDev(next);
                    if (next) {
                      /* ── Generate tokens only when user explicitly opts in ── */
                      const tok = await getOrCreateDeviceToken();
                      setRegToken(tok);
                      setRegAppToken(generateAppToken());
                      setTokenGenMsg("Device Token and App Security Token generated.");
                      setTimeout(() => setTokenGenMsg(""), 4000);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      /* ── Clear tokens when user unchecks ── */
                      setRegToken("");
                      setRegAppToken("");
                      setTokenGenMsg("");
                    }
                  }}
                >
                  <Ionicons
                    name={useCurrentDev ? "checkbox" : "square-outline"}
                    size={20}
                    color={useCurrentDev ? colors.primary : colors.textMuted}
                  />
                  <Text style={[st.toggleText, { color: useCurrentDev ? colors.primary : colors.foreground, fontWeight: useCurrentDev ? "600" : "400" }]}>
                    Use this device's token (recommended)
                  </Text>
                </TouchableOpacity>

                {/* Token generation confirmation */}
                {tokenGenMsg !== "" && (
                  <View style={[st.tokenGenBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "44" }]}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                    <Text style={[st.tokenGenText, { color: colors.success }]}>{tokenGenMsg}</Text>
                  </View>
                )}

                {/* Device Token field */}
                <View style={[st.tokenBox, {
                  backgroundColor: useCurrentDev ? colors.surface : colors.muted,
                  borderColor: useCurrentDev ? colors.border : colors.border,
                  opacity: useCurrentDev ? 1 : 0.45,
                }]}>
                  <Ionicons name="key-outline" size={14} color={useCurrentDev ? colors.textMuted : colors.textMuted} />
                  {useCurrentDev && regToken ? (
                    <Text style={[st.tokenText, { color: colors.foreground }]} numberOfLines={1} selectable>{regToken}</Text>
                  ) : (
                    <Text style={[st.tokenText, { color: colors.textMuted }]} numberOfLines={1}>
                      {useCurrentDev ? "Generating…" : "Check the box above to generate"}
                    </Text>
                  )}
                </View>
              </View>

              {/* App Security Token */}
              <View style={st.field}>
                <Text style={[st.fieldLabel, { color: useCurrentDev ? colors.textSecondary : colors.textMuted }]}>
                  App Security Token
                </Text>
                <View style={[st.tokenBox, {
                  backgroundColor: useCurrentDev ? colors.surface : colors.muted,
                  borderColor: colors.border,
                  opacity: useCurrentDev ? 1 : 0.45,
                }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={useCurrentDev ? colors.textMuted : colors.textMuted} />
                  {useCurrentDev && regAppToken ? (
                    <Text style={[st.tokenText, { color: colors.foreground }]} numberOfLines={1} selectable>{regAppToken}</Text>
                  ) : (
                    <Text style={[st.tokenText, { color: colors.textMuted }]} numberOfLines={1}>
                      {useCurrentDev ? "Generating…" : "Generated with device token"}
                    </Text>
                  )}
                </View>
              </View>

              {/* Assign Plaza (optional) */}
              <View style={st.field}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Assign Toll Plaza (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  <TouchableOpacity
                    style={[st.plazaChip, { backgroundColor: regPlazaId === "" ? colors.primary + "18" : colors.surface, borderColor: regPlazaId === "" ? colors.primary : colors.border }]}
                    onPress={() => setRegPlazaId("")}
                  >
                    <Text style={[st.plazaChipText, { color: regPlazaId === "" ? colors.primary : colors.textSecondary }]}>None</Text>
                  </TouchableOpacity>
                  {plazas.map((plaza) => (
                    <TouchableOpacity
                      key={plaza.id}
                      style={[st.plazaChip, { backgroundColor: regPlazaId === plaza.id ? colors.primary + "18" : colors.surface, borderColor: regPlazaId === plaza.id ? colors.primary : colors.border }]}
                      onPress={() => setRegPlazaId(plaza.id)}
                    >
                      <Text style={[st.plazaChipText, { color: regPlazaId === plaza.id ? colors.primary : colors.textSecondary }]} numberOfLines={1}>{plaza.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Security notice */}
              <View style={[st.securityNote, { backgroundColor: colors.warning + "10", borderColor: colors.warning + "33", borderRadius: colors.radius }]}>
                <Ionicons name="shield-outline" size={14} color={colors.warning} />
                <Text style={[st.securityNoteText, { color: colors.warning }]}>
                  The Device Token uniquely identifies this physical device. Even if another device has the same model, it will have a different token and will be denied attendance access.
                </Text>
              </View>

            </ScrollView>

            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowRegModal(false)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: regName.trim() && regModel.trim() && regToken && regAppToken ? colors.accent : colors.muted }]}
                onPress={handleRegisterDevice}
                disabled={saving || !regName.trim() || !regModel.trim() || !regToken || !regAppToken}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                      <Text style={st.confirmText}>Register Device</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════ Allocate Device Modal ══════════════ */}
      <Modal visible={showAllocModal} animationType="slide" transparent onRequestClose={() => setShowAllocModal(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="link-outline" size={18} color={colors.accent} />
                <Text style={[st.sheetTitle, { color: colors.foreground }]}>Allocate Device</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAllocModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.sheetBody} showsVerticalScrollIndicator={false}>
              <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Select Available Device</Text>
              {availableDevs.length === 0 ? (
                <View style={[st.noItems, { backgroundColor: colors.surface, borderRadius: colors.radius }]}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                  <Text style={[st.noItemsText, { color: colors.textMuted }]}>No available devices. Register a device first.</Text>
                </View>
              ) : (
                availableDevs.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[st.selectRow, { backgroundColor: allocDeviceId === d.id ? colors.primary + "18" : colors.surface, borderColor: allocDeviceId === d.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                    onPress={() => setAllocDeviceId(d.id)}
                  >
                    <View style={[st.selectIcon, { backgroundColor: (allocDeviceId === d.id ? colors.primary : colors.textMuted) + "20" }]}>
                      <Ionicons name={d.platform === "ios" ? "logo-apple" : d.platform === "android" ? "logo-android" : "globe-outline"} size={16} color={allocDeviceId === d.id ? colors.primary : colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[st.selectId, { color: colors.accent }]}>{d.id}</Text>
                        <Text style={[st.selectMain, { color: colors.foreground }]}>{d.deviceName}</Text>
                      </View>
                      <Text style={[st.selectSub, { color: colors.textMuted }]}>{d.deviceModel} · {d.osVersion}</Text>
                      <Text style={[st.selectToken, { color: colors.textMuted }]} numberOfLines={1}>Token: {d.deviceToken}</Text>
                    </View>
                    {allocDeviceId === d.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}

              <Text style={[st.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>Select Operator</Text>
              {activeOperators.map((op) => {
                const plaza = plazas.find((p) => p.id === op.plazaId);
                return (
                  <TouchableOpacity
                    key={op.id}
                    style={[st.selectRow, { backgroundColor: allocOpId === op.id ? colors.primary + "18" : colors.surface, borderColor: allocOpId === op.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                    onPress={() => setAllocOpId(op.id)}
                  >
                    <Ionicons name="person-circle-outline" size={20} color={allocOpId === op.id ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.selectMain, { color: colors.foreground }]}>{op.name}</Text>
                      <Text style={[st.selectSub, { color: colors.textMuted }]}>{op.id} · {plaza?.name ?? op.plazaName}</Text>
                    </View>
                    {allocOpId === op.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}

              {allocOpId && allocDeviceId && (() => {
                const dev = devices.find((d) => d.id === allocDeviceId);
                const op  = operators.find((o) => o.id === allocOpId);
                return (
                  <View style={[st.allocSummary, { backgroundColor: colors.success + "12", borderColor: colors.success + "44", borderRadius: colors.radius }]}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
                    <Text style={[st.allocSummaryText, { color: colors.success }]}>
                      {dev?.id} ({dev?.deviceName}) → {op?.name}
                      {"\n"}Verified by: {dev?.deviceToken.slice(0, 22)}…
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowAllocModal(false)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: allocDeviceId && allocOpId ? colors.accent : colors.muted }]}
                onPress={handleAllocate}
                disabled={saving || !allocDeviceId || !allocOpId}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.confirmText}>Allocate</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════ Action Modal ══════════════ */}
      <Modal visible={!!actionModal} animationType="fade" transparent onRequestClose={() => setActionModal(null)}>
        <View style={st.overlay}>
          <View style={[st.confirmSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>{actionTitle}</Text>
              <TouchableOpacity onPress={() => setActionModal(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              {(actionModal?.type === "block_device" || actionModal?.type === "block_alloc") && (
                <>
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
                </>
              )}
              {actionModal?.type === "deactivate" && (
                <View style={[st.warnBanner, { backgroundColor: actionModal.extra === "unblock" ? colors.success + "12" : colors.warning + "12", borderColor: actionModal.extra === "unblock" ? colors.success + "33" : colors.warning + "33", borderRadius: colors.radius }]}>
                  <Ionicons name={actionModal.extra === "unblock" ? "checkmark-circle-outline" : "warning-outline"} size={14} color={actionModal.extra === "unblock" ? colors.success : colors.warning} />
                  <Text style={[st.warnText, { color: actionModal.extra === "unblock" ? colors.success : colors.warning }]}>
                    {actionModal.extra === "unblock"
                      ? "Device will be unblocked and set back to Available."
                      : "Device will be marked Inactive and removed from circulation."}
                  </Text>
                </View>
              )}
              {actionModal?.type === "replace" && (
                <>
                  <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Select Replacement Device</Text>
                  {availableDevs.length === 0 ? (
                    <Text style={[{ color: colors.textMuted, textAlign: "center" }]}>No available devices.</Text>
                  ) : availableDevs.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[st.selectRow, { backgroundColor: replaceDevId === d.id ? colors.warning + "18" : colors.surface, borderColor: replaceDevId === d.id ? colors.warning : colors.border, borderRadius: colors.radius }]}
                      onPress={() => setReplaceDevId(d.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <Text style={[st.selectId, { color: colors.accent }]}>{d.id}</Text>
                          <Text style={[st.selectMain, { color: colors.foreground }]}>{d.deviceName}</Text>
                        </View>
                        <Text style={[st.selectSub, { color: colors.textMuted }]}>{d.deviceModel}</Text>
                      </View>
                      {replaceDevId === d.id && <Ionicons name="checkmark-circle" size={18} color={colors.warning} />}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {actionModal?.type === "reassign" && (
                <>
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
                </>
              )}
            </View>
            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setActionModal(null)}>
                <Text style={[st.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { backgroundColor: actionModal?.type?.startsWith("block") ? colors.destructive : actionModal?.extra === "unblock" ? colors.success : colors.accent }]}
                onPress={handleActionSubmit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.confirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════ Allocation History Modal ══════════════ */}
      <Modal visible={!!historyDevice} animationType="slide" transparent onRequestClose={() => setHistoryDevice(null)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: colors.card }]}>
            <View style={[st.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="time-outline" size={18} color={colors.accent} />
                <Text style={[st.sheetTitle, { color: colors.foreground }]}>Allocation History</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryDevice(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={st.sheetBody} showsVerticalScrollIndicator={false}>
              {historyDevice && (
                <View style={[st.histDeviceBadge, { backgroundColor: colors.primary + "10", borderRadius: colors.radius }]}>
                  <Text style={[st.histDeviceId, { color: colors.accent }]}>{historyDevice.id}</Text>
                  <Text style={[st.histDeviceName, { color: colors.foreground }]}>{historyDevice.deviceName}</Text>
                  <Text style={[st.histDeviceModel, { color: colors.textMuted }]}>{historyDevice.deviceModel} · {historyDevice.osVersion}</Text>
                </View>
              )}
              {(historyDevice?.allocationHistory ?? []).length === 0 ? (
                <View style={st.empty}>
                  <Ionicons name="time-outline" size={32} color={colors.textMuted} />
                  <Text style={[st.emptyText, { color: colors.textMuted }]}>No allocation history</Text>
                </View>
              ) : (
                [...(historyDevice?.allocationHistory ?? [])].reverse().map((entry: AllocationHistoryEntry, i) => (
                  <View key={`${entry.allocationId}-${i}`} style={[st.histEntry, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={st.histEntryHeader}>
                      <View style={[st.histBullet, { backgroundColor: entry.endedAt ? colors.textMuted + "40" : colors.success + "40" }]}>
                        <View style={[st.histBulletInner, { backgroundColor: entry.endedAt ? colors.textMuted : colors.success }]} />
                      </View>
                      <Text style={[st.histSeq, { color: colors.textMuted }]}>#{(historyDevice?.allocationHistory.length ?? 0) - i}</Text>
                      <View style={[st.histStatusPill, { backgroundColor: entry.endedAt ? colors.textMuted + "18" : colors.success + "18" }]}>
                        <Text style={[st.histStatusText, { color: entry.endedAt ? colors.textMuted : colors.success }]}>
                          {entry.endedAt ? "Ended" : "Active"}
                        </Text>
                      </View>
                    </View>
                    {[
                      { label: "Operator",      value: `${entry.operatorName} (${entry.operatorId})` },
                      { label: "Plaza",         value: entry.plazaName },
                      { label: "Allocated At",  value: entry.allocatedAt },
                      { label: "Allocated By",  value: entry.allocatedBy },
                      ...(entry.endedAt    ? [{ label: "Ended At",   value: new Date(entry.endedAt).toLocaleString("en-IN") }] : []),
                      ...(entry.endReason  ? [{ label: "End Reason", value: entry.endReason }] : []),
                    ].map(({ label, value }) => (
                      <View key={label} style={[st.histRow, { borderTopColor: colors.border }]}>
                        <Text style={[st.histLabel, { color: colors.textMuted }]}>{label}</Text>
                        <Text style={[st.histValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
            <View style={[st.sheetFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.confirmBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={() => setHistoryDevice(null)}>
                <Text style={st.confirmText}>Close</Text>
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
  successBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  successText: { fontSize: 13, fontWeight: "600", flex: 1 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  kpiCard: { flex: 1, borderWidth: 1, padding: 10, alignItems: "center", gap: 2 },
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
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%", overflow: "hidden" },
  confirmSheet: { margin: 16, borderRadius: 16, borderWidth: 1, maxHeight: "85%", overflow: "hidden" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  sheetBody: { paddingHorizontal: 20, paddingVertical: 16, flexGrow: 0 },
  sheetFooter: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  idBanner: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16, gap: 2 },
  idBannerRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  idBannerItem: { flex: 1, gap: 2 },
  idBannerDivider: { width: 1, height: 32, marginHorizontal: 12 },
  idBannerLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
  idBannerValue: { fontSize: 14, fontWeight: "700" },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  fieldHint: { fontSize: 11, fontWeight: "400" },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 14 },
  imeiInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 48 },
  imeiInput: { flex: 1, fontSize: 14, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  imeiHint: { fontSize: 11, marginTop: 4, textAlign: "right" },
  platformRow: { flexDirection: "row", gap: 8 },
  platformPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  platformText: { fontSize: 13, fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  toggleText: { flex: 1, fontSize: 13 },
  tokenGenBanner: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  tokenGenText: { fontSize: 12, fontWeight: "600", flex: 1 },
  tokenBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  tokenText: { flex: 1, fontSize: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  plazaChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  plazaChipText: { fontSize: 12, fontWeight: "600" },
  securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1, marginBottom: 8 },
  securityNoteText: { flex: 1, fontSize: 11, lineHeight: 17 },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  noItems: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  noItemsText: { flex: 1, fontSize: 13 },
  selectRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, marginBottom: 8 },
  selectIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  selectId: { fontSize: 11, fontWeight: "800" },
  selectMain: { fontSize: 14, fontWeight: "600" },
  selectSub: { fontSize: 12 },
  selectToken: { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  allocSummary: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1, marginTop: 8 },
  allocSummaryText: { flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  warnBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderWidth: 1 },
  warnText: { flex: 1, fontSize: 12, lineHeight: 18 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14, fontWeight: "600" },
  confirmBtn: { flex: 1, height: 46, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  histDeviceBadge: { padding: 14, marginBottom: 14, gap: 2 },
  histDeviceId: { fontSize: 12, fontWeight: "800" },
  histDeviceName: { fontSize: 15, fontWeight: "700" },
  histDeviceModel: { fontSize: 12 },
  histEntry: { borderWidth: 1, marginBottom: 10, padding: 12, gap: 0 },
  histEntryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  histBullet: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  histBulletInner: { width: 8, height: 8, borderRadius: 4 },
  histSeq: { fontSize: 11, fontWeight: "700" },
  histStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  histStatusText: { fontSize: 10, fontWeight: "700" },
  histRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: 1, gap: 10 },
  histLabel: { fontSize: 11, flex: 1 },
  histValue: { fontSize: 12, fontWeight: "600", flex: 2, textAlign: "right" },
});

const rc = StyleSheet.create({
  card: { borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  platformIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  info: { flex: 1, gap: 3 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  devId: { fontSize: 11, fontWeight: "800" },
  name: { fontSize: 14, fontWeight: "700", flex: 1 },
  model: { fontSize: 12 },
  imei: { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  token: { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  statusCol: { alignItems: "flex-end", gap: 6 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "600" },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  infoGrid: { flexDirection: "row", borderTopWidth: 1, paddingVertical: 10 },
  infoCell: { flex: 1, alignItems: "center", gap: 1 },
  infoCellDivider: { width: 1 },
  infoLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 0.2 },
  infoValue: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  infoSub: { fontSize: 9, textAlign: "center" },
  assignRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, flexWrap: "nowrap" },
  assignText: { fontSize: 12, fontWeight: "600" },
  assignSep: { fontSize: 12 },
  assignSub: { fontSize: 12, flex: 1 },
  histBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, borderWidth: 1, marginLeft: "auto" },
  histBtnText: { fontSize: 10, fontWeight: "700" },
  expandRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  expandLabel: { flex: 1, fontSize: 11 },
  tokenExpanded: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  tokenFull: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  deleteIconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  btn: { width: "48%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8 },
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
  deviceBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  deviceBadgeText: { fontSize: 11 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8 },
  btnText: { fontSize: 12, fontWeight: "600" },
  blockBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1 },
  blockText: { flex: 1, fontSize: 12 },
});
