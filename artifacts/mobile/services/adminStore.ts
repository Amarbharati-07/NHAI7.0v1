import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TollPlaza, AdminOperator, SecurityEvent, AuditLog } from "./adminData";
import {
  apiDeletePath,
  apiGetJson,
  apiPostJson,
  assertApiDatabaseReady,
  apiPutJson,
  isApiConfigured,
} from "./apiConfig";
import { getRegisteredDevices } from "./deviceService";

const PLAZAS_KEY = "@spectra_plazas_v4";
const OPERATORS_KEY = "@spectra_operators_v4";
const SEEDED_KEY = "@spectra_admin_seeded_v4";

export interface AdminStats {
  totalPlazas: number;
  activePlazas: number;
  totalOperators: number;
  activeOperators: number;
  activeDevices: number;
  unauthorizedAttempts: number;
}

/* ─── Row normalisation — API shape → app interface ─── */

function normalisePlaza(p: any): TollPlaza {
  const latitudeValue = p.latitude ?? p.lat ?? p.plazaLatitude ?? null;
  const longitudeValue = p.longitude ?? p.lon ?? p.plazaLongitude ?? null;
  const radiusValue = p.radiusMeters ?? p.radius_meters ?? p.plazaRadiusMeters ?? 300;
  const plaza: TollPlaza = {
    id: p.plazaId ?? p.id ?? "",
    name: p.name ?? "",
    route: p.route ?? "",
    location: p.location ?? "",
    latitude: latitudeValue === "" || latitudeValue == null ? null : Number(latitudeValue),
    longitude: longitudeValue === "" || longitudeValue == null ? null : Number(longitudeValue),
    radiusMeters: radiusValue === "" || radiusValue == null ? 300 : Number(radiusValue),
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
  console.log("Loaded Plaza", {
    plazaId: plaza.id,
    latitude: plaza.latitude,
    longitude: plaza.longitude,
    radiusMeters: plaza.radiusMeters,
  });
  return plaza;
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
    latitude: 28.4595,
    longitude: 77.0266,
    radiusMeters: 300,
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
    latitude: 28.3489,
    longitude: 76.9356,
    radiusMeters: 300,
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

function normalizeOperatorId(value: string | undefined | null): string {
  return String(value ?? "").trim().toUpperCase();
}

async function syncLocalOperatorAssignment(
  plazaId: string,
  plazaName: string,
  nextOperatorId: string,
  nextOperatorName: string,
  previousOperatorId: string = "",
  allowReassignment = false,
): Promise<void> {
  const normalizedPlazaId = String(plazaId ?? "").trim();
  const normalizedNextOperatorId = normalizeOperatorId(nextOperatorId);
  const normalizedNextOperatorName = String(nextOperatorName ?? "").trim() || "Unassigned";
  const normalizedPreviousOperatorId = normalizeOperatorId(previousOperatorId);

  const plazas = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
  const conflict = plazas.find((plaza) => normalizeOperatorId(plaza.operatorId) === normalizedNextOperatorId && plaza.id !== normalizedPlazaId);
  if (normalizedNextOperatorId && conflict && !allowReassignment) {
    throw new Error(`Operator ${normalizedNextOperatorId} is already assigned to ${conflict.name}`);
  }

  const updatedPlazas = plazas.map((plaza) => {
    if (plaza.id === normalizedPlazaId) {
      return {
        ...plaza,
        operatorId: normalizedNextOperatorId,
        operatorName: normalizedNextOperatorId ? normalizedNextOperatorName : "Unassigned",
      };
    }

    if (normalizedNextOperatorId && normalizeOperatorId(plaza.operatorId) === normalizedNextOperatorId) {
      return {
        ...plaza,
        operatorId: "",
        operatorName: "Unassigned",
      };
    }

    return plaza;
  });
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(updatedPlazas));

  const operators = (await readCache<AdminOperator[]>(OPERATORS_KEY)) ?? [];
  const updatedOperators = operators.map((operator) => {
    const operatorUserId = normalizeOperatorId(operator.userId);
    if (operatorUserId === normalizedNextOperatorId) {
      return {
        ...operator,
        plazaId: normalizedPlazaId,
        plazaName: normalizedNextOperatorId ? plazaName : "Unassigned",
      };
    }

    if (normalizedPreviousOperatorId && normalizedPreviousOperatorId !== normalizedNextOperatorId && operatorUserId === normalizedPreviousOperatorId) {
      return {
        ...operator,
        plazaId: "",
        plazaName: "Unassigned",
      };
    }

    return operator;
  });
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(updatedOperators));
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
  const cached = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
  const cachedById = new Map(cached.map((plaza) => [plaza.id, plaza]));
  const plazas = (await apiGetJson<any[]>("admin/plazas")).map((row) => {
    const fresh = normalisePlaza(row);
    const previous = cachedById.get(fresh.id);
    if (!previous) return fresh;

    const merged: TollPlaza = {
      ...previous,
      ...fresh,
      latitude: fresh.latitude ?? previous.latitude ?? null,
      longitude: fresh.longitude ?? previous.longitude ?? null,
      radiusMeters: fresh.radiusMeters ?? previous.radiusMeters ?? 300,
    };

    if ((previous.latitude != null || previous.longitude != null) && (fresh.latitude == null || fresh.longitude == null)) {
      console.warn("[adminStore] API plaza missing coordinates; preserving cached values", {
        plazaId: fresh.id,
        apiLatitude: fresh.latitude,
        apiLongitude: fresh.longitude,
        cachedLatitude: previous.latitude,
        cachedLongitude: previous.longitude,
      });
    }

    return merged;
  });
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas));
  return plazas;
}

