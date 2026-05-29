import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/AppHeader";
import DrawerOverlay from "@/components/DrawerOverlay";
import { AttendanceRecord, getAttendanceHistory } from "@/services/database";
import { useColors } from "@/hooks/useColors";

type StatusFilter = "all" | "present" | "absent";

export default function AttendanceHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  /* Stable refs so input fields never lose focus on re-renders */
  const nameRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAttendanceHistory();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Stable handlers */
  const onChangeName = useCallback((t: string) => setSearchName(t), []);
  const onChangeDate = useCallback((t: string) => setSearchDate(t), []);

  const filtered = records.filter((r) => {
    if (searchName && !r.workerName?.toLowerCase().includes(searchName.toLowerCase())) return false;
    if (searchDate && !r.date.includes(searchDate)) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const renderItem = ({ item }: { item: AttendanceRecord }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
        <Ionicons name="person" size={20} color={colors.accent} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]}>{item.workerName}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{item.workerIdCode} • {item.date}</Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>{item.time !== "00:00" ? item.time : "—"}</Text>
      </View>
      <View style={styles.right}>
        <View style={[styles.pill, { backgroundColor: item.status === "present" ? colors.successBg : colors.destructive + "22" }]}>
          <Text style={[styles.pillText, { color: item.status === "present" ? colors.success : colors.destructive }]}>
            {item.status === "present" ? "Present" : "Absent"}
          </Text>
        </View>
        <View style={[styles.syncPill, { backgroundColor: item.syncStatus === "synced" ? colors.accent + "22" : colors.warningBg }]}>
          <Text style={[styles.syncText, { color: item.syncStatus === "synced" ? colors.accent : colors.warning }]}>
            {item.syncStatus === "synced" ? "Synced" : "Pending"}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <DrawerOverlay>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppHeader title="Attendance History" showBack />
        <View style={[styles.filterArea, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {/* Name search */}
          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              ref={nameRef}
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search by name…"
              placeholderTextColor={colors.mutedForeground}
              value={searchName}
              onChangeText={onChangeName}
              returnKeyType="search"
            />
            {searchName ? (
              <TouchableOpacity onPress={() => setSearchName("")}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Date search */}
          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <TextInput
              ref={dateRef}
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Filter by date (YYYY-MM-DD)…"
              placeholderTextColor={colors.mutedForeground}
              value={searchDate}
              onChangeText={onChangeDate}
              returnKeyType="search"
            />
            {searchDate ? (
              <TouchableOpacity onPress={() => setSearchDate("")}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Status tabs */}
          <View style={styles.statusTabs}>
            {(["all", "present", "absent"] as StatusFilter[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.statusTab, { backgroundColor: statusFilter === s ? colors.primary : colors.surface, borderColor: statusFilter === s ? colors.primary : colors.border }]}
                onPress={() => setStatusFilter(s)}
                activeOpacity={0.8}
              >
                <Text style={[styles.statusTabText, { color: statusFilter === s ? "#fff" : colors.textSecondary }]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No attendance records found</Text>
              </View>
            }
            ListHeaderComponent={
              <Text style={[styles.countText, { color: colors.textSecondary }]}>
                {filtered.length} record{filtered.length !== 1 ? "s" : ""} found
              </Text>
            }
          />
        )}
      </View>
    </DrawerOverlay>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterArea: { padding: 12, gap: 10, borderBottomWidth: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 42, borderWidth: 1, borderRadius: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  statusTabs: { flexDirection: "row", gap: 8 },
  statusTab: { flex: 1, paddingVertical: 8, borderRadius: 99, borderWidth: 1, alignItems: "center" },
  statusTabText: { fontSize: 13, fontWeight: "600" },
  list: { padding: 12, gap: 10 },
  countText: { fontSize: 12, marginBottom: 4 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: "600" },
  sub: { fontSize: 12 },
  time: { fontSize: 11 },
  right: { alignItems: "flex-end", gap: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: "700" },
  syncPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  syncText: { fontSize: 10, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14 },
});
