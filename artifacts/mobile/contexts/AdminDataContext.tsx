import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import type { TollPlaza, AdminOperator } from "@/services/adminData";
import type { RegisteredDevice, OperatorAllocation } from "@/services/deviceService";
import * as adminStore from "@/services/adminStore";
import type { AdminStats } from "@/services/adminStore";
import { isApiConfigured, withTimeout } from "@/services/apiConfig";
import {
  getRegisteredDevices,
  getAllocations,
  deleteRegisteredDevice,
} from "@/services/deviceService";
import { getAttendanceStats, getSyncStats, initDatabase } from "@/services/database";
import { friendlyConnectionMessage, friendlyErrorMessage, isTechnicalErrorMessage } from "@/services/userMessages";

/* ─── Types ─── */

export interface AdminKpis {
  totalPlazas: number;
  activePlazas: number;
  totalOperators: number;
  activeOperators: number;
  totalWorkers: number;
  presentToday: number;
  absentToday: number;
  activeDevices: number;
  unauthorizedAttempts: number;
  pendingSync: number;
}

interface AttendanceKpis {
  activeWorkers: number;
  present: number;
  absent: number;
  pendingSync: number;
}

const EMPTY_ATTENDANCE: AttendanceKpis = {
  activeWorkers: 0,
  present: 0,
  absent: 0,
  pendingSync: 0,
};

/** Matches Device Management "Registered" count — all devices except fully inactive. */
function countActiveDevices(devices: RegisteredDevice[]): number {
  return devices.filter((d) => d.status !== "inactive").length;
}

function preferApiCount(apiCount: number | undefined, localCount: number): number {
  if (typeof apiCount !== "number") return localCount;
  return apiCount > 0 ? apiCount : localCount;
}

function countDevicesForPlaza(plaza: TollPlaza, devices: RegisteredDevice[]): number {
  return devices.filter((device) => {
    const matchesPlaza =
      (device.assignedPlazaId && device.assignedPlazaId === plaza.id) ||
      (device.assignedPlazaName && device.assignedPlazaName === plaza.name);
    return matchesPlaza && device.status !== "inactive";
  }).length;
}

function countDevicesForOperator(operator: AdminOperator, allocations: OperatorAllocation[]): number {
  return allocations.filter((alloc) => alloc.operatorId === operator.userId && alloc.status === "active").length;
}

function enrichPlazasWithDeviceCounts(plazas: TollPlaza[], devices: RegisteredDevice[]): TollPlaza[] {
  return plazas.map((plaza) => ({
    ...plaza,
    activeDevices: countDevicesForPlaza(plaza, devices),
  }));
}

function enrichOperatorsWithDeviceCounts(operators: AdminOperator[], allocations: OperatorAllocation[]): AdminOperator[] {
  return operators.map((operator) => ({
    ...operator,
    deviceCount: countDevicesForOperator(operator, allocations),
  }));
}

function dedupeAllocationsForUi(allocations: OperatorAllocation[]): OperatorAllocation[] {
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

function buildKpis(
  plazas: TollPlaza[],
  operators: AdminOperator[],
  devices: RegisteredDevice[],
  attendance: AttendanceKpis,
  dashboardStats?: AdminStats | null,
): AdminKpis {
  const totalWorkers = attendance.activeWorkers;
  return {
    totalPlazas: preferApiCount(dashboardStats?.totalPlazas, plazas.length),
    activePlazas: preferApiCount(dashboardStats?.activePlazas, plazas.filter((x) => x.status === "active").length),
    totalOperators: preferApiCount(dashboardStats?.totalOperators, operators.length),
    activeOperators: preferApiCount(dashboardStats?.activeOperators, operators.filter((x) => x.status === "active").length),
    totalWorkers,
    presentToday: totalWorkers === 0 ? 0 : attendance.present,
    absentToday: totalWorkers === 0 ? 0 : attendance.absent,
    activeDevices: preferApiCount(dashboardStats?.activeDevices, countActiveDevices(devices)),
    unauthorizedAttempts: dashboardStats?.unauthorizedAttempts ?? 0,
    pendingSync: attendance.pendingSync,
  };
}

function isConnectivityError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  return (
    isTechnicalErrorMessage(message) ||
    lower.includes("cannot reach api") ||
    lower.includes("timed out") ||
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("offline")
  );
}