async function syncOperatorsFromApi(): Promise<AdminOperator[]> {
  const ops = (await apiGetJson<any[]>("admin/operators", 15000)).map(normaliseOperator);
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(ops));
  return ops;
}

function buildLocalStats(
  plazas: TollPlaza[],
  operators: AdminOperator[],
  activeDevices: number,
): AdminStats {
  return {
    totalPlazas: plazas.length,
    activePlazas: plazas.filter((plaza) => plaza.status === "active").length,
    totalOperators: operators.length,
    activeOperators: operators.filter((operator) => operator.status === "active").length,
    activeDevices,
    unauthorizedAttempts: 0,
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  if (isApiConfigured()) {
    const stats = await apiGetJson<AdminStats>("admin/stats", 15000);
    const normalized = {
      totalPlazas: Number(stats?.totalPlazas ?? 0),
      activePlazas: Number(stats?.activePlazas ?? 0),
      totalOperators: Number(stats?.totalOperators ?? 0),
      activeOperators: Number(stats?.activeOperators ?? 0),
      activeDevices: Number(stats?.activeDevices ?? 0),
      unauthorizedAttempts: Number(stats?.unauthorizedAttempts ?? 0),
    };
    console.info("[adminStore] dashboard stats response", normalized);
    console.info("[adminStore] plazas count", normalized.totalPlazas);
    console.info("[adminStore] operators count", normalized.totalOperators);
    console.info("[adminStore] devices count", normalized.activeDevices);
    return normalized;
  }

  const [plazas, operators, devices] = await Promise.all([
    getTollPlazas(),
    getOperators(),
    getRegisteredDevices(),
  ]);
  const localStats = buildLocalStats(
    plazas,
    operators,
    devices.filter((device) => device.status !== "inactive").length,
  );
  console.info("[adminStore] dashboard stats response", localStats);
  console.info("[adminStore] plazas count", localStats.totalPlazas);
  console.info("[adminStore] operators count", localStats.totalOperators);
  console.info("[adminStore] devices count", localStats.activeDevices);
  return localStats;
}

/* ─── Toll Plaza CRUD ─── */

export async function getTollPlazas(): Promise<TollPlaza[]> {
  if (isApiConfigured()) {
    try {
      const plazas = await syncPlazasFromApi();
      await clearLegacyDemoCache();
      return plazas;
    } catch (err) {
      console.warn("[adminStore] getTollPlazas API failed, using local cache:", err);
      const cached = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
      return cached;
    }
  }
  await ensureDemoSeeded();
  return (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
}

export async function getTollPlazaById(id: string): Promise<TollPlaza | null> {
  const normalizedId = String(id ?? "").trim();
  if (!normalizedId) return null;

  if (isApiConfigured()) {
    try {
      const cached = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
      const cachedPlaza = cached.find((entry) => entry.id === normalizedId) ?? null;
      const fetched = normalisePlaza(await apiGetJson<any>(`admin/plazas/${encodeURIComponent(normalizedId)}`));
      const plaza: TollPlaza = {
        ...cachedPlaza,
        ...fetched,
        latitude: fetched.latitude ?? cachedPlaza?.latitude ?? null,
        longitude: fetched.longitude ?? cachedPlaza?.longitude ?? null,
        radiusMeters: fetched.radiusMeters ?? cachedPlaza?.radiusMeters ?? 300,
      };
      const next = [...cached.filter((entry) => entry.id !== plaza.id), plaza];
      await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(next));
      return plaza;
    } catch (err) {
      console.warn("[adminStore] getTollPlazaById API failed, using local cache:", err);
      const cached = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
      return cached.find((entry) => entry.id === normalizedId) ?? null;
    }
  }

  const cached = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
  return cached.find((entry) => entry.id === normalizedId) ?? null;
}

async function mergePlazaIntoCache(plaza: TollPlaza): Promise<TollPlaza[]> {
  const cached = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? [];
  const next = [...cached.filter((p) => p.id !== plaza.id), plaza];
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(next));
  return next;
}

