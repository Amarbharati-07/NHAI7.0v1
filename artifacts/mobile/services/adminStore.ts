import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TollPlaza, AdminOperator, SecurityEvent, AuditLog } from "./adminData";
import {
  apiDeletePath,
  apiGetJson,
  apiPostJson,
  apiPutJson,
  isApiConfigured,
} from "./apiConfig";

const PLAZAS_KEY = "@spectra_plazas_v4";
const OPERATORS_KEY = "@spectra_operators_v4";
const SEEDED_KEY = "@spectra_admin_seeded_v4";

/* ─── Row normalisation — API shape → app interface ─── */

function normalisePlaza(p: any): TollPlaza {
  return {
    id: p.plazaId ?? p.id ?? "",
    name: p.name ?? "",
    route: p.route ?? "",
    location: p.location ?? "",
    operatorId: p.operatorId ?? "",
    operatorName: p.operatorName ?? "Unassigned",
    workerCount: p.workerCount ?? 0,
    activeDevices: p.activeDevices ?? 0,
    attendanceToday: p.attendanceToday ?? 0,
    attendancePct: p.attendancePct ?? 0,
    status: (p.status as TollPlaza["status"]) ?? "inactive",
    lastSync: p.lastSync ?? "Never",
    createdAt: p.createdAt
      ? new Date(p.createdAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  };
}

function normaliseOperator(o: any): AdminOperator {
  return {
    id: o.userId ?? o.id ?? "",
    userId: o.userId ?? o.id ?? "",
    name: o.name ?? "",
    mobile: o.mobile ?? "",
    email: o.email ?? "",
    plazaId: o.plazaId ?? "",
    plazaName: o.plazaName ?? "Unassigned",
    status: (o.status as AdminOperator["status"]) ?? "pending",
    lastLogin: o.lastLogin ?? "Never",
    loginCount: o.loginCount ?? 0,
    deviceCount: o.deviceCount ?? 0,
    createdAt: o.createdAt
      ? new Date(o.createdAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  };
}

/* ─── Demo seed (only when EXPO_PUBLIC_API_URL is not set) ─── */

const SEED_PLAZAS: TollPlaza[] = [
  {
    id: "PLZ001",
    name: "NH-48 Gurugram Plaza",
    route: "NH-48",
    location: "Gurugram, Haryana",
    operatorId: "OPR001",
    operatorName: "Rajan Mehta",
    workerCount: 32,
    activeDevices: 2,
    attendanceToday: 30,
    attendancePct: 94,
    status: "active",
    lastSync: "10 mins ago",
    createdAt: "2024-01-15",
  },
  {
    id: "PLZ002",
    name: "NH-8 Manesar Plaza",
    route: "NH-8",
    location: "Manesar, Haryana",
    operatorId: "OPR002",
    operatorName: "Kavita Joshi",
    workerCount: 28,
    activeDevices: 2,
    attendanceToday: 24,
    attendancePct: 86,
    status: "active",
    lastSync: "25 mins ago",
    createdAt: "2024-02-01",
  },
];

const SEED_OPERATORS: AdminOperator[] = [
  {
    id: "OPR001",
    userId: "OPR001",
    name: "Rajan Mehta",
    mobile: "9811234567",
    email: "rajan@nhai.in",
    plazaId: "PLZ001",
    plazaName: "NH-48 Gurugram Plaza",
    status: "active",
    lastLogin: "Today, 08:15 AM",
    loginCount: 142,
    deviceCount: 1,
    createdAt: "2024-01-15",
  },
];

async function ensureDemoSeeded(): Promise<void> {
  const seeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (seeded) return;
  await AsyncStorage.multiSet([
    [PLAZAS_KEY, JSON.stringify(SEED_PLAZAS)],
    [OPERATORS_KEY, JSON.stringify(SEED_OPERATORS)],
    [SEEDED_KEY, "1"],
  ]);
}

async function readCache<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

function nowDate(): string {
  return new Date().toISOString().split("T")[0];
}

/** One-time removal of offline demo seed when switching to API mode. */
async function clearLegacyDemoCache(): Promise<void> {
  const seeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (!seeded) return;
  await AsyncStorage.multiRemove([SEEDED_KEY, PLAZAS_KEY, OPERATORS_KEY]);
}

/** Load from API and refresh offline cache (API mode only). */
async function syncPlazasFromApi(): Promise<TollPlaza[]> {
  const plazas = (await apiGetJson<any[]>("admin/plazas")).map(normalisePlaza);
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas));
  return plazas;
}