interface AdminDataContextType {
  plazas: TollPlaza[];
  operators: AdminOperator[];
  devices: RegisteredDevice[];
  allocations: OperatorAllocation[];
  kpis: AdminKpis;
  loading: boolean;
  refreshing: boolean;
  apiOnline: boolean;
  apiError: string | null;
  refresh: () => Promise<void>;
  getPlazaById: (id: string) => Promise<TollPlaza | null>;
  addPlaza: (
    data: Pick<
      TollPlaza,
      "name" | "route" | "location" | "latitude" | "longitude" | "radiusMeters" | "operatorId" | "operatorName"
    > & { reassignOperator?: boolean },
  ) => Promise<TollPlaza>;
  updatePlaza: (id: string, changes: Partial<TollPlaza> & { reassignOperator?: boolean }) => Promise<TollPlaza[] | void>;
  deletePlaza: (id: string) => Promise<void>;
  addOperator: (data: import("@/services/adminStore").CreateOperatorPayload) => Promise<AdminOperator>;
  updateOperatorData: (
    id: string,
    changes: import("@/services/adminStore").UpdateOperatorPayload,
  ) => Promise<void>;
  deleteOperator: (id: string) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;
}

const EMPTY_KPIS = buildKpis([], [], [], EMPTY_ATTENDANCE);