export async function addTollPlaza(
  data: Pick<
    TollPlaza,
    "name" | "route" | "location" | "latitude" | "longitude" | "radiusMeters" | "operatorId" | "operatorName"
  > & { reassignOperator?: boolean },
): Promise<{ plaza: TollPlaza; plazas: TollPlaza[] }> {
  if (isApiConfigured()) {
    await assertApiDatabaseReady();
    console.log("Saving Plaza", data);
    const apiRow = await apiPostJson<any>(
      "admin/plazas",
      {
        ...data,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        radiusMeters: data.radiusMeters ?? 300,
        operatorId: data.operatorId ?? "",
        operatorName: data.operatorName ?? "Unassigned",
        reassignOperator: Boolean(data.reassignOperator),
        performedBy: "ADMIN001",
      },
      30_000,
    );
    console.log("Saved Plaza Response", apiRow);
    const plaza = normalisePlaza(apiRow);
    const plazas = await mergePlazaIntoCache(plaza);
    void syncPlazasFromApi().catch((err) => {
      console.warn("[adminStore] addTollPlaza background sync failed:", err);
    });
    return { plaza, plazas };
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
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    radiusMeters: data.radiusMeters ?? 300,
    operatorId: normalizeOperatorId(data.operatorId),
    operatorName: normalizeOperatorId(data.operatorId) ? data.operatorName : "Unassigned",
    workerCount: 0,
    activeDevices: 0,
    attendanceToday: 0,
    attendancePct: 0,
    status: "inactive",
    lastSync: "Never",
    createdAt: nowDate(),
  };
  if (plaza.operatorId) {
    const conflict = plazas.find((entry) => normalizeOperatorId(entry.operatorId) === plaza.operatorId);
    if (conflict && conflict.id !== plaza.id && !data.reassignOperator) {
      throw new Error(`Operator ${plaza.operatorId} is already assigned to ${conflict.name}`);
    }
  }
  const next = [...plazas, plaza];
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(next));
  if (plaza.operatorId) {
    await syncLocalOperatorAssignment(plaza.id, plaza.name, plaza.operatorId, plaza.operatorName, "", Boolean(data.reassignOperator));
  }
  const reconciledPlazas = (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? next;
  return {
    plaza: reconciledPlazas.find((entry) => entry.id === plaza.id) ?? plaza,
    plazas: reconciledPlazas,
  };
}

