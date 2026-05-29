import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { MOCK_TOLL_PLAZAS, TollPlaza } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";

type FilterType = "all" | "active" | "inactive" | "maintenance";

const STATUS_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  active: { label: "Active", color: "#10B981", icon: "checkmark-circle-outline" },
  inactive: { label: "Inactive", color: "#64748B", icon: "pause-circle-outline" },
  maintenance: { label: "Maintenance", color: "#F59E0B", icon: "construct-outline" },
};

function PlazaCard({ plaza, onAction }: { plaza: TollPlaza; onAction: (action: string, plaza: TollPlaza) => void }) {
  const colors = useColors();
  const meta = STATUS_META[plaza.status];
  return (
    <View style={[styles.plazaCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.plazaIconWrap, { backgroundColor: colors.primary + "22" }]}>
          <MaterialCommunityIcons name="road-variant" size={22} color={colors.accent} />
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={[styles.plazaName, { color: colors.foreground }]}>{plaza.name}</Text>
          <Text style={[styles.plazaRoute, { color: colors.textMuted }]}>{plaza.route} • {plaza.location}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: meta.color + "22" }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: colors.foreground }]}>{plaza.workerCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Workers</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: plaza.attendancePct >= 90 ? colors.success : plaza.attendancePct >= 75 ? colors.warning : colors.destructive }]}>
            {plaza.workerCount > 0 ? `${plaza.attendancePct}%` : "—"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Today</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: colors.foreground }]}>{plaza.activeDevices}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Devices</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: colors.textSecondary }]} numberOfLines={1}>{plaza.lastSync}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Last Sync</Text>
        </View>
      </View>

      {/* Operator Row */}
      <View style={[styles.operatorRow, { borderTopColor: colors.border }]}>
        <View style={[styles.operatorAvatar, { backgroundColor: plaza.operatorId ? colors.primary + "22" : colors.muted }]}>
          <Ionicons name="person" size={14} color={plaza.operatorId ? colors.accent : colors.textMuted} />
        </View>
        <Text style={[styles.operatorName, { color: plaza.operatorId ? colors.textSecondary : colors.textMuted }]}>
          {plaza.operatorName}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("edit", plaza)}>
          <Ionicons name="create-outline" size={15} color={colors.accent} />
          <Text style={[styles.actionBtnText, { color: colors.accent }]}>Edit</Text>
        </TouchableOpacity>
        {plaza.status === "active" ? (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.warning + "18" }]} onPress={() => onAction("deactivate", plaza)}>
            <Ionicons name="pause-outline" size={15} color={colors.warning} />
            <Text style={[styles.actionBtnText, { color: colors.warning }]}>Deactivate</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success + "18" }]} onPress={() => onAction("activate", plaza)}>
            <Ionicons name="play-outline" size={15} color={colors.success} />
            <Text style={[styles.actionBtnText, { color: colors.success }]}>Activate</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#3B82F622" }]} onPress={() => onAction("monitor", plaza)}>
          <Ionicons name="stats-chart-outline" size={15} color="#3B82F6" />
          <Text style={[styles.actionBtnText, { color: "#3B82F6" }]}>Monitor</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminTollPlazasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [newLocation, setNewLocation] = useState("");

  const filtered = MOCK_TOLL_PLAZAS.filter((p) => {
    const matchFilter = filter === "all" || p.status === filter;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.route.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: MOCK_TOLL_PLAZAS.length,
    active: MOCK_TOLL_PLAZAS.filter((p) => p.status === "active").length,
    inactive: MOCK_TOLL_PLAZAS.filter((p) => p.status === "inactive").length,
    maintenance: MOCK_TOLL_PLAZAS.filter((p) => p.status === "maintenance").length,
  };

  const handleAction = (action: string, plaza: TollPlaza) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "activate") Alert.alert("Activate Plaza", `Activate "${plaza.name}"?`, [{ text: "Cancel" }, { text: "Activate", style: "default" }]);
    else if (action === "deactivate") Alert.alert("Deactivate Plaza", `Deactivate "${plaza.name}"?`, [{ text: "Cancel" }, { text: "Deactivate", style: "destructive" }]);
    else if (action === "edit") Alert.alert("Edit Plaza", `Edit "${plaza.name}" (coming soon)`);
    else if (action === "monitor") Alert.alert("Monitor", `Live monitoring for "${plaza.name}" (coming soon)`);
  };

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Toll Plaza Management" showBack onBack={() => router.back()} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>

          {/* Summary Cards */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryScroll}>
            {([["all", "Total", colors.accent, "business-outline"], ["active", "Active", colors.success, "checkmark-circle-outline"], ["inactive", "Inactive", colors.textMuted, "pause-circle-outline"], ["maintenance", "Maintenance", colors.warning, "construct-outline"]] as const).map(([key, label, color, icon]) => (
              <TouchableOpacity
                key={key}
                style={[styles.summaryCard, { backgroundColor: filter === key ? color + "22" : colors.card, borderColor: filter === key ? color + "55" : colors.border, borderRadius: colors.radius }]}
                onPress={() => { setFilter(key as FilterType); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <Ionicons name={icon} size={20} color={color} />
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{counts[key]}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Search Bar */}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search by name, route, location..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Results */}
          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsCount, { color: colors.textMuted }]}>{filtered.length} plaza{filtered.length !== 1 ? "s" : ""} found</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]} onPress={() => setShowAddModal(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Register Plaza</Text>
            </TouchableOpacity>
          </View>

          {filtered.map((plaza) => (
            <PlazaCard key={plaza.id} plaza={plaza} onAction={handleAction} />
          ))}

          {filtered.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Ionicons name="business-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No plazas found</Text>
            </View>
          )}
        </ScrollView>

        {/* Add Plaza Modal */}
        <Modal visible={showAddModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Register New Toll Plaza</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {[
                { label: "Plaza Name", placeholder: "e.g. NH-48 Gurugram Plaza", value: newName, setter: setNewName },
                { label: "Highway Route", placeholder: "e.g. NH-48", value: newRoute, setter: setNewRoute },
                { label: "Location", placeholder: "e.g. Gurugram, Haryana", value: newLocation, setter: setNewLocation },
              ].map(({ label, placeholder, value, setter }) => (
                <View key={label} style={styles.modalField}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                  <TextInput
                    style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textMuted}
                    value={value}
                    onChangeText={setter}
                  />
                </View>
              ))}
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={() => {
                  if (!newName.trim()) { Alert.alert("Error", "Plaza name is required"); return; }
                  Alert.alert("Success", `Plaza "${newName}" registered successfully`);
                  setNewName(""); setNewRoute(""); setNewLocation(""); setShowAddModal(false);
                }}
              >
                <Ionicons name="business-outline" size={18} color="#fff" />
                <Text style={styles.modalSubmitText}>Register Plaza</Text>
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
  summaryCard: { alignItems: "center", padding: 14, borderWidth: 1, gap: 4, minWidth: 90 },
  summaryVal: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { fontSize: 11 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultsCount: { fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  plazaCard: { borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  plazaIconWrap: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cardHeaderInfo: { flex: 1, gap: 3 },
  plazaName: { fontSize: 14, fontWeight: "700" },
  plazaRoute: { fontSize: 12 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  statsRow: { flexDirection: "row", borderTopWidth: 1, paddingVertical: 10 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 10 },
  statDivider: { width: 1 },
  operatorRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  operatorAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  operatorName: { fontSize: 13 },
  actionsRow: { flexDirection: "row", borderTopWidth: 1, padding: 10, gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  emptyState: { alignItems: "center", justifyContent: "center", padding: 40, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, gap: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalField: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "500" },
  fieldInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  modalSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  modalSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