const AdminDataContext = createContext<AdminDataContextType>({
  plazas: [],
  operators: [],
  devices: [],
  allocations: [],
  kpis: EMPTY_KPIS,
  loading: true,
  refreshing: false,
  apiOnline: true,
  apiError: null,
  refresh: async () => {},
  getPlazaById: async () => null,
  addPlaza: async () => ({
    id: "",
    name: "",
    route: "",
    location: "",
    latitude: null,
    longitude: null,
    radiusMeters: 300,
    operatorId: "",
    operatorName: "",
    workerCount: 0,
    activeDevices: 0,
    attendanceToday: 0,
    attendancePct: 0,
    status: "inactive",
    lastSync: "Never",
    createdAt: "",
  }),
  updatePlaza: async () => {},
  deletePlaza: async () => {},
  addOperator: async () => ({
    id: "",
    userId: "",
    name: "",
    mobile: "",
    email: "",
    plazaId: "",
    plazaName: "",
    status: "pending",
    lastLogin: "Never",
    loginCount: 0,
    deviceCount: 0,
    createdAt: "",
  }),
  updateOperatorData: async () => {},
  deleteOperator: async () => {},
  deleteDevice: async () => {},
});

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [plazas, setPlazas] = useState<TollPlaza[]>([]);
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [allocations, setAllocations] = useState<OperatorAllocation[]>([]);
  const [dashboardStats, setDashboardStats] = useState<AdminStats | null>(null);
  const [attendanceKpis, setAttendanceKpis] = useState<AttendanceKpis>(EMPTY_ATTENDANCE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const initialLoadDoneRef = useRef(false);

  const kpis = useMemo(
    () => buildKpis(plazas, operators, devices, attendanceKpis, dashboardStats),
    [plazas, operators, devices, attendanceKpis, dashboardStats],
  );

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      console.info("[AdminDataContext] refresh already in progress, returning pending promise");
      return refreshPromiseRef.current;
    }

    const run = (async () => {
      console.info("[AdminDataContext] refresh starting");
      setRefreshing(true);
      try {
        console.info("[AdminDataContext] fetching plazas, operators, devices, allocations");
        const [plazaResult, operatorResult, deviceResult, allocResult, statsResult] = await Promise.allSettled([
          withTimeout(adminStore.getTollPlazas(), 15000, "Load toll plazas"),
          withTimeout(adminStore.getOperators(), 15000, "Load operators"),
          withTimeout(getRegisteredDevices(), 10000, "Load registered devices"),
          withTimeout(getAllocations(), 10000, "Load device allocations"),
          withTimeout(adminStore.getAdminStats(), 15000, "Load admin dashboard stats"),
        ]);

        const nextDevices = deviceResult.status === "fulfilled" ? deviceResult.value : devices;
        const nextAllocations = allocResult.status === "fulfilled" ? dedupeAllocationsForUi(allocResult.value) : allocations;
        if (plazaResult.status === "fulfilled") {
          console.info("[AdminDataContext] setting plazas:", plazaResult.value.length);
          setPlazas(enrichPlazasWithDeviceCounts(plazaResult.value, nextDevices));
        }
        if (operatorResult.status === "fulfilled") {
          console.info("[AdminDataContext] setting operators:", operatorResult.value.length);
          setOperators(enrichOperatorsWithDeviceCounts(operatorResult.value, nextAllocations));
        }
        if (deviceResult.status === "fulfilled") {
          console.info("[AdminDataContext] setting devices:", nextDevices.length);
          setDevices(nextDevices);
        }
        if (allocResult.status === "fulfilled") {
          console.info("[AdminDataContext] setting allocations:", nextAllocations.length);
          setAllocations(nextAllocations);
          console.info("[AdminDataContext] allocated devices list:", nextAllocations.map((allocation) => ({
            id: allocation.id,
            deviceId: allocation.deviceId,
            operatorId: allocation.operatorId,
            plazaId: allocation.plazaId,
            status: allocation.status,
          })));
        }
        if (statsResult.status === "fulfilled") {
          console.info("[AdminDataContext] dashboard stats response:", statsResult.value);
          console.info("[AdminDataContext] plazas count:", statsResult.value.totalPlazas);
          console.info("[AdminDataContext] operators count:", statsResult.value.totalOperators);
          console.info("[AdminDataContext] devices count:", statsResult.value.activeDevices);
          setDashboardStats(statsResult.value);
        } else {
          console.warn("[AdminDataContext] dashboard stats unavailable:", statsResult.reason);
          setDashboardStats(null);
        }

        if (plazaResult.status === "rejected") {
          console.warn("[AdminDataContext] plazas fetch failed:", plazaResult.reason);
        }
        if (operatorResult.status === "rejected") {
          console.warn("[AdminDataContext] operators fetch failed:", operatorResult.reason);
        }

        const apiFailed =
          plazaResult.status === "rejected" || operatorResult.status === "rejected";
        const apiSucceeded =
          plazaResult.status === "fulfilled" || operatorResult.status === "fulfilled";

        if (isApiConfigured()) {
          if (apiSucceeded) {
            console.info("[AdminDataContext] API online");
            setApiOnline(true);
            setApiError(null);
          } else if (apiFailed) {
            const apiReason =
              plazaResult.status === "rejected"
                ? plazaResult.reason
                : operatorResult.status === "rejected"
                  ? operatorResult.reason
                  : undefined;
            if (isConnectivityError(apiReason)) {
              console.warn("[AdminDataContext] API offline:", apiReason);
              setApiOnline(false);
              setApiError(friendlyConnectionMessage());
            } else if (apiReason) {
              setApiError(friendlyErrorMessage(apiReason, friendlyConnectionMessage()));
            }
          }
        }

        void (async () => {
          try {
            console.info("[AdminDataContext] loading attendance stats");
            if (Platform.OS !== "web") await initDatabase();
            const [attStats, syncStats] = await withTimeout(
              Promise.all([getAttendanceStats(), getSyncStats()]),
              10000,
              "Load dashboard stats",
            );
            console.info("[AdminDataContext] attendance stats loaded:", { present: attStats.present, absent: attStats.absent });
            setAttendanceKpis({
              activeWorkers: attStats.activeWorkers,
              present: attStats.present,
              absent: attStats.absent,
              pendingSync: syncStats.pending,
            });
          } catch (err) {
            console.warn("[AdminDataContext] attendance/sync stats unavailable:", err);
          }
        })();
      } finally {
        console.info("[AdminDataContext] refresh completed");
        setRefreshing(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = run;
    return run;
  }, []);

  const getPlazaById = useCallback(async (id: string) => {
    return adminStore.getTollPlazaById(id);
  }, []);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    console.info("[AdminDataContext] initial admin data load");
    void refresh()
      .catch(() => {
        console.warn("[AdminDataContext] initial load failed");
      })
      .finally(() => {
        console.info("[AdminDataContext] initial load completed");
        initialLoadDoneRef.current = true;
        setLoading(false);
      });
    // Only run once on mount - don't add refresh to dependencies as it's stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const addPlaza = useCallback(
    async (
      data: Pick<
        TollPlaza,
        "name" | "route" | "location" | "latitude" | "longitude" | "radiusMeters" | "operatorId" | "operatorName"
      > & { reassignOperator?: boolean },
    ) => {
      const { plaza, plazas: next } = await adminStore.addTollPlaza(data);
      setPlazas(next);
      void refresh().catch((err) => {
        console.warn("[AdminDataContext] refresh after add plaza failed:", err);
      });
      return plaza;
    },
    [refresh],
  );

  const updatePlaza = useCallback(
    async (id: string, changes: Partial<TollPlaza> & { reassignOperator?: boolean }) => {
      const { reassignOperator: _ignored, ...plazaChanges } = changes;
      setPlazas((prev) => prev.map((p) => (p.id === id ? { ...p, ...plazaChanges } : p)));
      try {
        const synced = await adminStore.updateTollPlaza(id, changes);
        if (synced) setPlazas(synced);
        return synced;
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const deletePlaza = useCallback(
    async (id: string) => {
      setPlazas((prev) => prev.filter((p) => p.id !== id));
      try {
        const synced = await adminStore.deleteTollPlaza(id);
        if (synced) setPlazas(synced);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const addOperator = useCallback(
    async (data: import("@/services/adminStore").CreateOperatorPayload) => {
      const { operator, operators: next } = await adminStore.addOperator(data);
      setOperators(next);
      await refresh();
      return operator;
    },
    [refresh],
  );

  const updateOperatorData = useCallback(
    async (id: string, changes: import("@/services/adminStore").UpdateOperatorPayload) => {
      const userId = id.toUpperCase();
      setOperators((prev) =>
        prev.map((o) => (o.id === userId || o.userId === userId ? { ...o, ...changes } : o)),
      );
      try {
        const synced = await adminStore.updateOperator(id, changes);
        if (synced) setOperators(synced);
      } finally {
        void refresh().catch((err) => {
          console.warn("[AdminDataContext] refresh after operator update failed:", err);
        });
      }
    },
    [refresh],
  );

  const deleteOperator = useCallback(
    async (id: string) => {
      const userId = id.toUpperCase();
      setOperators((prev) => prev.filter((o) => o.id !== userId && o.userId !== userId));
      try {
        const synced = await adminStore.deleteOperator(id);
        if (synced) setOperators(synced);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const deleteDevice = useCallback(
    async (deviceId: string) => {
      try {
        await adminStore.deleteAdminDevice(deviceId);
        await deleteRegisteredDevice(deviceId);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  return (
    <AdminDataContext.Provider
      value={{
        plazas,
        operators,
        devices,
        allocations,
        kpis,
        loading,
        refreshing,
        apiOnline,
        apiError,
        refresh,
        getPlazaById,
        addPlaza,
        updatePlaza,
        deletePlaza,
        addOperator,
        updateOperatorData,
        deleteOperator,
        deleteDevice,
      }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  return useContext(AdminDataContext);
}