export async function updateTollPlaza(
  id: string,
  changes: Partial<TollPlaza> & { reassignOperator?: boolean },
): Promise<TollPlaza[] | void> {
  const { reassignOperator, ...updateChanges } = changes;
  if (isApiConfigured()) {
    console.log("Saving Plaza", {
      id,
      ...updateChanges,
      reassignOperator,
    });
    const apiPayload: Record<string, unknown> = {
      ...updateChanges,
      reassignOperator: Boolean(reassignOperator),
      performedBy: "ADMIN",
    };
    if (updateChanges.latitude !== undefined) apiPayload.latitude = updateChanges.latitude;
    if (updateChanges.longitude !== undefined) apiPayload.longitude = updateChanges.longitude;
    if (updateChanges.radiusMeters !== undefined) apiPayload.radiusMeters = updateChanges.radiusMeters;
    const apiRow = await apiPutJson<any>(`admin/plazas/${encodeURIComponent(id)}`, {
      ...apiPayload,
    }, 15000);
    console.log("API Response", apiRow);
    const savedPlaza = normalisePlaza(apiRow ?? {
      plazaId: id,
      id,
      ...updateChanges,
      latitude: updateChanges.latitude ?? null,
      longitude: updateChanges.longitude ?? null,
      radiusMeters: updateChanges.radiusMeters ?? 300,
    });
    const mergedPlazaList = await mergePlazaIntoCache(savedPlaza);
    console.log("Saved Plaza Response", mergedPlazaList.find((plaza) => plaza.id === id) ?? null);
    void syncPlazasFromApi().catch((err) => {
      console.warn("[adminStore] updateTollPlaza background sync failed:", err);
    });
    return mergedPlazaList;
  }

  const plazas = await getTollPlazas();
  const existing = plazas.find((p) => p.id === id);
  const previousOperatorId = existing?.operatorId ?? "";
  const nextOperatorId = updateChanges.operatorId !== undefined ? normalizeOperatorId(updateChanges.operatorId) : existing?.operatorId ?? "";
  if (nextOperatorId) {
    const conflict = plazas.find((entry) => normalizeOperatorId(entry.operatorId) === nextOperatorId && entry.id !== id);
    if (conflict && !reassignOperator) {
      throw new Error(`Operator ${nextOperatorId} is already assigned to ${conflict.name}`);
    }
  }
  const next = plazas.map((p) => {
    if (p.id !== id) return p;
    return {
      ...p,
      ...updateChanges,
      operatorId: updateChanges.operatorId !== undefined ? normalizeOperatorId(updateChanges.operatorId) : p.operatorId,
      operatorName:
        updateChanges.operatorId !== undefined
          ? (normalizeOperatorId(updateChanges.operatorId) ? updateChanges.operatorName ?? "Unassigned" : "Unassigned")
          : (updateChanges.operatorName ?? p.operatorName),
    };
  });
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(next));
  const updatedPlaza = next.find((p) => p.id === id);
  if (updatedPlaza && (updateChanges.operatorId !== undefined || updateChanges.operatorName !== undefined)) {
    await syncLocalOperatorAssignment(
      updatedPlaza.id,
      updatedPlaza.name,
      updatedPlaza.operatorId,
      updatedPlaza.operatorName,
      previousOperatorId,
      Boolean(reassignOperator),
    );
  }
  return (await readCache<TollPlaza[]>(PLAZAS_KEY)) ?? next;
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
    try {
      const operators = await syncOperatorsFromApi();
      await clearLegacyDemoCache();
      return operators;
    } catch (err) {
      console.warn("[adminStore] getOperators API failed, using local cache:", err);
      return [];
    }
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
    }, 15000);
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
    await apiPutJson(`admin/operators/${encodeURIComponent(userId)}`, body, 15000);
    return;
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
