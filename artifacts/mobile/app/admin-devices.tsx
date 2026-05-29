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
import { MOCK_DEVICES, MOCK_OPERATORS, DeviceAllocation } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";

type DeviceFilter = "all" | "active" | "blocked" | "pending";

const STATUS_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  active: { label: "Active", color: "#10B981", icon: "checkmark-circle-outline" },
  blocked: { label: "Blocked", color: "#EF4444", icon: "ban-outline" },
  pending: { label: "Pending", color: "#F59E0B", icon: "time-outline" },
  replaced: { label: "Replaced", color: "#64748B", icon: "refresh-outline" },
};

function DeviceCard({ device, onAction }: { device: DeviceAllocation; onAction: (action: string, device: DeviceAllocation) => void }) {
  const colors = useColors();
  const meta = STATUS_META[device.status];
  return (
    <View style={[styles.deviceCard, { backgroundColor: colors.card, borderColor: device.status === "blocked" ? colors.destructive + "44" : colors.border, borderRadius: colors.radius }]}>
      <View style={styles.cardRow}>
        <View style={[styles.deviceIconWrap, { backgroundColor: device.deviceType === "ios" ? "#3B82F622" : colors.primary + "22" }]}>
          <Ionicons
            name={device.deviceType === "ios" ? "logo-apple" : "logo-android"}
            size={24}
            color={device.deviceType === "ios" ? "#3B82F6" : colors.accent}
          />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, { color: colors.foreground }]}>{device.deviceModel}</Text>
          <Text style={[styles.deviceImei, { color: colors.textMuted }]}>IMEI: {device.imei.slice(0, 8)}••••{device.imei.slice(-4)}</Text>
          <View style={styles.operatorRow}>
            <Ionicons name="person-circle-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.operatorName, { color: device.operatorId ? colors.textSecondary : colors.textMuted }]}>
              {device.operatorName}
            </Text>
            {device.plazaName !== "—" && (
              <Text style={[styles.plazaTag, { color: colors.textMuted }]}>• {device.plazaName}</Text>
            )}
          </View>
        </View>
        <View style={styles.statusCol}>
          <View style={[styles.statusPill, { backgroundColor: meta.color + "22" }]}>
            <Ionicons name={meta.icon} size={11} color={meta.color} />
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[styles.lastActive, { color: colors.textMuted }]}>{device.lastActive}</Text>
        </View>
      </View>

      {/* Unauthorized Attempts Warning */}
      {device.unauthorizedAttempts > 0 && (
        <View style={[styles.warningBanner, { backgroundColor: colors.destructive + "18", borderTopColor: colors.destructive + "33" }]}>
          <Ionicons name="warning-outline" size={14} color={colors.destructive} />
          <Text style={[styles.warningText, { color: colors.destructive }]}>
            {device.unauthorizedAttempts} unauthorized attempt{device.unauthorizedAttempts > 1 ? "s" : ""} detected
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("assign", device)}>
          <Ionicons name="person-add-outline" size={14} color={colors.accent} />
          <Text style={[styles.actionBtnText, { color: colors.accent }]}>Assign</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#3B82F622" }]} onPress={() => onAction("replace", device)}>
          <Ionicons name="swap-horizontal-outline" size={14} color="#3B82F6" />
          <Text style={[styles.actionBtnText, { color: "#3B82F6" }]}>Replace</Text>
        </TouchableOpacity>
        {device.status !== "blocked" ? (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.destructive + "18" }]} onPress={() => onAction("block", device)}>
            <Ionicons name="ban-outline" size={14} color={colors.destructive} />
            <Text style={[styles.actionBtnText, { color: colors.destructive }]}>Block</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success + "18" }]} onPress={() => onAction("unblock", device)}>
            <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
            <Text style={[styles.actionBtnText, { color: colors.success }]}>Unblock</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function AdminDevicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [search, setSearch] = useState("");
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState("");

  const filtered = MOCK_DEVICES.filter((d) => {
    const matchFilter = filter === "all" || d.status === filter;
    const matchSearch = d.deviceModel.toLowerCase().includes(search.toLowerCase()) ||
      d.operatorName.toLowerCase().includes(search.toLowerCase()) ||
      d.plazaName.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: MOCK_DEVICES.length,
    active: MOCK_DEVICES.filter((d) => d.status === "active").length,
    blocked: MOCK_DEVICES.filter((d) => d.status === "blocked").length,
    pending: MOCK_DEVICES.filter((d) => d.status === "pending").length,
  };

  const totalUnauth = MOCK_DEVICES.reduce((s, d) => s + d.unauthorizedAttempts, 0);

  const handleAction = (action: string, device: DeviceAllocation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "block") Alert.alert("Block Device", `Block "${device.deviceModel}"?\nAll access will be revoked immediately.`, [{ text: "Cancel" }, { text: "Block", style: "destructive" }]);
    else if (action === "unblock") Alert.alert("Unblock Device", `Unblock "${device.deviceModel}"?`, [{ text: "Cancel" }, { text: "Unblock", style: "default" }]);
    else if (action === "assign") setShowAllocateModal(true);
    else if (action === "replace") Alert.alert("Replace Device", `Replace "${device.deviceModel}" (coming soon)`);
  };

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Device Allocation" showBack onBack={() => router.back()} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>

          {/* Alert Banner */}
          {totalUnauth > 0 && (
            <View style={[styles.alertBanner, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44", borderRadius: colors.radius }]}>
              <Ionicons name="warning" size={18} color={colors.destructive} />
              <Text style={[styles.alertText, { color: colors.destructive }]}>
                {totalUnauth} unauthorized access attempt{totalUnauth > 1 ? "s" : ""} detected across devices
              </Text>
            </View>
          )}

          {/* Summary */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryScroll}>
            {([["all", "Total", colors.accent, "phone-portrait-outline"], ["active", "Active", colors.success, "checkmark-circle-outline"], ["blocked", "Blocked", colors.destructive, "ban-outline"], ["pending", "Pending", colors.warning, "time-outline"]] as const).map(([key, label, color, icon]) => (
              <TouchableOpacity
                key={key}
                style={[styles.summaryCard, { backgroundColor: filter === key ? color + "22" : colors.card, borderColor: filter === key ? color + "55" : colors.border, borderRadius: colors.radius }]}
                onPress={() => { setFilter(key as DeviceFilter); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <Ionicons name={icon} size={20} color={color} />
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{counts[key]}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Search */}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search by model, operator, plaza..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>}
          </View>

          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsCount, { color: colors.textMuted }]}>{filtered.length} device{filtered.length !== 1 ? "s" : ""}</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]} onPress={() => setShowAllocateModal(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Allocate Device</Text>
            </TouchableOpacity>
          </View>

          {filtered.map((device) => (
            <DeviceCard key={device.id} device={device} onAction={handleAction} />
          ))}

          {filtered.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Ionicons name="phone-portrait-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No devices found</Text>
            </View>
          )}
        </ScrollView>

        {/* Allocate Modal */}
        <Modal visible={showAllocateModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Allocate Device</Text>
                <TouchableOpacity onPress={() => setShowAllocateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Select Operator</Text>
              {MOCK_OPERATORS.filter((o) => o.status === "active").map((op) => (
                <TouchableOpacity
                  key={op.id}
                  style={[styles.operatorOption, { backgroundColor: selectedOperator === op.id ? colors.primary + "22" : colors.surface, borderColor: selectedOperator === op.id ? colors.primary : colors.border, borderRadius: colors.radius }]}
                  onPress={() => { setSelectedOperator(op.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={[styles.opAvatar, { backgroundColor: colors.primary + "22" }]}>
                    <Ionicons name="person" size={16} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.opName, { color: colors.foreground }]}>{op.name}</Text>
                    <Text style={[styles.opPlaza, { color: colors.textMuted }]}>{op.plazaName}</Text>
                  </View>
                  {selectedOperator === op.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={() => {
                  if (!selectedOperator) { Alert.alert("Error", "Please select an operator"); return; }
                  const op = MOCK_OPERATORS.find((o) => o.id === selectedOperator);
                  Alert.alert("Success", `Device allocated to ${op?.name}`);
                  setSelectedOperator(""); setShowAllocateModal(false);
                }}
              >
                <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                <Text style={styles.modalSubmitText}>Confirm Allocation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1 },
  alertText: { flex: 1, fontSize: 13, fontWeight: "500" },
  summaryScroll: { gap: 10, paddingBottom: 4 },
  summaryCard: { alignItems: "center", padding: 14, borderWidth: 1, gap: 4, minWidth: 85 },
  summaryVal: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { fontSize: 11 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultsCount: { fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  deviceCard: { borderWidth: 1, overflow: "hidden" },
  cardRow: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  deviceIconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deviceInfo: { flex: 1, gap: 4 },
  deviceName: { fontSize: 14, fontWeight: "700" },
  deviceImei: { fontSize: 11 },
  operatorRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  operatorName: { fontSize: 12 },
  plazaTag: { fontSize: 12 },
  statusCol: { alignItems: "flex-end", gap: 6 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "600" },
  lastActive: { fontSize: 11 },
  warningBanner: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1 },
  warningText: { fontSize: 12, fontWeight: "500" },
  actionsRow: { flexDirection: "row", borderTopWidth: 1, padding: 10, gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  emptyState: { alignItems: "center", padding: 40, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "500" },
  operatorOption: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1 },
  opAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  opName: { fontSize: 14, fontWeight: "600" },
  opPlaza: { fontSize: 12 },
  modalSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  modalSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
