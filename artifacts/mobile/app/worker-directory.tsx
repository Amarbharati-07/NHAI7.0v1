import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
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
import {
  Worker,
  WorkerStatus,
  getWorkers,
  getWorkersByPlaza,
  setWorkerStatus,
} from "@/services/database";

type StatusFilter = "all" | WorkerStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "transferred", label: "Transferred" },
];

const STATUS_COLORS: Record<WorkerStatus, { bg: string; text: string }> = {
  active: { bg: "#D1FAE5", text: "#059669" },
  inactive: { bg: "#FEE2E2", text: "#DC2626" },
  transferred: { bg: "#FEF3C7", text: "#D97706" },
};

function WorkerCard({
  worker,
  onView,
  onEdit,
  onReenroll,
  onHistory,
  onDeactivate,
}: {
  worker: Worker;
  onView: () => void;
  onEdit: () => void;
  onReenroll: () => void;
  onHistory: () => void;
  onDeactivate: () => void;
}) {
  const colors = useColors();
  const status = (worker.status ?? "active") as WorkerStatus;
  const sc = STATUS_COLORS[status];

  return (
    <View style={[card.root, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      {/* Top row */}
      <View style={card.topRow}>
        <View style={[card.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Ionicons name="person" size={22} color={colors.accent} />
        </View>
        <View style={card.info}>
          <Text style={[card.name, { color: colors.foreground }]} numberOfLines={1}>{worker.fullName}</Text>
          <Text style={[card.sub, { color: colors.textSecondary }]}>{worker.workerId} • {worker.department}</Text>
          <Text style={[card.contractor, { color: colors.textMuted }]} numberOfLines={1}>{worker.contractorName || "No contractor"}</Text>
        </View>
        <View style={[card.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[card.statusText, { color: sc.text }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={[card.divider, { backgroundColor: colors.border }]} />
      <View style={card.actions}>
        <ActionBtn icon="eye-outline" label="View" color={colors.accent} onPress={onView} />
        <ActionBtn icon="create-outline" label="Edit" color="#3B82F6" onPress={onEdit} />
        <ActionBtn icon="scan-outline" label="Re-enroll" color="#8B5CF6" onPress={onReenroll} />
        <ActionBtn icon="calendar-outline" label="History" color="#0D9488" onPress={onHistory} />
        <ActionBtn
          icon={status === "active" ? "person-remove-outline" : "person-add-outline"}
          label={status === "active" ? "Deactivate" : "Activate"}
          color={status === "active" ? "#DC2626" : "#059669"}
          onPress={onDeactivate}
        />
      </View>
    </View>
  );
}

function ActionBtn({
  icon, label, color, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[ab.btn, { backgroundColor: color + "15" }]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[ab.label, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const ab = StyleSheet.create({
  btn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, gap: 3 },
  label: { fontSize: 9, fontWeight: "600" },
});

const card = StyleSheet.create({
  root: { borderWidth: 1, overflow: "hidden" },
  topRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12 },
  contractor: { fontSize: 11 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1 },
  actions: { flexDirection: "row", padding: 10, gap: 6 },
});

export default function WorkerDirectoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    try {
      let data: Worker[];
      if (user?.plazaId) {
        data = await getWorkersByPlaza(user.plazaId, statusFilter === "all" ? undefined : statusFilter);
      } else {
        data = await getWorkers();
        if (statusFilter !== "all") data = data.filter((w) => (w.status ?? "active") === statusFilter);
      }
      setWorkers(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [user?.plazaId, statusFilter]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const filtered = workers.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.fullName.toLowerCase().includes(q) || w.workerId.toLowerCase().includes(q);
  });

  const handleDeactivate = useCallback((worker: Worker) => {
    const id = worker.id!;
    const currentStatus = (worker.status ?? "active") as WorkerStatus;
    const isActive = currentStatus === "active";
    const newStatus: WorkerStatus = isActive ? "inactive" : "active";
    const actionLabel = isActive ? "deactivate" : "reactivate";

    Alert.alert(
      isActive ? "Deactivate Worker" : "Reactivate Worker",
      isActive
        ? `Are you sure you want to deactivate ${worker.fullName}? They will no longer be able to record attendance. No records will be deleted.`
        : `Reactivate ${worker.fullName}? Their status will be set back to Active.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isActive ? "Deactivate" : "Reactivate",
          style: isActive ? "destructive" : "default",
          onPress: async () => {
            try {
              await setWorkerStatus(id, newStatus, user?.name ?? "Operator");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              load();
            } catch {
              Alert.alert("Error", `Failed to ${actionLabel} worker.`);
            }
          },
        },
      ]
    );
  }, [user?.name, load]);

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  if (loading) {
    return (
      <DrawerOverlay>
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <AppHeader title="Worker Directory" showBack onBack={() => router.back()} />
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        </View>
      </DrawerOverlay>
    );
  }

  return (
    <DrawerOverlay>
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Worker Directory" showBack onBack={() => router.back()} />

        {/* Search + Filter bar */}
        <View style={[s.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[s.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[s.searchInput, { color: colors.foreground }]}
              placeholder="Search by name or Worker ID…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Status filter tabs */}
          <View style={s.filterTabs}>
            {STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterTab, {
                  backgroundColor: statusFilter === f.key ? colors.primary : colors.surface,
                  borderColor: statusFilter === f.key ? colors.primary : colors.border,
                }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStatusFilter(f.key); }}
                activeOpacity={0.8}
              >
                <Text style={[s.filterTabText, { color: statusFilter === f.key ? "#fff" : colors.textSecondary }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <WorkerCard
              worker={item}
              onView={() => router.push({ pathname: "/worker-profile", params: { id: String(item.id) } } as never)}
              onEdit={() => router.push({ pathname: "/edit-worker", params: { id: String(item.id) } } as never)}
              onReenroll={() => router.push({ pathname: "/worker-profile", params: { id: String(item.id), tab: "reenroll" } } as never)}
              onHistory={() => router.push({ pathname: "/worker-profile", params: { id: String(item.id), tab: "history" } } as never)}
              onDeactivate={() => handleDeactivate(item)}
            />
          )}
          contentContainerStyle={[s.list, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View style={s.listHeader}>
              <Text style={[s.countText, { color: colors.textSecondary }]}>
                {filtered.length} worker{filtered.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : ""}
              </Text>
              <TouchableOpacity
                style={[s.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/register-worker" as never)}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add-outline" size={14} color="#fff" />
                <Text style={s.addBtnText}>Add Worker</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>No workers found</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {search ? "Try a different search term" : "Register workers to see them here"}
              </Text>
            </View>
          }
        />
      </View>
    </DrawerOverlay>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: { padding: 12, gap: 10, borderBottomWidth: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 42, borderWidth: 1, borderRadius: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  filterTabs: { flexDirection: "row", gap: 6 },
  filterTab: { flex: 1, paddingVertical: 7, borderRadius: 99, borderWidth: 1, alignItems: "center" },
  filterTabText: { fontSize: 12, fontWeight: "600" },
  list: { padding: 12, gap: 10 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  countText: { fontSize: 12 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 13, textAlign: "center" },
});
