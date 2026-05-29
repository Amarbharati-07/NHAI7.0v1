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
import { MOCK_OPERATORS, MOCK_TOLL_PLAZAS, AdminOperator } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";

type OpFilter = "all" | "active" | "suspended" | "pending";

function OperatorCard({ op, onAction }: { op: AdminOperator; onAction: (action: string, op: AdminOperator) => void }) {
  const colors = useColors();
  const statusColor = op.status === "active" ? colors.success : op.status === "suspended" ? colors.destructive : colors.warning;
  const statusLabel = op.status === "active" ? "Active" : op.status === "suspended" ? "Suspended" : "Pending";

  return (
    <View style={[styles.opCard, { backgroundColor: colors.card, borderColor: op.status === "suspended" ? colors.destructive + "44" : colors.border, borderRadius: colors.radius }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="person" size={20} color="#fff" />
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.opName, { color: colors.foreground }]}>{op.name}</Text>
          <Text style={[styles.opId, { color: colors.textMuted }]}>{op.userId} • {op.mobile}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor + "22" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Info Grid */}
      <View style={[styles.infoGrid, { borderTopColor: colors.border }]}>
        <View style={styles.infoItem}>
          <Ionicons name="business-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]} numberOfLines={1}>{op.plazaName}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Last: {op.lastLogin}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="log-in-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>{op.loginCount} logins total</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="phone-portrait-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>{op.deviceCount} device{op.deviceCount !== 1 ? "s" : ""} assigned</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        {op.status === "active" ? (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.warning + "18" }]} onPress={() => onAction("suspend", op)}>
            <Ionicons name="pause-outline" size={14} color={colors.warning} />
            <Text style={[styles.actionBtnText, { color: colors.warning }]}>Suspend</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success + "18" }]} onPress={() => onAction("activate", op)}>
            <Ionicons name="play-outline" size={14} color={colors.success} />
            <Text style={[styles.actionBtnText, { color: colors.success }]}>Activate</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("resetPwd", op)}>
          <Ionicons name="key-outline" size={14} color={colors.accent} />
          <Text style={[styles.actionBtnText, { color: colors.accent }]}>Reset Password</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#3B82F622" }]} onPress={() => onAction("assign", op)}>
          <Ionicons name="business-outline" size={14} color="#3B82F6" />
          <Text style={[styles.actionBtnText, { color: "#3B82F6" }]}>Assign Plaza</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminOperatorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<OpFilter>("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedPlaza, setSelectedPlaza] = useState("");

  const filtered = MOCK_OPERATORS.filter((o) => {
    const matchFilter = filter === "all" || o.status === filter;
    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.userId.toLowerCase().includes(search.toLowerCase()) ||
      o.plazaName.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: MOCK_OPERATORS.length,
    active: MOCK_OPERATORS.filter((o) => o.status === "active").length,
    suspended: MOCK_OPERATORS.filter((o) => o.status === "suspended").length,
    pending: MOCK_OPERATORS.filter((o) => o.status === "pending").length,
  };

  const handleAction = (action: string, op: AdminOperator) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "suspend") Alert.alert("Suspend Operator", `Suspend "${op.name}"? They will lose access immediately.`, [{ text: "Cancel" }, { text: "Suspend", style: "destructive" }]);
    else if (action === "activate") Alert.alert("Activate Operator", `Activate "${op.name}"?`, [{ text: "Cancel" }, { text: "Activate", style: "default" }]);
    else if (action === "resetPwd") Alert.alert("Reset Password", `Send password reset to ${op.name}?`, [{ text: "Cancel" }, { text: "Reset", style: "default" }]);
    else if (action === "assign") Alert.alert("Assign Plaza", `Assign plaza to ${op.name} (coming soon)`);
  };

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Operator Management" showBack onBack={() => router.back()} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryScroll}>
            {([["all", "All", colors.accent, "people-outline"], ["active", "Active", colors.success, "checkmark-circle-outline"], ["suspended", "Suspended", colors.destructive, "pause-circle-outline"], ["pending", "Pending", colors.warning, "time-outline"]] as const).map(([key, label, color, icon]) => (
              <TouchableOpacity
                key={key}
                style={[styles.summaryCard, { backgroundColor: filter === key ? color + "22" : colors.card, borderColor: filter === key ? color + "55" : colors.border, borderRadius: colors.radius }]}
                onPress={() => { setFilter(key as OpFilter); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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
              placeholder="Search by name, ID, plaza..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>}
          </View>

          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsCount, { color: colors.textMuted }]}>{filtered.length} operator{filtered.length !== 1 ? "s" : ""}</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]} onPress={() => setShowCreateModal(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Create Operator</Text>
            </TouchableOpacity>
          </View>

          {filtered.map((op) => <OperatorCard key={op.id} op={op} onAction={handleAction} />)}

          {filtered.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No operators found</Text>
            </View>
          )}
        </ScrollView>

        {/* Create Operator Modal */}
        <Modal visible={showCreateModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Create New Operator</Text>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {[
                  { label: "Full Name *", placeholder: "e.g. Rajan Mehta", value: newName, setter: setNewName, secure: false },
                  { label: "Operator ID *", placeholder: "e.g. OPR006", value: newUserId, setter: setNewUserId, secure: false },
                  { label: "Mobile Number", placeholder: "e.g. 9811234567", value: newMobile, setter: setNewMobile, secure: false },
                  { label: "Password *", placeholder: "Temporary password", value: newPassword, setter: setNewPassword, secure: true },
                ].map(({ label, placeholder, value, setter, secure }) => (
                  <View key={label} style={[styles.modalField, { marginBottom: 12 }]}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                      placeholder={placeholder}
                      placeholderTextColor={colors.textMuted}
                      value={value}
                      onChangeText={setter}
                      secureTextEntry={secure}
                    />
                  </View>
                ))}
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Assign Toll Plaza</Text>
                {MOCK_TOLL_PLAZAS.filter((p) => p.status === "active").map((plaza) => (
                  <TouchableOpacity
                    key={plaza.id}
                    style={[styles.plazaOption, { backgroundColor: selectedPlaza === plaza.id ? colors.primary + "22" : colors.surface, borderColor: selectedPlaza === plaza.id ? colors.primary : colors.border, borderRadius: 8 }]}
                    onPress={() => { setSelectedPlaza(plaza.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons name="business-outline" size={16} color={selectedPlaza === plaza.id ? colors.accent : colors.textMuted} />
                    <Text style={[styles.plazaOptionText, { color: selectedPlaza === plaza.id ? colors.foreground : colors.textSecondary }]}>{plaza.name}</Text>
                    {selectedPlaza === plaza.id && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={() => {
                  if (!newName.trim() || !newUserId.trim() || !newPassword.trim()) { Alert.alert("Error", "Name, Operator ID and Password are required"); return; }
                  Alert.alert("Success", `Operator "${newName}" created with ID "${newUserId}"`);
                  setNewName(""); setNewUserId(""); setNewMobile(""); setNewPassword(""); setSelectedPlaza(""); setShowCreateModal(false);
                }}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.modalSubmitText}>Create Operator</Text>
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
  opCard: { borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  nameCol: { flex: 1, gap: 3 },
  opName: { fontSize: 15, fontWeight: "700" },
  opId: { fontSize: 12 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, padding: 12, gap: 10 },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 6, width: "48%" },
  infoText: { fontSize: 12, flex: 1 },
  actionsRow: { flexDirection: "row", borderTopWidth: 1, padding: 10, gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 8 },
  actionBtnText: { fontSize: 11, fontWeight: "600" },
  emptyState: { alignItems: "center", padding: 40, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalField: {},
  fieldLabel: { fontSize: 13, fontWeight: "500", marginBottom: 4 },
  fieldInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  plazaOption: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderWidth: 1, marginBottom: 6 },
  plazaOptionText: { flex: 1, fontSize: 13 },
  modalSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  modalSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
