import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { TollPlaza, AdminOperator } from "@/services/adminData";
import type { RegisteredDevice, OperatorAllocation } from "@/services/deviceService";
import * as adminStore from "@/services/adminStore";
import { getRegisteredDevices, getAllocations } from "@/services/deviceService";
import { getAttendanceStats, getSyncStats } from "@/services/database";

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

const DEFAULT_KPIS: AdminKpis = {
  totalPlazas: 0, activePlazas: 0,
  totalOperators: 0, activeOperators: 0,
  totalWorkers: 0, presentToday: 0, absentToday: 0,
  activeDevices: 0, unauthorizedAttempts: 0, pendingSync: 0,
};

interface AdminDataContextType {
  plazas: TollPlaza[];
  operators: AdminOperator[];
  devices: RegisteredDevice[];
  allocations: OperatorAllocation[];
  kpis: AdminKpis;
  loading: boolean;
  refresh: () => Promise<void>;
  addPlaza: (data: Pick<TollPlaza, "name" | "route" | "location">) => Promise<TollPlaza>;
  updatePlaza: (id: string, changes: Partial<TollPlaza>) => Promise<void>;
  deletePlaza: (id: string) => Promise<void>;
  addOperator: (data: Omit<AdminOperator, "id" | "createdAt" | "lastLogin" | "loginCount" | "deviceCount">) => Promise<AdminOperator>;
  updateOperatorData: (id: string, changes: Partial<AdminOperator>) => Promise<void>;
}

/* ─── Context ─── */

const AdminDataContext = createContext<AdminDataContextType>({
  plazas: [], operators: [], devices: [], allocations: [],
  kpis: DEFAULT_KPIS, loading: true,
  refresh: async () => {},
  addPlaza: async () => ({ id: "", name: "", route: "", location: "", operatorId: "", operatorName: "", workerCount: 0, activeDevices: 0, attendanceToday: 0, attendancePct: 0, status: "inactive", lastSync: "Never", createdAt: "" }),
  updatePlaza: async () => {},
  deletePlaza: async () => {},
  addOperator: async () => ({ id: "", userId: "", name: "", mobile: "", email: "", plazaId: "", plazaName: "", status: "pending", lastLogin: "Never", loginCount: 0, deviceCount: 0, createdAt: "" }),
  updateOperatorData: async () => {},
});

/* ─── Provider ─── */

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [plazas, setPlazas]           = useState<TollPlaza[]>([]);
  const [operators, setOperators]     = useState<AdminOperator[]>([]);
  const [devices, setDevices]         = useState<RegisteredDevice[]>([]);
  const [allocations, setAllocations] = useState<OperatorAllocation[]>([]);
  const [kpis, setKpis]               = useState<AdminKpis>(DEFAULT_KPIS);
  const [loading, setLoading]         = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [p, o, d, a, attStats, syncStats] = await Promise.all([
        adminStore.getTollPlazas(),
        adminStore.getOperators(),
        getRegisteredDevices(),
        getAllocations(),
        getAttendanceStats(),
        getSyncStats(),
      ]);
      setPlazas(p);
      setOperators(o);
      setDevices(d);
      setAllocations(a);
      setKpis({
        totalPlazas:          p.length,
        activePlazas:         p.filter((x) => x.status === "active").length,
        totalOperators:       o.length,
        activeOperators:      o.filter((x) => x.status === "active").length,
        totalWorkers:         p.reduce((s, x) => s + (x.workerCount ?? 0), 0),
        presentToday:         attStats.present,
        absentToday:          attStats.absent,
        activeDevices:        a.filter((x) => x.status === "active").length,
        unauthorizedAttempts: 0,
        pendingSync:          syncStats.pending,
      });
      console.log(`[AdminDataContext] refresh complete — plazas:${p.length} ops:${o.length} devices:${d.length} allocs:${a.length}`);
    } catch (err) {
      console.error("[AdminDataContext] refresh error:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /* ─── Plaza mutations ─── */

  const addPlaza = useCallback(async (data: Pick<TollPlaza, "name" | "route" | "location">) => {
    console.log("[AdminDataContext] addPlaza →", data.name);
    const plaza = await adminStore.addTollPlaza(data);
    await refresh();
    return plaza;
  }, [refresh]);

  const updatePlaza = useCallback(async (id: string, changes: Partial<TollPlaza>) => {
    console.log("[AdminDataContext] updatePlaza →", id, JSON.stringify(changes));
    await adminStore.updateTollPlaza(id, changes);
    await refresh();
  }, [refresh]);

  const deletePlaza = useCallback(async (id: string) => {
    await adminStore.deleteTollPlaza(id);
    await refresh();
  }, [refresh]);

  /* ─── Operator mutations ─── */

  const addOperator = useCallback(async (data: Omit<AdminOperator, "id" | "createdAt" | "lastLogin" | "loginCount" | "deviceCount">) => {
    console.log("[AdminDataContext] addOperator →", data.name);
    const op = await adminStore.addOperator(data);
    await refresh();
    return op;
  }, [refresh]);

  const updateOperatorData = useCallback(async (id: string, changes: Partial<AdminOperator>) => {
    console.log("[AdminDataContext] updateOperator →", id, JSON.stringify(changes));
    await adminStore.updateOperator(id, changes);
    await refresh();
  }, [refresh]);

  return (
    <AdminDataContext.Provider value={{
      plazas, operators, devices, allocations, kpis, loading,
      refresh,
      addPlaza, updatePlaza, deletePlaza,
      addOperator, updateOperatorData,
    }}>
      {children}
    </AdminDataContext.Provider>
  );
}

/* ─── Hook ─── */

export function useAdminData() {
  return useContext(AdminDataContext);
}
