import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
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
import type { AdminOperator, TollPlaza } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";
import { formatErrorForAlert } from "@/services/userMessages";

type FilterType = "all" | "active" | "inactive" | "maintenance";

const STATUS_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  active:      { label: "Active",      color: "#10B981", icon: "checkmark-circle-outline" },
  inactive:    { label: "Inactive",    color: "#64748B", icon: "pause-circle-outline" },
  maintenance: { label: "Maintenance", color: "#F59E0B", icon: "construct-outline" },
};

type OperatorChoice = AdminOperator & {
  assignedElsewhere: boolean;
  assignmentLabel: string;
};

function formatOperatorLabel(operator: Pick<AdminOperator, "name" | "userId">): string {
  return `${operator.name} (${operator.userId})`;
}

function getOperatorAssignmentLabel(operator: AdminOperator, currentPlazaId?: string): string {
  const normalizedCurrentPlazaId = String(currentPlazaId ?? "").trim();
  if (!operator.plazaId) return "Unassigned";
  if (operator.plazaId === normalizedCurrentPlazaId) return "Assigned to this plaza";
  return `Assigned to ${operator.plazaName}`;
}

function OperatorPicker({
  label,
  placeholder,
  selectedOperatorId,
  currentPlazaId,
  operators,
  onSelect,
}: {
  label: string;
  placeholder: string;
  selectedOperatorId: string;
  currentPlazaId?: string;
  operators: AdminOperator[];
  onSelect: (operator: AdminOperator | null) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const choiceList = React.useMemo<OperatorChoice[]>(() => {
    const normalizedCurrentPlazaId = String(currentPlazaId ?? "").trim();
    const selected = operators.find((operator) => operator.userId === selectedOperatorId);
    const merged = selected && !operators.some((operator) => operator.userId === selected.userId)
      ? [selected, ...operators]
      : operators;

    return merged.map((operator) => {
      const assignedElsewhere = Boolean(operator.plazaId && operator.plazaId !== normalizedCurrentPlazaId);
      return {
        ...operator,
        assignedElsewhere,
        assignmentLabel: assignedElsewhere
          ? `Assigned to ${operator.plazaName}`
          : operator.plazaId
            ? `Assigned to this plaza`
            : "Unassigned",
      };
    });
  }, [currentPlazaId, operators, selectedOperatorId]);

  const selected = React.useMemo(
    () => operators.find((operator) => operator.userId === selectedOperatorId) ?? null,
    [operators, selectedOperatorId],
  );

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return choiceList;
    return choiceList.filter((operator) => {
      const haystack = `${operator.name} ${operator.userId} ${operator.plazaName}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [choiceList, query]);

  const handleChoose = (operator: OperatorChoice) => {
    const commitSelection = () => {
      onSelect(operator);
      setOpen(false);
      setQuery("");
    };

    if (operator.assignedElsewhere) {
      Alert.alert(
        "Already Assigned",
        `${operator.name} is already assigned to ${operator.plazaName}. Reassign this operator to the current plaza?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reassign", onPress: commitSelection },
        ],
      );
      return;
    }

    commitSelection();
  };

  return (
    <View style={styles.modalField}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.dropdownTrigger,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
        onPress={() => setOpen((value) => !value)}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.dropdownTriggerText,
            { color: selected ? colors.foreground : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {selected ? formatOperatorLabel(selected) : placeholder}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {selected?.plazaId && selected.plazaId !== currentPlazaId ? (
        <View style={[styles.assignmentBadge, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "33" }]}>
          <Text style={[styles.assignmentBadgeText, { color: colors.warning }]}>Already Assigned</Text>
        </View>
      ) : null}

      {open ? (
        <View style={[styles.dropdownPanel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.dropdownSearch, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.dropdownSearchInput, { color: colors.foreground }]}
              placeholder="Search operators..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {filtered.length > 0 ? (
              filtered.map((operator) => {
                const selectedItem = operator.userId === selectedOperatorId;
                return (
                  <TouchableOpacity
                    key={operator.userId}
                    style={[
                      styles.dropdownItem,
                      {
                        backgroundColor: selectedItem ? colors.primary + "14" : colors.surface,
                        borderColor: selectedItem ? colors.primary : colors.border,
                        borderRadius: colors.radius,
                      },
                    ]}
                    onPress={() => handleChoose(operator)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.dropdownItemTitleRow}>
                        <Text style={[styles.dropdownItemTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {formatOperatorLabel(operator)}
                        </Text>
                        {operator.assignedElsewhere ? (
                          <View style={[styles.assignmentBadge, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "33" }]}>
                            <Text style={[styles.assignmentBadgeText, { color: colors.warning }]}>Already Assigned</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.dropdownItemSub, { color: colors.textMuted }]} numberOfLines={1}>
                        {operator.assignmentLabel}
                      </Text>
                    </View>
                    {selectedItem ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.dropdownEmpty}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.dropdownEmptyText, { color: colors.textMuted }]}>No operators found</Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function PlazaCard({ plaza, onAction }: { plaza: TollPlaza; onAction: (action: string, plaza: TollPlaza) => void }) {
  const colors = useColors();
  const meta = STATUS_META[plaza.status];
  return (
    <View style={[styles.plazaCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.plazaIconWrap, { backgroundColor: colors.primary + "22" }]}>
          <MaterialCommunityIcons name="road-variant" size={22} color={colors.accent} />
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={[styles.plazaName, { color: colors.foreground }]}>{plaza.name}</Text>
          <Text style={[styles.plazaRoute, { color: colors.textMuted }]}>{plaza.route} • {plaza.location}</Text>
        </View>
        <View style={styles.cardHeaderActions}>
          <View style={[styles.statusPill, { backgroundColor: meta.color + "22" }]}>
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <TouchableOpacity
            style={[styles.deleteIconBtn, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "33" }]}
            onPress={() => onAction("delete", plaza)}
            accessibilityLabel="Delete toll plaza"
          >
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

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

      <View style={[styles.operatorRow, { borderTopColor: colors.border }]}>
        <View style={[styles.operatorAvatar, { backgroundColor: plaza.operatorId ? colors.primary + "22" : colors.muted }]}>
          <Ionicons name="person" size={14} color={plaza.operatorId ? colors.accent : colors.textMuted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.operatorName, { color: plaza.operatorId ? colors.textSecondary : colors.textMuted }]}>
            {plaza.operatorId ? plaza.operatorName : "Select Operator"}
          </Text>
          {plaza.operatorId ? (
            <Text style={[styles.operatorMeta, { color: colors.textMuted }]}>
              {plaza.operatorId}
            </Text>
          ) : null}
        </View>
      </View>

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
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.destructive + "18" }]} onPress={() => onAction("delete", plaza)}>
          <Ionicons name="trash-outline" size={15} color={colors.destructive} />
          <Text style={[styles.actionBtnText, { color: colors.destructive }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminTollPlazasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { plazas, operators, addPlaza, updatePlaza, deletePlaza, loading, refresh, apiOnline, apiError } =
    useAdminData();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const [filter, setFilter]   = useState<FilterType>("all");
  const [search, setSearch]   = useState("");
  const [saving, setSaving]   = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName]           = useState("");
  const [newRoute, setNewRoute]         = useState("");
  const [newLocation, setNewLocation]   = useState("");
  const [newLatitude, setNewLatitude]   = useState("");
  const [newLongitude, setNewLongitude] = useState("");
  const [newRadius, setNewRadius]       = useState("300");
  const [newOperatorId, setNewOperatorId] = useState("");
  const [newOperatorReassign, setNewOperatorReassign] = useState(false);

  const [showEditModal, setShowEditModal]           = useState(false);
  const [editPlaza, setEditPlaza]                   = useState<TollPlaza | null>(null);
  const [editName, setEditName]                     = useState("");
  const [editRoute, setEditRoute]                   = useState("");
  const [editLocation, setEditLocation]             = useState("");
  const [editLatitude, setEditLatitude]             = useState("");
  const [editLongitude, setEditLongitude]           = useState("");
  const [editRadius, setEditRadius]                 = useState("");
  const [editOperatorId, setEditOperatorId]         = useState("");
  const [editOperatorReassign, setEditOperatorReassign] = useState(false);

  const [showMonitorModal, setShowMonitorModal] = useState(false);
  const [monitorPlaza, setMonitorPlaza]         = useState<TollPlaza | null>(null);

  React.useEffect(() => {
    if (!showEditModal || !editPlaza) return;
    const nextLatitude = editPlaza.latitude != null ? String(editPlaza.latitude) : "";
    const nextLongitude = editPlaza.longitude != null ? String(editPlaza.longitude) : "";
    const nextRadius = editPlaza.radiusMeters != null ? String(editPlaza.radiusMeters) : "300";
    console.log("Modal Open Values", {
      plazaId: editPlaza.id,
      latitude: nextLatitude,
      longitude: nextLongitude,
      radiusMeters: nextRadius,
    });
    setEditName(editPlaza.name);
    setEditRoute(editPlaza.route);
    setEditLocation(editPlaza.location);
    setEditLatitude(nextLatitude);
    setEditLongitude(nextLongitude);
    setEditRadius(nextRadius);
    setEditOperatorId(editPlaza.operatorId ?? "");
    setEditOperatorReassign(false);
  }, [showEditModal, editPlaza?.id]);

  const filtered = plazas.filter((p) => {
    const matchFilter = filter === "all" || p.status === filter;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.route.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all:         plazas.length,
    active:      plazas.filter((p) => p.status === "active").length,
    inactive:    plazas.filter((p) => p.status === "inactive").length,
    maintenance: plazas.filter((p) => p.status === "maintenance").length,
  };

  const activeOperators = React.useMemo(() => {
    const filtered = operators.filter((operator) => operator.status === "active");
    const selectedCreate = operators.find((operator) => operator.userId === newOperatorId) ?? null;
    const selectedEdit = operators.find((operator) => operator.userId === editOperatorId) ?? null;
    const withCreate = selectedCreate && !filtered.some((operator) => operator.userId === selectedCreate.userId)
      ? [selectedCreate, ...filtered]
      : filtered;
    const withEdit = selectedEdit && !withCreate.some((operator) => operator.userId === selectedEdit.userId)
      ? [selectedEdit, ...withCreate]
      : withCreate;
    return withEdit;
  }, [editOperatorId, newOperatorId, operators]);

  const handleAction = (action: string, plaza: TollPlaza) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (action === "edit") {
      console.log("Edit Plaza Loaded Data", plaza);
      setEditPlaza(plaza);
      setShowEditModal(true);

    } else if (action === "activate") {
      Alert.alert("Activate Plaza", `Activate "${plaza.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Activate",
          onPress: async () => {
            try {
              await updatePlaza(plaza.id, { status: "active" });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              console.error("[admin-toll-plazas] activate error:", e);
                Alert.alert("Unable to update plaza", formatErrorForAlert(e, "Unable to update this plaza. Please try again."));
            }
          },
        },
      ]);

    } else if (action === "deactivate") {
      Alert.alert(
        "Deactivate Plaza",
        `Deactivate "${plaza.name}"? This will stop all active operations at this plaza.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Deactivate",
            style: "destructive",
            onPress: async () => {
              try {
                await updatePlaza(plaza.id, { status: "inactive" });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch (e) {
                console.error("[admin-toll-plazas] deactivate error:", e);
                Alert.alert("Unable to update plaza", formatErrorForAlert(e, "Unable to update this plaza. Please try again."));
              }
            },
          },
        ]
      );

    } else if (action === "monitor") {
      setMonitorPlaza(plaza);
      setShowMonitorModal(true);

    } else if (action === "delete") {
      Alert.alert(
        "Delete Toll Plaza",
        `Permanently delete "${plaza.name}" (${plaza.id})? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deletePlaza(plaza.id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {
                console.error("[admin-toll-plazas] delete error:", e);
                Alert.alert("Delete failed", formatErrorForAlert(e, "Unable to delete this plaza. Please try again."));
              }
            },
          },
        ],
      );
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { Alert.alert("Error", "Plaza name is required"); return; }
    if (!editPlaza) return;
    setSaving(true);
    try {
      console.log("Current State Values", {
        editLatitude,
        editLongitude,
        editRadius,
        editName,
        editRoute,
        editLocation,
        editOperatorId,
      });
      const trimmedLatitude = editLatitude.trim();
      const trimmedLongitude = editLongitude.trim();
      const parsedLatitude = trimmedLatitude ? Number.parseFloat(trimmedLatitude) : editPlaza.latitude ?? null;
      const parsedLongitude = trimmedLongitude ? Number.parseFloat(trimmedLongitude) : editPlaza.longitude ?? null;
      const parsedRadius = editRadius.trim() ? Number.parseFloat(editRadius) : editPlaza.radiusMeters ?? 300;
      const plazaData = {
        name: editName.trim(),
        route: editRoute.trim() || editPlaza.route,
        location: editLocation.trim() || editPlaza.location,
        latitude: Number.isFinite(parsedLatitude) ? parsedLatitude : editPlaza.latitude ?? null,
        longitude: Number.isFinite(parsedLongitude) ? parsedLongitude : editPlaza.longitude ?? null,
        radiusMeters: Number.isFinite(parsedRadius) ? parsedRadius : editPlaza.radiusMeters ?? 300,
        operatorId: editOperatorId ? editOperatorId.toUpperCase() : "",
        operatorName: editOperatorId ? (operators.find((operator) => operator.userId === editOperatorId)?.name ?? editPlaza.operatorName) : "Unassigned",
        reassignOperator: editOperatorReassign,
      };
      console.log("Payload Before Save", plazaData);
      console.log("Saving Plaza", plazaData);
      const response = await updatePlaza(editPlaza.id, {
        ...plazaData,
      });
      console.log("API Response", response);
      await refresh();
      setShowEditModal(false);
      setEditPlaza(null);
      setEditOperatorId("");
      setEditOperatorReassign(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("[admin-toll-plazas] updatePlaza error:", e);
      Alert.alert("Unable to update plaza", formatErrorForAlert(e, "Unable to save these changes. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterPlaza = async () => {
    if (!newName.trim()) { Alert.alert("Error", "Plaza name is required"); return; }
    setSaving(true);
    try {
      const plazaData = {
        name:     newName.trim(),
        route:    newRoute.trim(),
        location: newLocation.trim(),
        latitude: newLatitude.trim() ? Number(newLatitude) : null,
        longitude: newLongitude.trim() ? Number(newLongitude) : null,
        radiusMeters: newRadius.trim() ? Number(newRadius) : 300,
        operatorId: newOperatorId ? newOperatorId.toUpperCase() : "",
        operatorName: newOperatorId ? (operators.find((operator) => operator.userId === newOperatorId)?.name ?? "Unassigned") : "Unassigned",
        reassignOperator: newOperatorReassign,
      };
      console.log("Saving Plaza", plazaData);
      const response = await addPlaza(plazaData);
      console.log("Saved Plaza Response", response);
      await refresh();
      setNewName(""); setNewRoute(""); setNewLocation(""); setNewLatitude(""); setNewLongitude(""); setNewRadius("300"); setNewOperatorId("");
      setNewOperatorReassign(false);
      setShowAddModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("[admin-toll-plazas] addPlaza error:", e);
      Alert.alert("Unable to add plaza", formatErrorForAlert(e, "Unable to register this plaza. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Toll Plaza Management" showBack onBack={() => router.back()} />

        {!apiOnline && apiError ? (
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
                Offline mode active - changes will sync when connection returns.
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{apiError}</Text>
              <TouchableOpacity
                style={{ marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.destructive }}
                onPress={() => { void refresh(); }}
              >
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Retry</Text>
              </TouchableOpacity>
            </View>
        ) : null}

        {loading && plazas.length === 0 && !apiError && (
          <View style={{ padding: 12, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

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

          {filtered.length === 0 && !loading && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Ionicons name="business-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No Plazas Found</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Add Plaza Modal ── */}
        <Modal visible={showAddModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Register New Toll Plaza</Text>
                <TouchableOpacity onPress={() => { setShowAddModal(false); setNewName(""); setNewRoute(""); setNewLocation(""); setNewLatitude(""); setNewLongitude(""); setNewRadius("300"); setNewOperatorId(""); setNewOperatorReassign(false); }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {[
                { label: "Plaza Name *", placeholder: "e.g. NH-48 Gurugram Plaza", value: newName, setter: setNewName },
                { label: "Highway Route", placeholder: "e.g. NH-48", value: newRoute, setter: setNewRoute },
                { label: "Location", placeholder: "e.g. Gurugram, Haryana", value: newLocation, setter: setNewLocation },
                { label: "Latitude", placeholder: "e.g. 19.0760", value: newLatitude, setter: setNewLatitude },
                { label: "Longitude", placeholder: "e.g. 72.8777", value: newLongitude, setter: setNewLongitude },
                { label: "Radius (meters)", placeholder: "e.g. 300", value: newRadius, setter: setNewRadius },
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
              <OperatorPicker
                label="Operator"
                placeholder="Select Operator"
                selectedOperatorId={newOperatorId}
                currentPlazaId=""
                operators={activeOperators}
                onSelect={(operator) => {
                  setNewOperatorId(operator?.userId ?? "");
                  setNewOperatorReassign(Boolean(operator && operator.plazaId && operator.plazaId !== ""));
                }}
              />
              {newOperatorId ? (
                <Text style={[styles.operatorSelectionHint, { color: colors.textMuted }]}>
                  {getOperatorAssignmentLabel(
                    operators.find((operator) => operator.userId === newOperatorId) ?? {
                      id: newOperatorId,
                      userId: newOperatorId,
                      name: "",
                      mobile: "",
                      email: "",
                      plazaId: "",
                      plazaName: "",
                      status: "active",
                      lastLogin: "",
                      loginCount: 0,
                      deviceCount: 0,
                      createdAt: "",
                    },
                    "",
                  )}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: saving ? colors.muted : colors.primary, borderRadius: colors.radius }]}
                onPress={handleRegisterPlaza}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="business-outline" size={18} color="#fff" />
                      <Text style={styles.modalSubmitText}>Register Plaza</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── Edit Plaza Modal ── */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Toll Plaza</Text>
                <TouchableOpacity onPress={() => { setShowEditModal(false); setEditPlaza(null); setEditOperatorId(""); setEditOperatorReassign(false); setEditLatitude(""); setEditLongitude(""); setEditRadius(""); }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {[
                { label: "Plaza Name", placeholder: "e.g. NH-48 Gurugram Plaza", value: editName, setter: setEditName },
                { label: "Highway Route", placeholder: "e.g. NH-48", value: editRoute, setter: setEditRoute },
                { label: "Location", placeholder: "e.g. Gurugram, Haryana", value: editLocation, setter: setEditLocation },
                { label: "Latitude", placeholder: "e.g. 19.0760", value: editLatitude, setter: setEditLatitude },
                { label: "Longitude", placeholder: "e.g. 72.8777", value: editLongitude, setter: setEditLongitude },
                { label: "Radius (meters)", placeholder: "e.g. 300", value: editRadius, setter: setEditRadius },
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
              <OperatorPicker
                label="Operator"
                placeholder="Select Operator"
                selectedOperatorId={editOperatorId}
                currentPlazaId={editPlaza?.id}
                operators={activeOperators}
                onSelect={(operator) => {
                  setEditOperatorId(operator?.userId ?? "");
                  setEditOperatorReassign(Boolean(operator && operator.plazaId && operator.plazaId !== editPlaza?.id));
                }}
              />
              {editOperatorId ? (
                <Text style={[styles.operatorSelectionHint, { color: colors.textMuted }]}>
                  {getOperatorAssignmentLabel(
                    operators.find((operator) => operator.userId === editOperatorId) ?? {
                      id: editOperatorId,
                      userId: editOperatorId,
                      name: "",
                      mobile: "",
                      email: "",
                      plazaId: "",
                      plazaName: "",
                      status: "active",
                      lastLogin: "",
                      loginCount: 0,
                      deviceCount: 0,
                      createdAt: "",
                    },
                    editPlaza?.id,
                  )}
                </Text>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                  onPress={() => { setShowEditModal(false); setEditPlaza(null); setEditOperatorId(""); setEditOperatorReassign(false); setEditLatitude(""); setEditLongitude(""); setEditRadius(""); }}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmit, { backgroundColor: saving ? colors.muted : colors.primary, borderRadius: colors.radius, flex: 1 }]}
                  onPress={handleSaveEdit}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="checkmark-outline" size={18} color="#fff" />
                        <Text style={styles.modalSubmitText}>Save Changes</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Monitor Modal ── */}
        {monitorPlaza && (
          <Modal visible={showMonitorModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.monitorSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.modalHeader}>
                  <View style={styles.monitorTitleWrap}>
                    <Ionicons name="stats-chart" size={18} color="#3B82F6" />
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Live Monitor</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowMonitorModal(false)}>
                    <Ionicons name="close" size={24} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.monitorNameRow, { backgroundColor: "#3B82F611", borderRadius: colors.radius }]}>
                  <MaterialCommunityIcons name="road-variant" size={18} color="#3B82F6" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.monitorPlazaName, { color: colors.foreground }]}>{monitorPlaza.name}</Text>
                    <Text style={[styles.monitorPlazaSub, { color: colors.textMuted }]}>{monitorPlaza.route} • {monitorPlaza.location}</Text>
                    <Text style={[styles.monitorPlazaSub, { color: colors.textMuted }]}>
                      {monitorPlaza.latitude != null && monitorPlaza.longitude != null
                        ? `Lat ${monitorPlaza.latitude.toFixed(4)} · Lon ${monitorPlaza.longitude.toFixed(4)} · Radius ${monitorPlaza.radiusMeters ?? 300}m`
                        : "Geofence coordinates not set"}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: STATUS_META[monitorPlaza.status].color + "22" }]}>
                    <Text style={[styles.statusPillText, { color: STATUS_META[monitorPlaza.status].color }]}>{STATUS_META[monitorPlaza.status].label}</Text>
                  </View>
                </View>

                <View style={styles.monitorGrid}>
                  {[
                    { label: "Total Workers",     value: monitorPlaza.workerCount, icon: "people-outline" as const, color: colors.accent },
                    { label: "Attendance Today",  value: monitorPlaza.workerCount > 0 ? `${monitorPlaza.attendancePct}%` : "—", icon: "checkmark-circle-outline" as const, color: monitorPlaza.attendancePct >= 90 ? colors.success : monitorPlaza.attendancePct >= 75 ? colors.warning : colors.destructive },
                    { label: "Active Devices",    value: monitorPlaza.activeDevices, icon: "phone-portrait-outline" as const, color: colors.warning },
                    { label: "Last Sync",         value: monitorPlaza.lastSync, icon: "sync-outline" as const, color: colors.textSecondary },
                    { label: "Operator",          value: monitorPlaza.operatorName, icon: "person-outline" as const, color: colors.accent },
                    { label: "Created",           value: monitorPlaza.createdAt, icon: "calendar-outline" as const, color: colors.textMuted },
                  ].map(({ label, value, icon, color }) => (
                    <View key={label} style={[styles.monitorStatCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
                      <Ionicons name={icon} size={18} color={color} />
                      <Text style={[styles.monitorStatVal, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
                      <Text style={[styles.monitorStatLabel, { color: colors.textMuted }]}>{label}</Text>
                    </View>
                  ))}
                </View>

                {monitorPlaza.workerCount > 0 && (
                  <View style={styles.monitorBarSection}>
                    <View style={styles.monitorBarHeader}>
                      <Text style={[styles.monitorBarLabel, { color: colors.textSecondary }]}>Attendance Rate</Text>
                      <Text style={[styles.monitorBarPct, { color: monitorPlaza.attendancePct >= 90 ? colors.success : monitorPlaza.attendancePct >= 75 ? colors.warning : colors.destructive }]}>
                        {monitorPlaza.attendanceToday}/{monitorPlaza.workerCount} present
                      </Text>
                    </View>
                    <View style={[styles.monitorBarBg, { backgroundColor: colors.surface }]}>
                      <View style={[styles.monitorBarFill, {
                        width: `${monitorPlaza.attendancePct}%` as never,
                        backgroundColor: monitorPlaza.attendancePct >= 90 ? colors.success : monitorPlaza.attendancePct >= 75 ? colors.warning : colors.destructive,
                      }]} />
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.modalSubmit, { backgroundColor: "#3B82F6", borderRadius: colors.radius }]}
                  onPress={() => setShowMonitorModal(false)}
                >
                  <Ionicons name="checkmark-outline" size={18} color="#fff" />
                  <Text style={styles.modalSubmitText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
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
  operatorName: { fontSize: 13, fontWeight: "600" },
  operatorMeta: { fontSize: 11, fontWeight: "500" },
  cardHeaderActions: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  deleteIconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, padding: 10, gap: 8 },
  actionBtn: { width: "48%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  emptyState: { alignItems: "center", justifyContent: "center", padding: 40, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, gap: 14 },
  monitorSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, gap: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalField: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "500" },
  fieldInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  dropdownTrigger: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dropdownTriggerText: { flex: 1, fontSize: 14, fontWeight: "500" },
  dropdownPanel: { borderWidth: 1, padding: 12, gap: 10 },
  dropdownSearch: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  dropdownSearchInput: { flex: 1, fontSize: 14 },
  dropdownList: { maxHeight: 240 },
  dropdownItem: { borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  dropdownItemTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  dropdownItemTitle: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  dropdownItemSub: { fontSize: 12 },
  dropdownEmpty: { paddingVertical: 18, alignItems: "center", gap: 8 },
  dropdownEmptyText: { fontSize: 12 },
  assignmentBadge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  assignmentBadgeText: { fontSize: 10, fontWeight: "700" },
  operatorSelectionHint: { fontSize: 11, marginTop: -4 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  modalCancelText: { fontSize: 14, fontWeight: "600" },
  modalSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  modalSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  monitorTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  monitorNameRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  monitorPlazaName: { fontSize: 14, fontWeight: "700" },
  monitorPlazaSub: { fontSize: 12 },
  monitorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  monitorStatCard: { width: "47%", padding: 12, borderWidth: 1, gap: 4, alignItems: "flex-start" },
  monitorStatVal: { fontSize: 15, fontWeight: "700" },
  monitorStatLabel: { fontSize: 11 },
  monitorBarSection: { gap: 8 },
  monitorBarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monitorBarLabel: { fontSize: 13, fontWeight: "500" },
  monitorBarPct: { fontSize: 13, fontWeight: "700" },
  monitorBarBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  monitorBarFill: { height: 8, borderRadius: 4 },
});
