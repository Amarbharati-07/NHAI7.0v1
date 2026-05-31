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
import { checkApiHealth, getApiBase, isApiConfigured } from "@/services/apiConfig";
import {
  getRegisteredDevices,
  getAllocations,
  deleteRegisteredDevice,
} from "@/services/deviceService";
import { getAttendanceStats, getSyncStats, initDatabase } from "@/services/database";

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

function buildKpis(
  plazas: TollPlaza[],
  operators: AdminOperator[],
  devices: RegisteredDevice[],
  attendance: AttendanceKpis,
): AdminKpis {
  const totalWorkers = attendance.activeWorkers;
  return {
    totalPlazas: plazas.length,
    activePlazas: plazas.filter((x) => x.status === "active").length,
    totalOperators: operators.length,
    activeOperators: operators.filter((x) => x.status === "active").length,
    totalWorkers,
    presentToday: totalWorkers === 0 ? 0 : attendance.present,
    absentToday: totalWorkers === 0 ? 0 : attendance.absent,
    activeDevices: countActiveDevices(devices),
    unauthorizedAttempts: 0,
    pendingSync: attendance.pendingSync,
  };
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
  addPlaza: (data: Pick<TollPlaza, "name" | "route" | "location">) => Promise<TollPlaza>;
  updatePlaza: (id: string, changes: Partial<TollPlaza>) => Promise<void>;
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
  addPlaza: async () => ({
    id: "",
    name: "",
    route: "",
    location: "",
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
  const [attendanceKpis, setAttendanceKpis] = useState<AttendanceKpis>(EMPTY_ATTENDANCE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const initialLoadDoneRef = useRef(false);

  const kpis = useMemo(
    () => buildKpis(plazas, operators, devices, attendanceKpis),
    [plazas, operators, devices, attendanceKpis],
  );

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const run = (async () => {
      setRefreshing(true);
      try {
        const healthPromise = isApiConfigured()
          ? checkApiHealth().catch(() => false)
          : Promise.resolve(true);

        const [plazaResult, operatorResult, deviceResult, allocResult, apiOk] =
          await Promise.all([
            Promise.allSettled([
              adminStore.getTollPlazas(),
              adminStore.getOperators(),
              getRegisteredDevices(),
              getAllocations(),
            ]),
            healthPromise,
          ]).then(([results, ok]) => [...results, ok] as const);

        if (isApiConfigured()) {
          setApiOnline(apiOk);
          setApiError(
            apiOk ? null : `Cannot reach API at ${getApiBase()}. Start the API server on your Mac.`,
          );
        }

        if (plazaResult.status === "fulfilled") setPlazas(plazaResult.value);
        if (operatorResult.status === "fulfilled") setOperators(operatorResult.value);
        if (deviceResult.status === "fulfilled") setDevices(deviceResult.value);
        if (allocResult.status === "fulfilled") setAllocations(allocResult.value);

        if (plazaResult.status === "rejected") {
          console.error("[AdminDataContext] plazas fetch error:", plazaResult.reason);
        }
        if (operatorResult.status === "rejected") {
          console.error("[AdminDataContext] operators fetch error:", operatorResult.reason);
        }

        if (isApiConfigured() && plazaResult.status === "fulfilled") {
          setApiOnline(true);
          setApiError(null);
        }

        try {
          if (Platform.OS !== "web") await initDatabase();
          const [attStats, syncStats] = await Promise.all([
            getAttendanceStats(),
            getSyncStats(),
          ]);
          setAttendanceKpis({
            activeWorkers: attStats.activeWorkers,
            present: attStats.present,
            absent: attStats.absent,
            pendingSync: syncStats.pending,
          });
        } catch (statsErr) {
          console.error("[AdminDataContext] attendance/sync stats error:", statsErr);
        }
      } catch (err) {
        console.error("[AdminDataContext] refresh error:", err);
        if (isApiConfigured()) {
          setApiOnline(false);
          setApiError(err instanceof Error ? err.message : "API unavailable");
        }
      } finally {
        setRefreshing(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    refresh().finally(() => {
      initialLoadDoneRef.current = true;
      setLoading(false);
    });
  }, [refresh]);


  const addPlaza = useCallback(
    async (data: Pick<TollPlaza, "name" | "route" | "location">) => {
      const { plaza, plazas: next } = await adminStore.addTollPlaza(data);
      setPlazas(next);
      await refresh();
      return plaza;
    },
    [refresh],
  );

  const updatePlaza = useCallback(
    async (id: string, changes: Partial<TollPlaza>) => {
      setPlazas((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
      try {
        const synced = await adminStore.updateTollPlaza(id, changes);
        if (synced) setPlazas(synced);
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
        await refresh();
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