async function syncOperatorsFromApi(): Promise<AdminOperator[]> {
  const ops = (await apiGetJson<any[]>("admin/operators")).map(normaliseOperator);
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(ops));
  return ops;
}

/* ─── Toll Plaza CRUD ─── */

export async function getTollPlazas(): Promise<TollPlaza[]> {
  if (isApiConfigured()) {
    await clearLegacyDemoCache();
    return await syncPlazasFromApi();
  }
  await ensureDemoSeeded();
  return (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
}

export async function addTollPlaza(
  data: Pick<TollPlaza, "name" | "route" | "location">,
): Promise<{ plaza: TollPlaza; plazas: TollPlaza[] }> {
  if (isApiConfigured()) {
    const apiRow = await apiPostJson<any>("admin/plazas", {
      ...data,
      performedBy: "ADMIN",
    });
    const plaza = normalisePlaza(apiRow);
    const plazas = await syncPlazasFromApi();
    return { plaza: plazas.find((p) => p.id === plaza.id) ?? plaza, plazas };
  }

  const plazas = await getTollPlazas();
  const nums = plazas
    .map((x) => parseInt(x.id.replace("PLZ", ""), 10))
    .filter((n) => !isNaN(n));
  const nextId = `PLZ${String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  const plaza: TollPlaza = {
    id: nextId,
    name: data.name,
    route: data.route || "—",
    location: data.location || "—",
    operatorId: "",
    operatorName: "Unassigned",
    workerCount: 0,
    activeDevices: 0,
    attendanceToday: 0,
    attendancePct: 0,
    status: "inactive",
    lastSync: "Never",
    createdAt: nowDate(),
  };
  const next = [...plazas, plaza];
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(next));
  return { plaza, plazas: next };
}

export async function updateTollPlaza(
  id: string,
  changes: Partial<TollPlaza>,
): Promise<TollPlaza[] | void> {
  if (isApiConfigured()) {
    await apiPutJson(`admin/plazas/${encodeURIComponent(id)}`, {
      ...changes,
      performedBy: "ADMIN",
    });
    return syncPlazasFromApi();
  }

  const plazas = await getTollPlazas();
  await AsyncStorage.setItem(
    PLAZAS_KEY,
    JSON.stringify(plazas.map((p) => (p.id === id ? { ...p, ...changes } : p))),
  );
}

export async function deleteTollPlaza(id: string): Promise<TollPlaza[] | void> {
  if (isApiConfigured()) {
    const result = await apiDeletePath(
      `admin/plazas/${encodeURIComponent(id)}?performedBy=ADMIN`,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    return syncPlazasFromApi();
  }

  const plazas = await getTollPlazas();
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas.filter((p) => p.id !== id)));
}

export async function deleteAdminDevice(deviceId: string): Promise<void> {
  if (isApiConfigured()) {
    await apiDeletePath(`admin/devices/${encodeURIComponent(deviceId)}?performedBy=ADMIN`);
  }
}

/* ─── Operator CRUD ─── */

export async function getOperators(): Promise<AdminOperator[]> {
  if (isApiConfigured()) {
    await clearLegacyDemoCache();
    return await syncOperatorsFromApi();
  }
  await ensureDemoSeeded();
  return (await readCache<AdminOperator[]>(OPERATORS_KEY)) ?? [];
}

export type CreateOperatorPayload = Omit<
  AdminOperator,
  "id" | "createdAt" | "lastLogin" | "loginCount" | "deviceCount"
> & { password: string };

export async function addOperator(
  data: CreateOperatorPayload,
): Promise<{ operator: AdminOperator; operators: AdminOperator[] }> {
  const { password, ...operatorFields } = data;

  if (isApiConfigured()) {
    const apiRow = await apiPostJson<any>("admin/operators", {
      ...operatorFields,
      userId: operatorFields.userId.toUpperCase(),
      password,
      performedBy: "ADMIN",
    });
    const created = normaliseOperator(apiRow);
    const operators = await syncOperatorsFromApi();
    return {
      operator: operators.find((o) => o.userId === created.userId) ?? created,
      operators,
    };
  }

  const ops = await getOperators();
  const op: AdminOperator = {
    id: data.userId.toUpperCase(),
    userId: data.userId.toUpperCase(),
    name: data.name,
    mobile: data.mobile,
    email: data.email,
    plazaId: data.plazaId,
    plazaName: data.plazaName,
    status: data.status ?? "active",
    lastLogin: "Never",
    loginCount: 0,
    deviceCount: 0,
    createdAt: nowDate(),
  };
  const operators = [op, ...ops];
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(operators));
  return { operator: op, operators };
}

export type UpdateOperatorPayload = Partial<AdminOperator> & { password?: string };

export async function updateOperator(
  id: string,
  changes: UpdateOperatorPayload,
): Promise<AdminOperator[] | void> {
  const userId = id.toUpperCase();
  const { password, ...localChanges } = changes;
  const body: Record<string, unknown> = { ...localChanges, performedBy: "ADMIN" };
  if (password) body.password = password;

  if (isApiConfigured()) {
    await apiPutJson(`admin/operators/${encodeURIComponent(userId)}`, body);
    return syncOperatorsFromApi();
  }

  const ops = await getOperators();
  const operators = ops.map((o) =>
    o.id === userId || o.userId === userId ? { ...o, ...localChanges } : o,
  );
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(operators));
  return operators;
}

export async function deleteOperator(id: string): Promise<AdminOperator[] | void> {
  const userId = id.toUpperCase();

  if (isApiConfigured()) {
    const result = await apiDeletePath(
      `admin/operators/${encodeURIComponent(userId)}?performedBy=ADMIN`,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    return syncOperatorsFromApi();
  }

  const ops = await getOperators();
  const operators = ops.filter((o) => o.id !== userId && o.userId !== userId);
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(operators));
  return operators;
}

/* ─── Security Events ─── */

export async function getSecurityEvents(): Promise<SecurityEvent[]> {
  if (!isApiConfigured()) return [];
  try {
    const apiData = await apiGetJson<any[]>("admin/security-events");
    return apiData.map((e) => ({
      id: String(e.id ?? ""),
      type: (e.eventType as SecurityEvent["type"]) ?? "unauthorized_device",
      description: e.description ?? "",
      deviceId: e.deviceId ?? undefined,
      operatorId: e.operatorId ?? undefined,
      operatorName: e.operatorName ?? undefined,
      severity: (e.severity as SecurityEvent["severity"]) ?? "medium",
      timestamp: e.createdAt ? new Date(e.createdAt).toLocaleString("en-IN") : "Unknown",
      resolved: Boolean(e.resolved),
    }));
  } catch {
    return [];
  }
}

export async function resolveSecurityEvent(id: string): Promise<void> {
  if (!isApiConfigured()) return;
  await apiPutJson(`admin/security-events/${id}/resolve`, { performedBy: "ADMIN" });
}

/* ─── Audit Logs ─── */

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (!isApiConfigured()) return [];
  try {
    const apiData = await apiGetJson<any[]>("admin/audit-logs");
    return apiData.map((l) => ({
      id: String(l.id ?? ""),
      action: l.action ?? "",
      performedBy: l.performedBy ?? "",
      targetType: l.targetType ?? "",
      targetId: l.targetId ?? "",
      details: l.details ?? "",
      timestamp: l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "Unknown",
    }));
  } catch {
    return [];
  }
}
