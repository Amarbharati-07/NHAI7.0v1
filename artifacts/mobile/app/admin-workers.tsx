import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  RefreshControl,
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
import { getAllWorkers, getAttendanceStats, Worker } from "@/services/database";
import { MOCK_TOLL_PLAZAS } from "@/services/adminData";
import { useColors } from "@/hooks/useColors";

const DEPT_COLORS: Record<string, string> = {
  Civil: "#3B82F6", Electrical: "#F59E0B", Plumbing: "#10B981",
  Security: "#EF4444", Admin: "#0B5EA8", Default: "#607A9B",
};

function WorkerRow({ worker, onAction }: { worker: Worker & { presentToday?: boolean }; onAction: (action: string, w: Worker) => void }) {
  const colors = useColors();
  const deptColor = DEPT_COLORS[worker.department] ?? DEPT_COLORS.Default;
  return (
    <View style={[styles.workerCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.workerRow}>
        <View style={[styles.deptBadge, { backgroundColor: deptColor + "22" }]}>
          <Text style={[styles.deptBadgeText, { color: deptColor }]}>{worker.department.slice(0, 3).toUpperCase()}</Text>
        </View>
        <View style={styles.workerInfo}>
          <Text style={[styles.workerName, { color: colors.foreground }]}>{worker.fullName}</Text>
          <Text style={[styles.workerId, { color: colors.textMuted }]}>{worker.workerId} • {worker.contractorName}</Text>
          <Text style={[styles.workerSite, { color: colors.textMuted }]}>{worker.siteLocation} • {worker.employeeType}</Text>
        </View>
        <View style={styles.workerRight}>
          {worker.presentToday !== undefined && (
            <View style={[styles.attendancePill, { backgroundColor: worker.presentToday ? colors.successBg : colors.destructive + "22" }]}>
              <View style={[styles.attDot, { backgroundColor: worker.presentToday ? colors.success : colors.destructive }]} />
              <Text style={[styles.attText, { color: worker.presentToday ? colors.success : colors.destructive }]}>
                {worker.presentToday ? "Present" : "Absent"}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={() => onAction("history", worker)}>
          <Ionicons name="calendar-outline" size={13} color={colors.accent} />
          <Text style={[styles.actionBtnText, { color: colors.accent }]}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#3B82F622" }]} onPress={() => onAction("transfer", worker)}>
          <Ionicons name="swap-horizontal-outline" size={13} color="#3B82F6" />
          <Text style={[styles.actionBtnText, { color: "#3B82F6" }]}>Transfer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#F59E0B22" }]} onPress={() => onAction("reenroll", worker)}>
          <Ionicons name="refresh-circle-outline" size={13} color="#F59E0B" />
          <Text style={[styles.actionBtnText, { color: "#F59E0B" }]}>Re-Enroll</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.destructive + "18" }]} onPress={() => onAction("deactivate", worker)}>
          <Ionicons name="ban-outline" size={13} color={colors.destructive} />
          <Text style={[styles.actionBtnText, { color: colors.destructive }]}>Deactivate</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminWorkersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0 });
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [transferTo, setTransferTo] = useState("");

  const load = useCallback(async () => {
    const [ws, s] = await Promise.all([getAllWorkers(), getAttendanceStats()]);
    setWorkers(ws);
    setStats({ total: s.total, present: s.present, absent: s.absent });
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const departments = ["All", ...Array.from(new Set(workers.map((w) => w.department)))];

  const filtered = workers.filter((w) => {
    const matchDept = deptFilter === "All" || w.department === deptFilter;
    const matchSearch = w.fullName.toLowerCase().includes(search.toLowerCase()) ||
      w.workerId.toLowerCase().includes(search.toLowerCase()) ||
      w.siteLocation.toLowerCase().includes(search.toLowerCase());
    return matchDept && matchSearch;
  });

  const handleAction = (action: string, w: Worker) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "history") router.push({ pathname: "/worker-details", params: { workerId: String(w.id) } });
    else if (action === "transfer") { setSelectedWorker(w); setShowTransferModal(true); }
    else if (action === "reenroll") Alert.alert("Re-Enroll Worker", `Re-enroll "${w.fullName}" for face capture?`, [{ text: "Cancel" }, { text: "Re-Enroll", onPress: () => router.push({ pathname: "/face-capture", params: { workerId: String(w.id) } }) }]);
    else if (action === "deactivate") Alert.alert("Deactivate Worker", `Deactivate "${w.fullName}"?\nAll future attendance will be disabled.`, [{ text: "Cancel" }, { text: "Deactivate", style: "destructive" }]);
  };

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Worker Management" showBack onBack={() => router.back()} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* KPI Row */}
          <View style={styles.kpiRow}>
            {[
              { label: "Total Workers", val: stats.total, color: colors.accent, icon: "people-outline" as const },
              { label: "Present Today", val: stats.present, color: colors.success, icon: "checkmark-circle-outline" as const },
              { label: "Absent Today", val: stats.absent, color: colors.destructive, icon: "close-circle-outline" as const },
            ].map((k, i) => (
              <View key={i} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={[styles.kpiIcon, { backgroundColor: k.color + "22" }]}>
                  <Ionicons name={k.icon} size={18} color={k.color} />
                </View>
                <Text style={[styles.kpiVal, { color: colors.foreground }]}>{k.val}</Text>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Search */}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search by name, ID, site..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>}
          </View>

          {/* Department Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deptScroll}>
            {departments.map((dept) => {
              const color = dept === "All" ? colors.accent : (DEPT_COLORS[dept] ?? DEPT_COLORS.Default);
              return (
                <TouchableOpacity
                  key={dept}
                  style={[styles.deptPill, { backgroundColor: deptFilter === dept ? color + "22" : colors.card, borderColor: deptFilter === dept ? color + "55" : colors.border, borderRadius: 99 }]}
                  onPress={() => { setDeptFilter(dept); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.deptPillText, { color: deptFilter === dept ? color : colors.textMuted }]}>{dept}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsCount, { color: colors.textMuted }]}>{filtered.length} worker{filtered.length !== 1 ? "s" : ""}</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]} onPress={() => router.push("/register-worker")}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Register Worker</Text>
            </TouchableOpacity>
          </View>

          {filtered.map((w) => <WorkerRow key={w.id} worker={w} onAction={handleAction} />)}

          {filtered.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No workers found</Text>
            </View>
          )}
        </ScrollView>

        {/* Transfer Modal */}
        <Modal visible={showTransferModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Transfer Worker</Text>
                <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {selectedWorker && (
                <View style={[styles.transferWorkerInfo, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.workerName, { color: colors.foreground }]}>{selectedWorker.fullName}</Text>
                    <Text style={[styles.workerId, { color: colors.textMuted }]}>{selectedWorker.workerId} • Current: {selectedWorker.siteLocation}</Text>
                  </View>
                </View>
              )}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Transfer to Plaza</Text>
              {MOCK_TOLL_PLAZAS.filter((p) => p.status === "active").map((plaza) => (
                <TouchableOpacity
                  key={plaza.id}
                  style={[styles.plazaOption, { backgroundColor: transferTo === plaza.id ? colors.primary + "22" : colors.surface, borderColor: transferTo === plaza.id ? colors.primary : colors.border, borderRadius: 8 }]}
                  onPress={() => { setTransferTo(plaza.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons name="business-outline" size={16} color={transferTo === plaza.id ? colors.accent : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.plazaOptionText, { color: colors.foreground }]}>{plaza.name}</Text>
                    <Text style={[styles.workerId, { color: colors.textMuted }]}>{plaza.location}</Text>
                  </View>
                  {transferTo === plaza.id && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={() => {
                  if (!transferTo) { Alert.alert("Error", "Please select a destination plaza"); return; }
                  const plaza = MOCK_TOLL_PLAZAS.find((p) => p.id === transferTo);
                  Alert.alert("Success", `${selectedWorker?.fullName} transferred to ${plaza?.name}`);
                  setTransferTo(""); setSelectedWorker(null); setShowTransferModal(false);
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
                <Text style={styles.modalSubmitText}>Confirm Transfer</Text>
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
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, alignItems: "center", padding: 12, borderWidth: 1, gap: 5 },
  kpiIcon: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  kpiVal: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 10, textAlign: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  deptScroll: { gap: 8, paddingBottom: 4 },
  deptPill: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  deptPillText: { fontSize: 13, fontWeight: "600" },
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultsCount: { fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  workerCard: { borderWidth: 1, overflow: "hidden" },
  workerRow: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 10 },
  deptBadge: { width: 44, height: 44, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  deptBadgeText: { fontSize: 12, fontWeight: "800" },
  workerInfo: { flex: 1, gap: 3 },
  workerName: { fontSize: 14, fontWeight: "700" },
  workerId: { fontSize: 12 },
  workerSite: { fontSize: 11 },
  workerRight: { alignItems: "flex-end" },
  attendancePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  attDot: { width: 5, height: 5, borderRadius: 3 },
  attText: { fontSize: 11, fontWeight: "600" },
  actionsRow: { flexDirection: "row", borderTopWidth: 1, padding: 8, gap: 6 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 7, borderRadius: 7 },
  actionBtnText: { fontSize: 11, fontWeight: "600" },
  emptyState: { alignItems: "center", padding: 40, borderWidth: 1, gap: 10 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderWidth: 1, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  transferWorkerInfo: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1 },
  fieldLabel: { fontSize: 13, fontWeight: "500" },
  plazaOption: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderWidth: 1, marginBottom: 6 },
  plazaOptionText: { fontSize: 13, fontWeight: "600" },
  modalSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  modalSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
